import Booking from "../models/Booking.js";
import Schedule from "../models/Schedule.js";
import User from "../models/User.js";
import {
  getArmeniaDateKey,
  getDayKeyFromDate,
  isDateKey,
  isTimeKey,
} from "./bookingDateTime.js";
import {
  blockingBookingStatuses,
  getBookingCreationLockKey,
  getIdString,
  getScheduleForDate,
  getScheduleSlotError,
  isPastBookingTime,
  normalizeBookingStatus,
  slotOverlaps,
} from "./bookingUtils.js";
import {
  normalizeScheduleForAvailability,
  serializeDefaultSchedule,
} from "./scheduleUtils.js";

const bookingCreationLocks = new Map();

export const validateBookingSlot = async ({
  barberId,
  salonId,
  barber: providedBarber = null,
  bookingDate,
  dayKey,
  time,
  duration,
  ignoreBookingId = null,
  schedule: resolvedSchedule = undefined,
  requireResolvedSchedule = false,
}) => {
  if (!isDateKey(bookingDate)) {
    return { message: "bookingDate must be YYYY-MM-DD" };
  }

  if (!isTimeKey(time)) {
    return { message: "time must be HH:mm" };
  }

  if (isPastBookingTime(bookingDate, time)) {
    return { message: "This time is already past" };
  }

  const todayKey = getArmeniaDateKey(new Date());
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const [by, bm, bd] = bookingDate.split("-").map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const bookDate = new Date(by, bm - 1, bd);
  const diffDays = (bookDate - todayDate) / (1000 * 60 * 60 * 24);

  if (diffDays > 365) {
    return { message: "Booking date is too far in the future" };
  }

  const effectiveDayKey = getDayKeyFromDate(bookingDate) || dayKey;

  // Get per-salon schedule
  const scheduleQuery = salonId
    ? { barberId, salonId }
    : { barberId, salonId: { $ne: null } };
  const [schedule, barber] = await Promise.all([
    resolvedSchedule !== undefined ? resolvedSchedule : Schedule.findOne(scheduleQuery),
    providedBarber || User.findById(barberId).select("-password"),
  ]);

  if (requireResolvedSchedule && !schedule) {
    return { message: "Barber is not working this day" };
  }

  // Prefer the selected salon's saved schedule, while keeping legacy salon-entry defaults.
  const salonEntry = (barber?.salons || []).find(
    (s) => getIdString(s?.salon) === String(salonId || "")
  );
  const scheduleDefaults = serializeDefaultSchedule(
    schedule?.defaultSchedule,
    salonEntry?.defaultSchedule
  );
  const availabilitySchedule = normalizeScheduleForAvailability(schedule);

  const dateOverride = availabilitySchedule?.scheduleOverrides?.[bookingDate];
  const exactDaySchedule = dateOverride
    ? {
        working: Boolean(dateOverride.isWorking),
        from: dateOverride.startTime || "",
        to: dateOverride.endTime || "",
        breakFrom: dateOverride.breakStart || "",
        breakTo: dateOverride.breakEnd || "",
      }
    : availabilitySchedule?.weeklySchedule?.[effectiveDayKey];
  const daySchedule = requireResolvedSchedule
    ? exactDaySchedule
    : getScheduleForDate(
        availabilitySchedule,
        bookingDate,
        effectiveDayKey,
        scheduleDefaults
      );

  if (availabilitySchedule?.nonWorkingDays?.includes(bookingDate) || !daySchedule?.working) {
    return { message: "Barber is not working this day" };
  }

  const scheduleSlotError = getScheduleSlotError(daySchedule, time, duration);

  if (scheduleSlotError) {
    return { message: scheduleSlotError };
  }

  // Check barber slot overlap across all salons. Only blocking statuses reserve slots.
  const activeBookingQuery = {
    barberId,
    status: { $in: blockingBookingStatuses },
    bookingDate,
  };

  if (ignoreBookingId) {
    activeBookingQuery._id = { $ne: ignoreBookingId };
  }

  const activeBookings = await Booking.find(activeBookingQuery);
  const hasOverlap = activeBookings.some((booking) =>
    blockingBookingStatuses.includes(normalizeBookingStatus(booking?.status)) &&
    slotOverlaps(booking, time, duration)
  );

  if (hasOverlap) {
    return { message: "This time is already booked" };
  }

  return { effectiveDayKey };
};

export const withBookingCreationLock = async (lockKey, task) => {
  const previousLock = bookingCreationLocks.get(lockKey) || Promise.resolve();
  let releaseCurrentLock;
  const currentLock = new Promise((resolve) => {
    releaseCurrentLock = resolve;
  });

  const queuedLock = previousLock.then(() => currentLock, () => currentLock);
  bookingCreationLocks.set(lockKey, queuedLock);

  await previousLock.catch(() => {});

  try {
    return await task();
  } finally {
    releaseCurrentLock();

    if (bookingCreationLocks.get(lockKey) === queuedLock) {
      bookingCreationLocks.delete(lockKey);
    }
  }
};

export { getBookingCreationLockKey };
