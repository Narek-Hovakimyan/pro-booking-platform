import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { isSalonAdmin, isSalonOwner } from "../../utils/salonPermissions.js";
import {
  getRelationshipType,
  isAcceptedStaffMember,
} from "./salonRelationshipService.js";

export class ReportError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ReportError";
    this.statusCode = statusCode;
  }
}

/**
 * Validate and parse date range.
 */
const parseDateRange = (from, to) => {
  if (!from || !to) {
    throw new ReportError(400, "from and to query params are required (YYYY-MM-DD)");
  }

  const fromDate = new Date(from + "T00:00:00.000Z");
  const toDate = new Date(to + "T23:59:59.999Z");

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new ReportError(400, "Invalid date format. Use YYYY-MM-DD.");
  }

  if (fromDate.getTime() > toDate.getTime()) {
    throw new ReportError(400, "from date must be before or equal to to date");
  }

  return { fromDate, toDate, from, to };
};

/**
 * Get approved salon member IDs grouped by relationship type.
 * Reuses the same privacy model as salon dashboard.
 */
const getSalonMembers = async (salonId) => {
  const users = await User.find({
    role: "barber",
    $or: [
      { "salons.salon": salonId, "salons.status": "approved" },
      { salon: salonId, salonStatus: "approved" },
    ],
  }).select("_id name avatarUrl salons salon salonStatus");

  const staffIds = [];
  const chairRenterIds = [];
  const membersById = {};

  for (const user of users) {
    let salonEntry = (user.salons || []).find(
      (s) => s.salon?.toString() === salonId.toString() && s.status === "approved"
    );

    if (
      !salonEntry &&
      user.salonStatus === "approved" &&
      String(user.salon || "") === String(salonId)
    ) {
      salonEntry = {
        salon: salonId,
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "accepted",
      };
    }

    const relationshipType = getRelationshipType(salonEntry);

    if (relationshipType === "chair_renter") {
      chairRenterIds.push(user._id);
      membersById[String(user._id)] = {
        _id: user._id,
        name: user.name,
        avatarUrl: user.avatarUrl || "",
        relationshipType: "chair_renter",
      };
    } else if (isAcceptedStaffMember(salonEntry)) {
      staffIds.push(user._id);
      membersById[String(user._id)] = {
        _id: user._id,
        name: user.name,
        avatarUrl: user.avatarUrl || "",
        relationshipType: "staff",
        relationshipStatus: "accepted",
      };
    }
  }

  return { staffIds, chairRenterIds, membersById };
};

/**
 * Count bookings by status in a given date range for given barber IDs.
 */
const getStatusBreakdown = async (barberIds, fromDate, toDate) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        barberId: { $in: barberIds },
        createdAt: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ];

  const results = await Booking.aggregate(pipeline);
  return results.map((r) => ({ status: r._id, count: r.count }));
};

const revenueAmountExpression = {
  $cond: [
    {
      $and: [
        { $ne: ["$finalPrice", null] },
        {
          $or: [
            { $ne: ["$promotionId", null] },
            { $ne: ["$voucherId", null] },
            { $ne: ["$promotionCode", ""] },
            { $ne: ["$voucherCode", ""] },
            { $gt: [{ $ifNull: [{ $toDouble: "$discountAmount" }, 0] }, 0] },
            { $gt: [{ $ifNull: [{ $toDouble: "$voucherDiscount" }, 0] }, 0] },
          ],
        },
      ],
    },
    { $ifNull: [{ $toDouble: "$finalPrice" }, 0] },
    { $ifNull: [{ $toDouble: "$price" }, 0] },
  ],
};

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
 * Get booking counts by day for given barber IDs in date range.
 */
const getByDayBreakdown = async (barberIds, fromDate, toDate) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        barberId: { $in: barberIds },
        createdAt: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: { $ifNull: ["$bookingDate", "$dayKey"] },
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelled: {
          $sum: {
            $cond: [
              { $in: ["$status", ["cancelled", "late_cancelled"]] },
              1,
              0,
            ],
          },
        },
        noShow: {
          $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] },
        },
        pending: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              revenueAmountExpression,
              0,
            ],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ];

  return await Booking.aggregate(pipeline);
};

/**
 * Get per-staff breakdown for given barber IDs in date range.
 */
const getByStaffBreakdown = async (barberIds, membersById, fromDate, toDate) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        barberId: { $in: barberIds },
        createdAt: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: "$barberId",
        totalBookings: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelled: {
          $sum: {
            $cond: [
              { $in: ["$status", ["cancelled", "late_cancelled"]] },
              1,
              0,
            ],
          },
        },
        noShow: {
          $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] },
        },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              revenueAmountExpression,
              0,
            ],
          },
        },
        uniqueClients: { $addToSet: "$clientId" },
      },
    },
    { $sort: { completed: -1 } },
  ];

  const results = await Booking.aggregate(pipeline);

  return results.map((r) => {
    const member = membersById[String(r._id)];
    return {
      barberId: r._id,
      barberName: member?.name || "Unknown",
      avatarUrl: member?.avatarUrl || "",
      totalBookings: r.totalBookings,
      completed: r.completed,
      cancelled: r.cancelled,
      noShow: r.noShow,
      revenue: r.revenue,
      uniqueClients: r.uniqueClients.length,
    };
  });
};

/**
 * Get top services for given barber IDs in date range.
 */
const getTopServices = async (barberIds, fromDate, toDate) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        barberId: { $in: barberIds },
        createdAt: { $gte: fromDate, $lte: toDate },
        serviceName: { $exists: true, $ne: "" },
      },
    },
    {
      $group: {
        _id: "$serviceName",
        count: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              revenueAmountExpression,
              0,
            ],
          },
        },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ];

  return await Booking.aggregate(pipeline);
};

/**
 * Main report fetch function.
 */
export const getSalonReport = async (
  salonId,
  requestingUserId,
  { from, to, barberId = "" } = {}
) => {
  const salon = await Salon.findById(salonId);
  if (!salon) {
    throw new ReportError(404, "Salon not found");
  }

  // Authorization: only owner/admin
  const requester = await User.findById(requestingUserId).select("_id");
  if (!requester) {
    throw new ReportError(401, "Authentication required");
  }

  const isOwner = isSalonOwner(salon, requestingUserId);
  const isAdmin = isSalonAdmin(salon, requestingUserId);

  if (!isOwner && !isAdmin) {
    throw new ReportError(403, "Only salon owner or admin can access reports");
  }

  const { fromDate, toDate } = parseDateRange(from, to);

  // Get accepted staff members only
  const { staffIds, membersById } = await getSalonMembers(salonId);

  // If barberId filter is provided, validate it's an accepted staff member
  let effectiveStaffIds = staffIds;
  if (barberId) {
    if (!staffIds.some((id) => String(id) === String(barberId))) {
      throw new ReportError(
        400,
        "Selected barber must be an approved staff member with accepted status in this salon"
      );
    }
    effectiveStaffIds = [barberId];
  }

  // Run all aggregations in parallel
  const [
    statusBreakdown,
    byDay,
    byStaff,
    topServices,
    allBookings,
  ] = await Promise.all([
    getStatusBreakdown(effectiveStaffIds, fromDate, toDate),
    getByDayBreakdown(effectiveStaffIds, fromDate, toDate),
    getByStaffBreakdown(effectiveStaffIds, membersById, fromDate, toDate),
    getTopServices(effectiveStaffIds, fromDate, toDate),
    // Fetch all bookings in range for summary
    Booking.find({
      barberId: { $in: effectiveStaffIds },
      createdAt: { $gte: fromDate, $lte: toDate },
    })
      .select(
        "status price finalPrice promotionId voucherId promotionCode voucherCode discountAmount voucherDiscount clientId barberId"
      )
      .lean(),
  ]);

  // Build summary from all bookings
  let completedBookings = 0;
  let pendingBookings = 0;
  let acceptedBookings = 0;
  let cancelledBookings = 0;
  let noShowBookings = 0;
  let lateCancelledBookings = 0;
  let totalRevenue = 0;
  const uniqueClientSet = new Set();

  for (const booking of allBookings) {
    switch (booking.status) {
      case "completed":
        completedBookings++;
        totalRevenue += getBookingRevenueAmount(booking);
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "pending":
        pendingBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "accepted":
      case "confirmed":
        acceptedBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "cancelled":
        cancelledBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "late_cancelled":
        lateCancelledBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "no_show":
        noShowBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      default:
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
    }
  }

  const totalBookings = allBookings.length;
  const averageBookingValue =
    completedBookings > 0 ? totalRevenue / completedBookings : 0;

  return {
    salon: {
      id: salon._id,
      name: salon.name,
      city: salon.city,
      address: salon.address,
      phone: salon.phone,
      imageUrl: salon.imageUrl,
    },
    range: {
      from,
      to,
    },
    summary: {
      totalBookings,
      completedBookings,
      pendingBookings,
      acceptedBookings,
      cancelledBookings: cancelledBookings + lateCancelledBookings,
      noShowBookings,
      lateCancelledBookings,
      totalRevenue,
      averageBookingValue,
      uniqueClients: uniqueClientSet.size,
    },
    byStatus: statusBreakdown,
    byDay,
    byStaff,
    topServices,
  };
};
