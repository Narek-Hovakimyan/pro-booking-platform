import Booking from "../../models/Booking.js";
import {
  getCurrentMonthKey,
  getMonthBounds,
} from "../../utils/bookingDateTime.js";
import {
  getBookingMonthKey,
  incomeBookingStatuses,
  monthKeyPattern,
} from "../../utils/bookingUtils.js";

export class BookingAnalyticsError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "BookingAnalyticsError";
    this.statusCode = statusCode;
  }
}

const assertOwnBarberIncomeAccess = ({ barberId, requester }) => {
  if (requester?.role !== "barber" || String(requester._id) !== String(barberId)) {
    throw new BookingAnalyticsError(403, "You can fetch only your own income");
  }
};

export const getBarberMonthlyIncomeSummary = async ({
  barberId,
  year: _year,
  month,
  requester,
}) => {
  assertOwnBarberIncomeAccess({ barberId, requester });

  const monthKey = month || getCurrentMonthKey();

  if (!monthKeyPattern.test(monthKey)) {
    throw new BookingAnalyticsError(400, "Month must use YYYY-MM format");
  }

  const { start, end } = getMonthBounds(monthKey);
  const bookings = await Booking.find({
    barberId,
    status: { $in: incomeBookingStatuses },
    $or: [
      { bookingDate: { $regex: `^${monthKey}-` } },
      { dayKey: { $regex: `^${monthKey}-` } },
      {
        bookingDate: { $in: [null, ""] },
        completedAt: { $gte: start, $lt: end },
      },
    ],
  });
  const monthlyBookings = bookings.filter(
    (booking) => getBookingMonthKey(booking) === monthKey
  );
  const income = monthlyBookings.reduce(
    (totals, booking) => {
      const price = Number(booking?.price || 0);
      const safePrice = Number.isFinite(price) ? price : 0;

      if (booking?.status === "completed") {
        totals.completedIncome += safePrice;
        totals.completedCount += 1;
      }

      if (booking?.status === "pending" || booking?.status === "accepted") {
        totals.pendingIncome += safePrice;
        totals.pendingCount += 1;
      }

      return totals;
    },
    {
      completedIncome: 0,
      completedCount: 0,
      pendingIncome: 0,
      pendingCount: 0,
    }
  );

  return {
    month: monthKey,
    completedIncome: income.completedIncome,
    completedCount: income.completedCount,
    pendingIncome: income.pendingIncome,
    pendingCount: income.pendingCount,
    totalExpectedIncome: income.completedIncome + income.pendingIncome,
    totalIncome: income.completedIncome,
    completedBookingsCount: income.completedCount,
  };
};
