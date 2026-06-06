import Booking from "../models/Booking.js";
import mongoose from "mongoose";

export class RevenueError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "RevenueError";
    this.statusCode = statusCode;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALL_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "completed",
  "cancelled",
  "expired",
  "no_show",
  "late_cancelled",
];

const getDefaultMonthBounds = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const from = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
};

/**
 * Get the effective date string for a booking (appointment date basis).
 * Priority: bookingDate > dayKey > completedAt fallback.
 */
const getBookingDateField = (booking) => {
  if (booking.bookingDate && DATE_PATTERN.test(booking.bookingDate)) {
    return booking.bookingDate;
  }
  if (booking.dayKey && DATE_PATTERN.test(booking.dayKey)) {
    return booking.dayKey;
  }
  if (booking.completedAt) {
    const d = new Date(booking.completedAt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
};

const assertOwnBarberAccess = ({ barberId, requester }) => {
  if (!requester) {
    throw new RevenueError(401, "Not authenticated");
  }
  if (requester.role !== "barber") {
    throw new RevenueError(403, "Only barbers can access revenue data");
  }
  if (String(requester._id) !== String(barberId)) {
    throw new RevenueError(403, "You can access only your own revenue");
  }
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

  const price = Number(booking?.price);
  return Number.isFinite(price) ? price : 0;
};

export const getBarberRevenueSummary = async ({
  barberId,
  requester,
  from: rawFrom,
  to: rawTo,
}) => {
  assertOwnBarberAccess({ barberId, requester });

  const { from, to } = resolveDateRange(rawFrom, rawTo);
  const barberObjectId = new mongoose.Types.ObjectId(String(barberId));

  // ── Query all bookings in range ──
  const bookings = await Booking.find({
    barberId: barberObjectId,
    $or: [
      { bookingDate: { $gte: from, $lte: to } },
      { dayKey: { $gte: from, $lte: to } },
      {
        bookingDate: { $in: [null, ""] },
        dayKey: { $in: [null, ""] },
        completedAt: {
          $gte: new Date(`${from}T00:00:00.000Z`),
          $lte: new Date(`${to}T23:59:59.999Z`),
        },
      },
    ],
  }).lean();

  // ── Status breakdown (all statuses in range) ──
  const statusBreakdown = {};
  for (const status of ALL_STATUSES) {
    statusBreakdown[status] = 0;
  }
  for (const b of bookings) {
    const s = b.status || "pending";
    if (Object.prototype.hasOwnProperty.call(statusBreakdown, s)) {
      statusBreakdown[s] += 1;
    }
  }

  // ── Revenue data (completed only) ──
  const completedBookings = bookings.filter((b) => b.status === "completed");
  const totalRevenue = completedBookings.reduce(
    (sum, b) => sum + getBookingRevenueAmount(b),
    0
  );
  const completedBookingsCount = completedBookings.length;
  const averageBookingValue =
    completedBookingsCount > 0
      ? Math.round((totalRevenue / completedBookingsCount) * 100) / 100
      : 0;

  // ── Revenue by day ──
  const dayMap = new Map();
  for (const b of completedBookings) {
    const dateKey = getBookingDateField(b);
    if (!dateKey) continue;
    const existing = dayMap.get(dateKey) || { revenue: 0, count: 0 };
    existing.revenue += getBookingRevenueAmount(b);
    existing.count += 1;
    dayMap.set(dateKey, existing);
  }
  const revenueByDay = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { revenue, count }]) => ({
      date,
      revenue: Math.round(revenue * 100) / 100,
      count,
    }));

  // ── Top services by revenue ──
  const serviceRevenueMap = new Map();
  for (const b of completedBookings) {
    const name = b.serviceName || "Unknown";
    const existing = serviceRevenueMap.get(name) || { revenue: 0, count: 0 };
    existing.revenue += getBookingRevenueAmount(b);
    existing.count += 1;
    serviceRevenueMap.set(name, existing);
  }
  const topServicesByRevenue = Array.from(serviceRevenueMap.entries())
    .map(([serviceName, { revenue, count }]) => ({
      serviceName,
      revenue: Math.round(revenue * 100) / 100,
      count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Top services by count ──
  const topServicesByCount = Array.from(serviceRevenueMap.entries())
    .map(([serviceName, { revenue, count }]) => ({
      serviceName,
      revenue: Math.round(revenue * 100) / 100,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    from,
    to,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    completedBookingsCount,
    averageBookingValue,
    revenueByDay,
    topServicesByRevenue,
    topServicesByCount,
    statusBreakdown,
  };
};

const MAX_DATE_RANGE_DAYS = 366;

function resolveDateRange(rawFrom, rawTo) {
  if (rawFrom && rawTo) {
    if (!DATE_PATTERN.test(rawFrom) || !DATE_PATTERN.test(rawTo)) {
      throw new RevenueError(400, "from/to must use YYYY-MM-DD format");
    }
    if (rawFrom > rawTo) {
      throw new RevenueError(400, "from must be before or equal to to");
    }
    const fromDate = new Date(rawFrom + "T00:00:00.000Z");
    const toDate = new Date(rawTo + "T23:59:59.999Z");
    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_DATE_RANGE_DAYS) {
      throw new RevenueError(
        400,
        `Date range must not exceed ${MAX_DATE_RANGE_DAYS} days`
      );
    }
    return { from: rawFrom, to: rawTo };
  }
  return getDefaultMonthBounds();
}
