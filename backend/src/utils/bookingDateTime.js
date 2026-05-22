const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timeKeyPattern = /^\d{2}:\d{2}$/;

export const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const getDayKeyFromDate = (dateKey) => {
  if (!isDateKey(dateKey)) return "";

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return dayKeys[date.getDay()];
};

export const getMonthBounds = (monthKey) => {
  const [year, month] = monthKey.split("-").map(Number);

  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
};

export const isDateKey = (dateKey) => {
  if (typeof dateKey !== "string" || !dateKeyPattern.test(dateKey)) return false;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return formatDateKey(date) === dateKey;
};

export const isTimeKey = (time) => {
  if (typeof time !== "string" || !timeKeyPattern.test(time)) return false;

  const [hours, minutes] = time.split(":").map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

export const timeToMinutes = (time) => {
  if (!isTimeKey(time)) return null;

  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
};

/**
 * Parse a booking's date+time as Armenia/Yerevan (UTC+04:00).
 * bookingDate + time strings represent Armenia wall-clock time.
 * Returns a Date (UTC epoch), or null if invalid.
 */
export const getBookingDateTime = (booking) => {
  if (!booking?.bookingDate || !booking?.time) return null;
  if (!isDateKey(booking.bookingDate) || !isTimeKey(booking.time)) return null;

  const dateTime = new Date(`${booking.bookingDate}T${booking.time}:00+04:00`);

  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
};

/**
 * Get the end datetime of a booking, adding its duration.
 * Returns a Date (UTC epoch), or null if invalid.
 */
export const getBookingEndDateTime = (booking) => {
  const startsAt = getBookingDateTime(booking);

  if (!startsAt) return null;

  const duration = Number(booking?.duration);

  if (!Number.isFinite(duration) || duration <= 0) return startsAt;

  return new Date(startsAt.getTime() + duration * 60 * 1000);
};

/**
 * Get the current Armenia/Yerevan minutes-of-day (0-1439) from an arbitrary Date.
 * This is server-timezone-independent because it uses UTC methods + 4h offset.
 */
export const getArmeniaMinutesOfDay = (date) => {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + 4 * 60;

  return minutes % (24 * 60);
};

/**
 * Get the Armenia/Yerevan date key (YYYY-MM-DD) from an arbitrary Date.
 * Server-timezone-independent.
 */
export const getArmeniaDateKey = (date) => {
  const armeniaMs = date.getTime() + 4 * 60 * 60 * 1000;
  const armeniaDate = new Date(armeniaMs);
  const year = armeniaDate.getUTCFullYear();
  const month = String(armeniaDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(armeniaDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export { dateKeyPattern, timeKeyPattern };
