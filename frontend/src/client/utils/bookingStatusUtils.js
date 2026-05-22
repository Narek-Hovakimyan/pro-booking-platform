import { isDateKey } from "@/shared/utils/dates";

export const upcomingStatuses = new Set(["pending", "accepted", "confirmed"]);
export const historyStatuses = new Set([
  "completed",
  "rejected",
  "cancelled",
  "expired",
  "no_show",
  "late_cancelled",
]);

export const activeBookingSections = [
  {
    key: "pending",
    title: "Pending confirmation",
    statuses: ["pending"],
  },
  {
    key: "accepted",
    title: "Confirmed",
    statuses: ["accepted", "confirmed"],
  },
];

export const historyBookingSections = [
  {
    key: "past_confirmed",
    title: "Past confirmed",
    statuses: ["accepted", "confirmed"],
  },
  {
    key: "completed",
    title: "Completed",
    statuses: ["completed"],
  },
  {
    key: "cancelled",
    title: "Cancelled",
    statuses: ["cancelled"],
  },
  {
    key: "expired",
    title: "Expired",
    statuses: ["expired"],
  },
  {
    key: "no_show",
    title: "No-show",
    statuses: ["no_show"],
  },
  {
    key: "late_cancelled",
    title: "Late cancellation",
    statuses: ["late_cancelled"],
  },
  {
    key: "rejected",
    title: "Rejected",
    statuses: ["rejected"],
  },
];

export const getEntityId = (entity) =>
  typeof entity === "string" ? entity : entity?.id || entity?._id || "";

export const getBookingId = (booking) => booking?.id || booking?._id || "";

export const getBookingBarberId = (booking) =>
  getEntityId(booking?.barberId) || getEntityId(booking?.barber);

export const getBookingSalonId = (booking) =>
  getEntityId(booking?.salonId) || getEntityId(booking?.salon);

export const getBookingDate = (booking) => {
  if (isDateKey(booking?.bookingDate)) return booking.bookingDate;
  if (isDateKey(booking?.date)) return booking.date;
  if (isDateKey(booking?.dayKey)) return booking.dayKey;
  return "";
};

export const getBookingTime = (booking) => booking?.time || "";

export const getNormalizedBookingStatus = (booking) =>
  booking?.status === "confirmed" ? "accepted" : booking?.status || "";

export const getBookingDateTime = (booking) => {
  const dateKey = getBookingDate(booking);
  const time = getBookingTime(booking);

  if (!isDateKey(dateKey) || !time) return null;

  const dateTime = new Date(`${dateKey}T${time}:00`);
  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
};

export const getBookingSortValue = (booking) =>
  `${getBookingDate(booking)} ${getBookingTime(booking)}`;

export const sortBookingsAscending = (a, b) => {
  const aDateTime = getBookingDateTime(a);
  const bDateTime = getBookingDateTime(b);

  if (aDateTime && bDateTime) {
    return aDateTime.getTime() - bDateTime.getTime();
  }

  return getBookingSortValue(a).localeCompare(getBookingSortValue(b));
};

export const sortBookingsDescending = (a, b) =>
  getBookingSortValue(b).localeCompare(getBookingSortValue(a));

export const getUpcomingStatusLabel = (status) =>
  getNormalizedBookingStatus({ status }) === "pending"
    ? "Pending confirmation"
    : "Confirmed";

export const getUpcomingStatusClass = (status) =>
  getNormalizedBookingStatus({ status }) === "pending"
    ? "bg-amber-100 text-amber-800"
    : "bg-emerald-100 text-emerald-800";

export const canCancelBooking = (booking) =>
  getNormalizedBookingStatus(booking) === "pending" ||
  getNormalizedBookingStatus(booking) === "accepted";

export const canRescheduleBooking = canCancelBooking;

export const canDelayBooking = (booking) => {
  if (booking?.status !== "accepted") return false;

  const bookingDateTime = getBookingDateTime(booking);
  if (!bookingDateTime) return false;

  const now = new Date();
  const latestDelayedStart = new Date(bookingDateTime);
  latestDelayedStart.setMinutes(latestDelayedStart.getMinutes() + 20);

  return latestDelayedStart > now;
};

/**
 * Determines whether a client can "Book again" for a past booking.
 *
 * Eligibility rules:
 * - completed → true
 * - accepted/confirmed with past date/time → true
 * - pending → false
 * - future accepted/confirmed → false
 * - cancelled/rejected/expired/no_show/late_cancelled → false
 */
export const canBookAgain = (booking) => {
  const status = getNormalizedBookingStatus(booking);

  if (status === "completed") return true;

  if (status === "accepted") {
    const bookingDateTime = getBookingDateTime(booking);
    if (!bookingDateTime) return false;
    return bookingDateTime < new Date();
  }

  return false;
};

/**
 * Returns true if the booking has a valid date/time in the past.
 * Returns false when date or time is missing (conservative: stays active).
 */
export const isPastBooking = (booking, now = new Date()) => {
  const bookingDateTime = getBookingDateTime(booking);
  if (!bookingDateTime) return false;
  return bookingDateTime < now;
};

/**
 * Returns true if the booking should appear in Active bookings.
 * - pending is always active (no date/time needed).
 * - accepted/confirmed is active only when date/time is missing or >= now.
 */
export const isActiveBooking = (booking, now = new Date()) => {
  const status = getNormalizedBookingStatus(booking);

  if (status === "pending") return true;

  if (status === "accepted") {
    const bookingDateTime = getBookingDateTime(booking);
    if (!bookingDateTime) return true; // missing date/time → stay active
    return bookingDateTime >= now;
  }

  return false;
};

/**
 * Returns true if the booking should appear in History.
 * - Terminal statuses (completed, cancelled, etc.) are always history.
 * - Past accepted/confirmed bookings go to history.
 */
export const isHistoryBooking = (booking, now = new Date()) => {
  if (historyStatuses.has(booking?.status)) return true;

  const normalized = getNormalizedBookingStatus(booking);
  if (normalized === "accepted" && isPastBooking(booking, now)) return true;

  return false;
};

