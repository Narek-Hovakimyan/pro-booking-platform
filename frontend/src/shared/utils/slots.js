import { timeToMinutes, minutesToTime } from "./time";
import { isToday } from "./dates";

const dayIndexes = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function isPastSlot(dayKey, time) {
  const now = new Date();
  const selectedDayIndex = dayIndexes[dayKey];

  if (selectedDayIndex === undefined) return false;
  if (selectedDayIndex < now.getDay()) return true;
  if (selectedDayIndex > now.getDay()) return false;

  const slotMinutes = timeToMinutes(time);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return slotMinutes !== null && slotMinutes <= nowMinutes;
}

export function isPastSlotForDate(dateValue, time) {
  if (!isToday(dateValue)) return false;

  const slotMinutes = timeToMinutes(time);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return slotMinutes !== null && slotMinutes <= nowMinutes;
}

const blockingBookingStatuses = new Set(["pending", "accepted", "confirmed"]);

const isActiveBooking = (booking) => blockingBookingStatuses.has(booking.status);

const readScheduleField = (schedule, field) => {
  if (!schedule) return undefined;
  if (schedule._doc && schedule._doc[field] !== undefined) return schedule._doc[field];
  if (schedule[field] !== undefined) return schedule[field];
  return undefined;
};

export function normalizeSchedule(schedule) {
  const from = readScheduleField(schedule, "from") ?? readScheduleField(schedule, "startTime") ?? "";
  const to = readScheduleField(schedule, "to") ?? readScheduleField(schedule, "endTime") ?? "";
  const working = readScheduleField(schedule, "working");
  const isWorking = readScheduleField(schedule, "isWorking");
  const hasBreak = readScheduleField(schedule, "hasBreak");
  const breakFrom =
    readScheduleField(schedule, "breakFrom") ??
    (hasBreak === false ? "" : readScheduleField(schedule, "breakStart")) ??
    "";
  const breakTo =
    readScheduleField(schedule, "breakTo") ??
    (hasBreak === false ? "" : readScheduleField(schedule, "breakEnd")) ??
    "";

  return {
    working:
      working !== undefined
        ? Boolean(working)
        : isWorking !== undefined
          ? Boolean(isWorking)
          : Boolean(from && to),
    from,
    to,
    breakFrom,
    breakTo,
  };
}

const overlapsRange = (start, end, booking) => {

  const bookingStart = timeToMinutes(booking.time);
  const bookingDuration = Number(booking.duration);

  if (bookingStart === null || !Number.isFinite(bookingDuration)) {
    return false;
  }

  const bookingEnd = bookingStart + bookingDuration;

  return start < bookingEnd && end > bookingStart;
};

const crossesBreakRange = (start, end, breakStart, breakEnd) =>
  breakStart !== null &&
  breakEnd !== null &&
  start < breakEnd &&
  end > breakStart;

const slotIntervalMinutes = 10;

const bookingMatchesDateByKey = (booking, selectedDate, selectedDayKey) =>
  (selectedDate && booking.bookingDate === selectedDate) ||
  (selectedDate && booking.dayKey === selectedDate) ||
  (selectedDayKey && booking.dayKey === selectedDayKey);

function getCanonicalSlotAvailabilitySummary(
  daySchedule,
  duration,
  existingBookings,
  selectedDayKey,
  options = {}
) {
  const serviceDuration = Number(duration);
  const schedule = normalizeSchedule(daySchedule);
  const bookings = Array.isArray(existingBookings) ? existingBookings : [];
  const selectedDate = options.selectedDate;

  if (!Number.isFinite(serviceDuration) || serviceDuration <= 0) {
    return { availableSlots: [], blockedByTime: false, blockedByBooking: false };
  }

  if (!schedule.working || !(selectedDate || selectedDayKey)) {
    return { availableSlots: [], blockedByTime: false, blockedByBooking: false };
  }

  const start = timeToMinutes(schedule.from);
  const end = timeToMinutes(schedule.to);
  const breakStart = timeToMinutes(schedule.breakFrom);
  const breakEnd = timeToMinutes(schedule.breakTo);

  if (start === null || end === null || start >= end) {
    return { availableSlots: [], blockedByTime: false, blockedByBooking: false };
  }

  const availableSlots = [];
  let blockedByTime = false;
  let blockedByBooking = false;

  for (let t = start; t < end; t += slotIntervalMinutes) {
    const slotEnd = t + serviceDuration;
    const time = minutesToTime(t);
    const pastSlot = selectedDate
      ? isPastSlotForDate(selectedDate, time)
      : isPastSlot(selectedDayKey, time);
    const notEnoughContinuousTime =
      slotEnd > end || crossesBreakRange(t, slotEnd, breakStart, breakEnd);
    const alreadyBooked = bookings.some((booking) => {
      if (booking.id === options.ignoreBookingId) return false;
      if (!bookingMatchesDateByKey(booking, selectedDate, selectedDayKey)) return false;
      if (!isActiveBooking(booking)) return false;

      return overlapsRange(t, slotEnd, booking);
    });

    if (pastSlot) {
      continue;
    }

    if (notEnoughContinuousTime) {
      blockedByTime = true;
      continue;
    }

    if (alreadyBooked) {
      blockedByBooking = true;
      continue;
    }

    availableSlots.push(time);
  }

  return { availableSlots, blockedByTime, blockedByBooking };
}


export function getSlotAvailabilitySummary(
  daySchedule,
  duration,
  existingBookings,
  selectedDayKey,
  options = {}
) {
  return getCanonicalSlotAvailabilitySummary(
    daySchedule,
    duration,
    existingBookings,
    selectedDayKey,
    options
  );
}

/**
 * Generate available slots for a specific salon.
 * Uses the per-salon schedule and checks ALL bookings for this barber
 * (across all salons) to prevent double-booking.
 */
export function getSalonSlotAvailabilitySummary(
  daySchedule,
  duration,
  allBarberBookings,
  selectedDayKey,
  options = {}
) {
  return getCanonicalSlotAvailabilitySummary(
    daySchedule,
    duration,
    allBarberBookings,
    selectedDayKey,
    options
  );
}

export function generateSlots(
  daySchedule,
  duration,
  existingBookings,
  selectedDayKey,
  options = {}
) {
  return getSlotAvailabilitySummary(
    daySchedule,
    duration,
    existingBookings,
    selectedDayKey,
    options
  ).availableSlots;
}
