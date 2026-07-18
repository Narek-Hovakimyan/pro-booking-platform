import {
  getArmeniaDateKey,
  getArmeniaMinutesOfDay,
  getDayKeyFromDate,
  timeToMinutes,
} from "./bookingDateTime.js";
import {
  blockingBookingStatuses,
  isMeaningfulWeeklyDay,
  getScheduleForDate,
  normalizeBookingStatus,
} from "./bookingUtils.js";
import {
  normalizeScheduleForAvailability,
} from "./scheduleUtils.js";

const SLOT_INTERVAL_MINUTES = 10;

const defaultSchedule = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

const readField = (obj, field, fallback) => {
  if (!obj) return fallback;
  if (obj._doc && obj._doc[field] !== undefined) return obj._doc[field];
  if (obj[field] !== undefined) return obj[field];
  return fallback;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");

  return `${hours}:${mins}`;
};

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

export const getSalonIdForAvailability = (salonEntry) => {
  if (!salonEntry) return "";

  if (salonEntry.salon && typeof salonEntry.salon === "object") {
    return getIdString(salonEntry.salon);
  }

  return getIdString(salonEntry.salon || salonEntry);
};

const getSalonHoursForDate = (salonEntry, salonSchedule, fallbackSchedule, dateKey) => {
  const availabilitySalonSchedule = normalizeScheduleForAvailability(salonSchedule) || {};
  const availabilityFallbackSchedule =
    normalizeScheduleForAvailability(fallbackSchedule) || {};
  const mergedSchedule = {
    ...availabilityFallbackSchedule,
    ...availabilitySalonSchedule,
    weeklySchedule: {
      ...(availabilitySalonSchedule?.weeklySchedule || {}),
    },
    scheduleOverrides: {
      ...(availabilityFallbackSchedule?.scheduleOverrides || {}),
      ...(availabilitySalonSchedule?.scheduleOverrides || {}),
      ...(salonEntry?.scheduleOverrides || {}),
    },
  };
  const mergedDefaultSchedule = {
    ...(availabilityFallbackSchedule?.defaultSchedule || {}),
    ...(availabilitySalonSchedule?.defaultSchedule || {}),
    ...(salonEntry?.defaultSchedule || {}),
  };
  const dayKey = getDayKeyFromDate(dateKey);
  const getHoursFromDaySchedule = () => {
    const daySchedule = getScheduleForDate(
      mergedSchedule,
      dateKey,
      dayKey,
      mergedDefaultSchedule
    );

    if (!daySchedule?.working) return null;

    return {
      startTime: daySchedule.from || defaultSchedule.startTime,
      endTime: daySchedule.to || defaultSchedule.endTime,
      hasBreak: Boolean(daySchedule.breakFrom && daySchedule.breakTo),
      breakStart: daySchedule.breakFrom || "",
      breakEnd: daySchedule.breakTo || "",
    };
  };

  if (mergedSchedule.scheduleOverrides?.[dateKey]) {
    return getHoursFromDaySchedule();
  }

  const nonWorkingDays = [
    ...(availabilityFallbackSchedule?.nonWorkingDays || []),
    ...(availabilitySalonSchedule?.nonWorkingDays || []),
    ...(salonEntry?.nonWorkingDays || []),
  ];

  if (nonWorkingDays.includes(dateKey)) return null;

  return getHoursFromDaySchedule();
};

const getSalonName = (salonEntry) => {
  if (!salonEntry) return "Salon";

  if (salonEntry.salon && typeof salonEntry.salon === "object") {
    return salonEntry.salon.name || "Salon";
  }

  return salonEntry.name || "Salon";
};

const getContextHoursForDate = (schedule, dateKey) => {
  const normalizedSchedule = normalizeScheduleForAvailability(schedule);
  if (!normalizedSchedule) return null;

  const override = normalizedSchedule.scheduleOverrides?.[dateKey];
  if (override) {
    if (!override.isWorking) return null;

    return {
      startTime: override.startTime || "",
      endTime: override.endTime || "",
      hasBreak: Boolean(override.breakStart && override.breakEnd),
      breakStart: override.breakStart || "",
      breakEnd: override.breakEnd || "",
    };
  }

  if ((normalizedSchedule.nonWorkingDays || []).includes(dateKey)) {
    return null;
  }

  const weeklyDay = normalizedSchedule.weeklySchedule?.[getDayKeyFromDate(dateKey)];
  if (weeklyDay?.working === false || !isMeaningfulWeeklyDay(weeklyDay)) {
    return null;
  }

  return {
    startTime: weeklyDay.from || "",
    endTime: weeklyDay.to || "",
    hasBreak: Boolean(weeklyDay.breakFrom && weeklyDay.breakTo),
    breakStart: weeklyDay.breakFrom || "",
    breakEnd: weeklyDay.breakTo || "",
  };
};

const hasExactScheduleSource = (schedule) => {
  const normalizedSchedule = normalizeScheduleForAvailability(schedule);
  if (!normalizedSchedule) return false;

  if (Object.keys(normalizedSchedule.scheduleOverrides || {}).length > 0) {
    return true;
  }

  if ((normalizedSchedule.nonWorkingDays || []).length > 0) {
    return true;
  }

  return Object.values(normalizedSchedule.weeklySchedule || {}).some(
    (day) => day?.working === false || isMeaningfulWeeklyDay(day)
  );
};

const findSlotForDate = ({ hours, dateKey, nowTime, duration, bookings }) => {
  const startMin = timeToMinutes(hours.startTime);
  const endMin = timeToMinutes(hours.endTime);
  const breakStart = timeToMinutes(hours.breakStart);
  const breakEnd = timeToMinutes(hours.breakEnd);
  const nowMinutes = timeToMinutes(nowTime);

  if (startMin === null || endMin === null || endMin <= startMin) return null;

  for (let slotStart = startMin; slotStart < endMin; slotStart += SLOT_INTERVAL_MINUTES) {
    const slotEnd = slotStart + duration;

    if (nowMinutes !== null && slotStart <= nowMinutes) continue;
    if (slotEnd > endMin) continue;
    if (breakStart !== null && breakEnd !== null && slotStart < breakEnd && slotEnd > breakStart) {
      continue;
    }

    const isBooked = bookings.some((booking) => {
      if (!blockingBookingStatuses.includes(normalizeBookingStatus(booking.status))) {
        return false;
      }

      const bookingDate = booking.bookingDate || booking.dayKey;
      const bookingStart = timeToMinutes(booking.time);
      const bookingDuration = Number(booking.duration);

      if (bookingDate !== dateKey) return false;
      if (bookingStart === null || !Number.isFinite(bookingDuration)) return false;

      const bookingEnd = bookingStart + bookingDuration;

      return slotStart < bookingEnd && slotEnd > bookingStart;
    });

    if (!isBooked) {
      return minutesToTime(slotStart);
    }
  }

  return null;
};

export function getTodayFirstAvailableSlot({
  contexts = null,
  salons = [],
  schedulesBySalonId = new Map(),
  fallbackSchedule = {},
  services = [],
  bookings = [],
  now = new Date(),
}) {
  const activeServices = services.filter((service) => service?.active);

  if (activeServices.length === 0) {
    return { status: "ready", firstAvailableSlot: null, reason: "no-services" };
  }

  const durations = activeServices
    .map((service) => Number(service?.duration || 20))
    .filter((duration) => Number.isFinite(duration) && duration > 0);

  if (durations.length === 0) {
    return { status: "ready", firstAvailableSlot: null, reason: "no-services" };
  }

  const duration = Math.min(...durations);
  const todayKey = getArmeniaDateKey(now);
  const armeniaMinutes = getArmeniaMinutesOfDay(now);
  const nowTime = `${String(Math.floor(armeniaMinutes / 60)).padStart(2, "0")}:${String(armeniaMinutes % 60).padStart(2, "0")}`;

  if (Array.isArray(contexts)) {
    if (contexts.length === 0) {
      return { status: "unavailable", firstAvailableSlot: null, reason: "schedule-unavailable" };
    }

    let bestSlot = null;
    let bestIndex = -1;
    let hasExactSchedule = false;

    for (let i = 0; i < contexts.length; i += 1) {
      const context = contexts[i];
      if (hasExactScheduleSource(context?.schedule)) {
        hasExactSchedule = true;
      }

      const hours = getContextHoursForDate(context?.schedule, todayKey);
      if (!hours) continue;

      const time = findSlotForDate({
        hours,
        dateKey: todayKey,
        nowTime,
        duration,
        bookings,
      });
      if (!time) continue;

      if (!bestSlot || time < bestSlot.time || (time === bestSlot.time && i < bestIndex)) {
        bestSlot = {
          dateKey: todayKey,
          time,
          salonId: context?.salonId ?? null,
          salonName: context?.salonName || "",
        };
        bestIndex = i;
      }
    }

    if (bestSlot) {
      return { status: "ready", firstAvailableSlot: bestSlot, reason: "available" };
    }

    return hasExactSchedule
      ? { status: "ready", firstAvailableSlot: null, reason: "no-availability-today" }
      : { status: "unavailable", firstAvailableSlot: null, reason: "schedule-unavailable" };
  }

  if (!Array.isArray(salons) || salons.length === 0) {
    return { status: "unavailable", firstAvailableSlot: null, reason: "schedule-unavailable" };
  }

  // Search ALL salons, track earliest slot across them
  let bestSlot = null;
  let bestIndex = -1;

  for (let i = 0; i < salons.length; i++) {
    const salonEntry = salons[i];
    const salonId = getSalonIdForAvailability(salonEntry);

    if (!salonId) continue;

    const hours = getSalonHoursForDate(
      salonEntry,
      schedulesBySalonId.get(salonId),
      fallbackSchedule,
      todayKey
    );

    if (!hours) continue;

    const time = findSlotForDate({
      hours,
      dateKey: todayKey,
      nowTime,
      duration,
      bookings,
    });

    if (!time) continue;

    // Pick earliest time. If times are equal, prefer earlier salon order.
    if (!bestSlot || time < bestSlot.time || (time === bestSlot.time && i < bestIndex)) {
      bestSlot = {
        dateKey: todayKey,
        time,
        salonId,
        salonName: getSalonName(salonEntry),
      };
      bestIndex = i;
    }
  }

  if (bestSlot) {
    return { status: "ready", firstAvailableSlot: bestSlot, reason: "available" };
  }

  return { status: "ready", firstAvailableSlot: null, reason: "no-availability-today" };
}

export const __barberCardAvailabilityTestHooks = {
  getSalonHoursForDate,
  findSlotForDate,
};
