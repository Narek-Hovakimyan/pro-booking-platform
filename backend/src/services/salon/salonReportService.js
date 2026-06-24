import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { salonHasActiveSubscription } from "../subscriptionService.js";
import { isSalonAdmin, isSalonOwner } from "../../utils/salonPermissions.js";
import {
  getRelationshipType,
  isWorkingSpecialist,
} from "./salonRelationshipService.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const reportAppointmentDateField = "reportAppointmentDate";
const reportAppointmentDateExpression = {
  $cond: [
    {
      $and: [
        { $ne: ["$bookingDate", null] },
        { $ne: ["$bookingDate", ""] },
      ],
    },
    "$bookingDate",
    "$dayKey",
  ],
};

const isValidDateString = (value) => {
  if (!DATE_PATTERN.test(value || "")) return false;

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
};

export class ReportError extends Error {
  constructor(statusCode, message, code = "") {
    super(message);
    this.name = "ReportError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Validate and parse date range.
 */
const parseDateRange = (from, to) => {
  if (!from || !to) {
    throw new ReportError(400, "from and to query params are required (YYYY-MM-DD)");
  }

  if (!isValidDateString(from) || !isValidDateString(to)) {
    throw new ReportError(400, "Invalid date format. Use YYYY-MM-DD.");
  }

  if (from > to) {
    throw new ReportError(400, "from date must be before or equal to to date");
  }

  return { from, to };
};

const appointmentDateQuery = (from, to) => ({
  $or: [
    {
      bookingDate: { $gte: from, $lte: to },
    },
    {
      $or: [
        { bookingDate: { $exists: false } },
        { bookingDate: null },
        { bookingDate: "" },
      ],
      dayKey: { $gte: from, $lte: to },
    },
  ],
});

// Reports are appointment-period views: prefer canonical bookingDate, with
// dayKey as a legacy fallback for old records that did not persist bookingDate.
const appointmentDateAggregationStages = (from, to) => [
  {
    $addFields: {
      [reportAppointmentDateField]: reportAppointmentDateExpression,
    },
  },
  {
    $match: {
      [reportAppointmentDateField]: { $gte: from, $lte: to },
    },
  },
];

const paymentTypes = new Set(["none", "commission", "fixed"]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toPlainObject = (value) => value?.toObject?.() || value || {};

const numberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const getSafeStaffPayment = (staffPayment) => {
  const payment = toPlainObject(staffPayment);
  const type = paymentTypes.has(payment.type) ? payment.type : "none";

  return {
    paymentType: type,
    commissionStaffPercent: numberOrNull(payment.commissionStaffPercent),
    commissionSalonPercent: numberOrNull(payment.commissionSalonPercent),
    fixedAmount: numberOrNull(payment.fixedAmount),
    fixedPeriod: payment.fixedPeriod || "",
  };
};

const parseReportDate = (value) => new Date(`${value}T00:00:00.000Z`);

const getInclusiveDayCount = (from, to) => {
  const start = parseReportDate(from);
  const end = parseReportDate(to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
};

const getDaysInMonth = (year, monthIndex) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const getMonthlyProrationUnits = (from, to) => {
  const start = parseReportDate(from);
  const end = parseReportDate(to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let totalUnits = 0;
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  );

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month, daysInMonth));
    const overlapStart = start > monthStart ? start : monthStart;
    const overlapEnd = end < monthEnd ? end : monthEnd;

    if (overlapStart <= overlapEnd) {
      totalUnits += getInclusiveDayCount(
        overlapStart.toISOString().slice(0, 10),
        overlapEnd.toISOString().slice(0, 10)
      ) / daysInMonth;
    }

    cursor = new Date(Date.UTC(year, month + 1, 1));
  }

  return totalUnits;
};

const getFixedProration = (
  safePayment,
  { from, to, completedBookingDates = [] } = {}
) => {
  const fixedAmount = safePayment.fixedAmount ?? 0;
  const uniqueCompletedBookingDates = [
    ...new Set(completedBookingDates.filter(Boolean)),
  ];

  if (uniqueCompletedBookingDates.length === 0 || fixedAmount <= 0) {
    return { staffEarnings: 0, fixedProratedDays: 0, fixedProrationUnits: 0 };
  }

  if (safePayment.fixedPeriod === "daily") {
    const fixedProratedDays = uniqueCompletedBookingDates.length;
    return {
      staffEarnings: fixedAmount * fixedProratedDays,
      fixedProratedDays,
      fixedProrationUnits: fixedProratedDays,
    };
  }

  const fixedProratedDays = getInclusiveDayCount(from, to);
  const fixedProrationUnits =
    safePayment.fixedPeriod === "weekly"
      ? fixedProratedDays / 7
      : safePayment.fixedPeriod === "monthly"
        ? getMonthlyProrationUnits(from, to)
        : 0;

  return {
    staffEarnings: fixedAmount * fixedProrationUnits,
    fixedProratedDays,
    fixedProrationUnits,
  };
};

const getStaffEarningsBreakdown = (grossRevenue, staffPayment, options = {}) => {
  const safePayment = getSafeStaffPayment(staffPayment);

  if (safePayment.paymentType === "commission") {
    const staffPercent = safePayment.commissionStaffPercent ?? 0;
    const salonPercent = safePayment.commissionSalonPercent ?? 0;

    return {
      grossRevenue,
      staffEarnings: (grossRevenue * staffPercent) / 100,
      salonEarnings: (grossRevenue * salonPercent) / 100,
      ...safePayment,
      fixedAmount: null,
      fixedPeriod: "",
      fixedProratedDays: null,
      fixedProrationUnits: null,
      earningsCalculationStatus: "calculated",
    };
  }

  if (safePayment.paymentType === "fixed") {
    const fixedProration = getFixedProration(safePayment, options);

    return {
      grossRevenue,
      staffEarnings: fixedProration.staffEarnings,
      salonEarnings: Math.max(0, grossRevenue - fixedProration.staffEarnings),
      ...safePayment,
      commissionStaffPercent: null,
      commissionSalonPercent: null,
      ...fixedProration,
      earningsCalculationStatus: "calculated_prorated",
    };
  }

  return {
    grossRevenue,
    staffEarnings: 0,
    salonEarnings: grossRevenue,
    ...safePayment,
    commissionStaffPercent: null,
    commissionSalonPercent: null,
    fixedAmount: null,
    fixedPeriod: "",
    fixedProratedDays: null,
    fixedProrationUnits: null,
    earningsCalculationStatus: "not_configured",
  };
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
    } else if (isWorkingSpecialist(salonEntry)) {
      staffIds.push(user._id);
      membersById[String(user._id)] = {
        _id: user._id,
        name: user.name,
        avatarUrl: user.avatarUrl || "",
        relationshipType: "staff",
        relationshipStatus: "accepted",
        staffPayment: salonEntry.staffPayment || { type: "none" },
      };
    }
  }

  return { staffIds, chairRenterIds, membersById };
};

/**
 * Count bookings by status in a given date range for given barber IDs.
 */
const getStatusBreakdown = async (salonId, barberIds, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
      },
    },
    ...appointmentDateAggregationStages(from, to),
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
const getByDayBreakdown = async (salonId, barberIds, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
      },
    },
    ...appointmentDateAggregationStages(from, to),
    {
      $group: {
        _id: `$${reportAppointmentDateField}`,
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
const getByStaffBreakdown = async (salonId, barberIds, membersById, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
      },
    },
    ...appointmentDateAggregationStages(from, to),
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
        completedBookingDates: {
          $addToSet: {
            $cond: [
              { $eq: ["$status", "completed"] },
              `$${reportAppointmentDateField}`,
              null,
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
    const grossRevenue = Number(r.revenue || 0);
    const earningsBreakdown = getStaffEarningsBreakdown(
      grossRevenue,
      member?.staffPayment,
      {
        from,
        to,
        completedBookingDates: (r.completedBookingDates || []).filter(Boolean),
      }
    );

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
      ...earningsBreakdown,
    };
  });
};

/**
 * Get top services for given barber IDs in date range.
 */
const getTopServices = async (salonId, barberIds, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
        serviceName: { $exists: true, $ne: "" },
      },
    },
    ...appointmentDateAggregationStages(from, to),
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

  const hasSalonSubscription = await salonHasActiveSubscription(salon._id);
  if (!hasSalonSubscription) {
    throw new ReportError(
      403,
      "An active salon subscription is required to access reports",
      "SALON_SUBSCRIPTION_REQUIRED"
    );
  }

  parseDateRange(from, to);

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
    getStatusBreakdown(salon._id, effectiveStaffIds, from, to),
    getByDayBreakdown(salon._id, effectiveStaffIds, from, to),
    getByStaffBreakdown(salon._id, effectiveStaffIds, membersById, from, to),
    getTopServices(salon._id, effectiveStaffIds, from, to),
    // Fetch all bookings in range for summary
    Booking.find({
      salonId: salon._id,
      barberId: { $in: effectiveStaffIds },
      ...appointmentDateQuery(from, to),
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
  const staffEarningsTotal = byStaff.reduce(
    (sum, staff) => sum + Number(staff.staffEarnings || 0),
    0
  );
  const salonEarningsTotal = byStaff.reduce(
    (sum, staff) => sum + Number(staff.salonEarnings || 0),
    0
  );
  const fixedPayNotProratedCount = byStaff.filter(
    (staff) => staff.earningsCalculationStatus === "fixed_not_prorated"
  ).length;
  const fixedPayProratedCount = byStaff.filter(
    (staff) =>
      staff.earningsCalculationStatus === "calculated_prorated" &&
      Number(staff.fixedProrationUnits || 0) > 0
  ).length;

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
      grossRevenue: totalRevenue,
      staffEarningsTotal,
      salonEarningsTotal,
      fixedPayNotProratedCount,
      fixedPayProratedCount,
      averageBookingValue,
      uniqueClients: uniqueClientSet.size,
    },
    byStatus: statusBreakdown,
    byDay,
    byStaff,
    topServices,
  };
};
