import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import Booking from "../../models/Booking.js";
import Review from "../../models/Review.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import { isSalonOwner, isSalonAdmin } from "../../utils/salonPermissions.js";
import { getOrCreateDefaultSubscriptionPlan, getDaysRemaining } from "../subscriptionService.js";
import {
  getRelationshipType,
  isAcceptedStaffMember,
} from "./salonRelationshipService.js";

export class DashboardError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "DashboardError";
    this.statusCode = statusCode;
  }
}

const getBookingRevenueAmount = (booking) => {
  const finalPrice = Number(booking?.finalPrice);
  const hasDiscountMarker = Boolean(
    booking?.promotionId ||
      booking?.voucherId ||
      booking?.promotionCode ||
      booking?.voucherCode ||
      Number(booking?.discountAmount || booking?.voucherDiscount || 0) > 0
  );
  if (
    hasDiscountMarker &&
    booking?.finalPrice !== undefined &&
    booking?.finalPrice !== null &&
    Number.isFinite(finalPrice)
  ) {
    return finalPrice;
  }

  const price = Number(booking?.price || booking?.totalPrice || 0);
  return Number.isFinite(price) ? price : 0;
};

/**
 * Get approved salon member IDs, grouped by relationship type.
 */
const getSalonMembers = async (salonId) => {
  const users = await User.find({
    role: "barber",
    $or: [
      { "salons.salon": salonId, "salons.status": "approved" },
      { salon: salonId, salonStatus: "approved" },
    ],
  }).select("_id name avatarUrl profession barberType specialty city salons");

  const staffIds = [];
  const chairRenterIds = [];

  for (const user of users) {
    // Check the salon entry for this specific salon
    let salonEntry = (user.salons || []).find(
      (s) => s.salon?.toString() === salonId.toString() && s.status === "approved"
    );

    if (!salonEntry && user.salonStatus === "approved" && String(user.salon || "") === String(salonId)) {
      salonEntry = {
        salon: salonId,
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "accepted",
      };
    }

    // If no salons array entry but legacy fields match, treat as accepted staff.
    const relationshipType = getRelationshipType(salonEntry);

    if (relationshipType === "chair_renter") {
      chairRenterIds.push(user._id);
    } else if (isAcceptedStaffMember(salonEntry)) {
      staffIds.push(user._id);
    }
  }

  return { staffIds, chairRenterIds };
};

/**
 * Fetch salon subscription summary.
 */
const getSubscriptionSummary = async (salonId, now = new Date()) => {
  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
  }).lean();

  const plan = await getOrCreateDefaultSubscriptionPlan();

  if (!subscription) {
    return {
      status: "none",
      seatCount: 0,
      usedSeats: 0,
      availableSeats: 0,
      daysRemaining: null,
      isExpired: true,
      isExpiringSoon: false,
      renewalRequiredAt: null,
      monthlyTotal: 0,
      pricePerSeat: plan.pricePerSeat,
    };
  }

  const activeSeats = await SubscriptionSeat.countDocuments({
    subscriptionId: subscription._id,
    status: "active",
  });

  const seatCount = Number(subscription.seatCount || 1);
  const currentPeriodEnd = subscription.currentPeriodEnd || subscription.trialEndsAt;
  const daysRemaining = getDaysRemaining(currentPeriodEnd, now);
  const periodEnded = currentPeriodEnd
    ? new Date(currentPeriodEnd).getTime() <= now.getTime()
    : false;
  const isExpired = subscription.status === "expired" || periodEnded;

  return {
    status: subscription.status,
    seatCount,
    usedSeats: activeSeats,
    availableSeats: Math.max(0, seatCount - activeSeats),
    daysRemaining,
    isExpired,
    isExpiringSoon: daysRemaining !== null && daysRemaining <= 7 && !isExpired,
    renewalRequiredAt: currentPeriodEnd || null,
    monthlyTotal: Number(subscription.totalPrice || plan.pricePerSeat * seatCount),
    pricePerSeat: Number(subscription.pricePerSeat || plan.pricePerSeat),
  };
};

/**
 * Get staff summary including chair renter counts.
 */
const getStaffSummary = async (salonId, staffIds, chairRenterIds) => {
  const pendingRequests = await SalonJoinRequest.countDocuments({
    salonId,
    status: "pending",
  });

  // Count staff with subscription seats
  const subscriptions = await Subscription.find({
    ownerType: "salon",
    ownerId: salonId,
  }).lean();

  const subscriptionIds = subscriptions
    .filter((s) => ["active", "trialing"].includes(s.status))
    .map((s) => s._id);

  let staffWithSeat = 0;
  let chairRenterWithSeat = 0;

  if (subscriptionIds.length > 0) {
    const allSeats = await SubscriptionSeat.find({
      subscriptionId: { $in: subscriptionIds },
      status: "active",
    }).lean();

    const barberIdsWithSeats = new Set(allSeats.map((s) => String(s.barberId)));

    staffWithSeat = staffIds.filter((id) => barberIdsWithSeats.has(String(id))).length;
    chairRenterWithSeat = chairRenterIds.filter((id) => barberIdsWithSeats.has(String(id))).length;
  }

  return {
    totalApprovedStaff: staffIds.length,
    totalChairRenters: chairRenterIds.length,
    totalPendingRequests: pendingRequests,
    activeSeatMembers: staffWithSeat + chairRenterWithSeat,
    staffWithoutSeat: staffIds.length - staffWithSeat,
    chairRentersWithoutSeat: chairRenterIds.length - chairRenterWithSeat,
  };
};

/**
 * Get booking summary (staff-only).
 */
const getBookingSummary = async (staffIds, now = new Date()) => {
  if (staffIds.length === 0) {
    return {
      todayBookings: 0,
      upcomingBookingsCount: 0,
      pendingBookings: 0,
      completedThisMonth: 0,
      cancelledThisMonth: 0,
      rejectedThisMonth: 0,
      noShowThisMonth: 0,
      lateCancelledThisMonth: 0,
    };
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const todayKey = todayStart.toISOString().split("T")[0]; // "YYYY-MM-DD"

  const [todayBookings, upcomingBookings, pendingBookings, monthBookings] =
    await Promise.all([
      Booking.countDocuments({
        barberId: { $in: staffIds },
        $or: [{ bookingDate: todayKey }, { dayKey: todayKey }],
        status: { $in: ["confirmed", "in_progress", "completed"] },
      }),
      Booking.countDocuments({
        barberId: { $in: staffIds },
        startTime: { $gte: now },
        status: "confirmed",
      }),
      Booking.countDocuments({
        barberId: { $in: staffIds },
        status: "pending",
      }),
      Booking.find({
        barberId: { $in: staffIds },
        createdAt: { $gte: monthStart, $lte: monthEnd },
      }).lean(),
    ]);

  let completedThisMonth = 0;
  let cancelledThisMonth = 0;
  let rejectedThisMonth = 0;
  let noShowThisMonth = 0;
  let lateCancelledThisMonth = 0;

  for (const booking of monthBookings) {
    switch (booking.status) {
      case "completed":
        completedThisMonth++;
        break;
      case "cancelled":
        cancelledThisMonth++;
        break;
      case "rejected":
        rejectedThisMonth++;
        break;
      case "no_show":
        noShowThisMonth++;
        break;
      case "late_cancelled":
        lateCancelledThisMonth++;
        break;
    }
  }

  return {
    todayBookings,
    upcomingBookingsCount: upcomingBookings,
    pendingBookings,
    completedThisMonth,
    cancelledThisMonth,
    rejectedThisMonth,
    noShowThisMonth,
    lateCancelledThisMonth,
  };
};

/**
 * Get revenue summary (staff-only, completed bookings).
 */
const getRevenueSummary = async (staffIds, now = new Date()) => {
  if (staffIds.length === 0) {
    return { todayRevenue: 0, monthRevenue: 0 };
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const todayKey = todayStart.toISOString().split("T")[0];

  const [todayCompleted, monthCompleted] = await Promise.all([
    Booking.find({
      barberId: { $in: staffIds },
      status: "completed",
      $or: [{ bookingDate: todayKey }, { dayKey: todayKey }],
    }).lean(),
    Booking.find({
      barberId: { $in: staffIds },
      status: "completed",
      updatedAt: { $gte: monthStart, $lte: monthEnd },
    }).lean(),
  ]);

  const todayRevenue = todayCompleted.reduce(
    (sum, b) => sum + getBookingRevenueAmount(b),
    0
  );
  const monthRevenue = monthCompleted.reduce(
    (sum, b) => sum + getBookingRevenueAmount(b),
    0
  );

  return { todayRevenue, monthRevenue };
};

/**
 * Get review summary (staff-only).
 */
const getReviewSummary = async (staffIds) => {
  if (staffIds.length === 0) {
    return { averageRating: 0, totalReviews: 0 };
  }

  const reviews = await Review.find({
    barberId: { $in: staffIds },
  }).lean();

  let totalRating = 0;
  for (const review of reviews) {
    totalRating += Number(review.rating || 0);
  }

  return {
    averageRating: reviews.length > 0 ? totalRating / reviews.length : 0,
    totalReviews: reviews.length,
  };
};

/**
 * Get upcoming bookings (staff-only), next 5.
 */
const getUpcomingBookings = async (staffIds, now = new Date()) => {
  if (staffIds.length === 0) return [];

  const bookings = await Booking.find({
    barberId: { $in: staffIds },
    startTime: { $gte: now },
  })
    .sort({ startTime: 1 })
    .limit(5)
    .populate("barberId", "name")
    .populate("clientId", "name phone")
    .populate("serviceId", "name")
    .lean();

  return bookings.map((b) => ({
    id: b._id,
    clientName: b.clientId?.name || "Unknown",
    barberName: b.barberId?.name || "Unknown",
    serviceName: b.serviceId?.name || "Unknown",
    date: b.bookingDate || b.dayKey || "",
    time: b.startTime || b.time || "",
    status: b.status,
  }));
};

/**
 * Get alerts for the salon dashboard.
 */
const getAlerts = async (
  salonId,
  subscriptionSummary,
  staffSummary,
  staffIds,
  now = new Date()
) => {
  const alerts = [];

  // Subscription expired
  if (subscriptionSummary.isExpired) {
    alerts.push({
      type: "subscription_expired",
      severity: "error",
      message: "Salon subscription has expired. Members may lose access.",
    });
  }

  // Subscription expiring soon
  if (subscriptionSummary.isExpiringSoon) {
    alerts.push({
      type: "subscription_expiring_soon",
      severity: "warning",
      message: `Salon subscription expires in ${subscriptionSummary.daysRemaining} days.`,
    });
  }

  // Pending join requests
  if (staffSummary.totalPendingRequests > 0) {
    alerts.push({
      type: "pending_join_requests",
      severity: "info",
      message: `${staffSummary.totalPendingRequests} pending salon join request(s).`,
    });
  }

  // Pending bookings for staff
  const pendingBookings = await Booking.countDocuments({
    barberId: { $in: staffIds },
    status: "pending",
  });
  if (pendingBookings > 0) {
    alerts.push({
      type: "pending_bookings",
      severity: "info",
      message: `${pendingBookings} pending booking(s) for salon staff.`,
    });
  }

  // Staff without subscription seat
  if (staffSummary.staffWithoutSeat > 0) {
    alerts.push({
      type: "staff_without_seat",
      severity: "warning",
      message: `${staffSummary.staffWithoutSeat} staff member(s) without an active subscription seat.`,
    });
  }

  // No active salon subscription
  if (!subscriptionSummary.status || subscriptionSummary.status === "none") {
    alerts.push({
      type: "no_subscription",
      severity: "error",
      message: "No active salon subscription. Members cannot access platform features.",
    });
  }

  return alerts;
};

/**
 * Main dashboard fetch function.
 */
export const getSalonDashboard = async (salonId, requestingUserId, now = new Date()) => {
  const salon = await Salon.findById(salonId);
  if (!salon) {
    throw new DashboardError(404, "Salon not found");
  }

  // Authorization: only owner/admin can access dashboard
  const requester = await User.findById(requestingUserId).select("_id");
  if (!requester) {
    throw new DashboardError(401, "Authentication required");
  }

  const isOwner = isSalonOwner(salon, requestingUserId);
  const isAdmin = isSalonAdmin(salon, requestingUserId);

  if (!isOwner && !isAdmin) {
    throw new DashboardError(403, "Only salon owner or admin can access the dashboard");
  }

  // Get staff members grouped by relationship type
  const { staffIds, chairRenterIds } = await getSalonMembers(salonId);

  // Build dashboard data
  const [subscriptionSummary, staffSummary] = await Promise.all([
    getSubscriptionSummary(salonId, now),
    getStaffSummary(salonId, staffIds, chairRenterIds),
  ]);

  const [
    bookingSummary,
    revenueSummary,
    reviewSummary,
    upcomingBookings,
    alerts,
  ] = await Promise.all([
    getBookingSummary(staffIds, now),
    getRevenueSummary(staffIds, now),
    getReviewSummary(staffIds),
    getUpcomingBookings(staffIds, now),
    getAlerts(salonId, subscriptionSummary, staffSummary, staffIds, now),
  ]);

  return {
    salon: {
      id: salon._id,
      name: salon.name,
      city: salon.city,
      address: salon.address,
      phone: salon.phone,
      imageUrl: salon.imageUrl,
    },
    subscriptionSummary,
    staffSummary,
    bookingSummary,
    revenueSummary,
    reviewSummary,
    upcomingBookings,
    alerts,
  };
};
