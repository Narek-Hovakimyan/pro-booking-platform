/**
 * Pure helper functions and constants for schedule logic.
 * No req, res, database queries, database writes, or external mutations.
 */

import { getArmeniaDateKey } from "./bookingDateTime.js";

// ─── Constants ───
export const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const explicitAllDaysOffMarker = "__explicitAllDaysOff";
export const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
export const timeKeyPattern = /^\d{2}:\d{2}$/;
export const defaultScheduleFallback = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

// ─── ID helper ───
export const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

// ─── Date / Time helpers ───
export const getTodayKey = () => getArmeniaDateKey(new Date());

export const isDateKey = (dateKey) => {
  if (typeof dateKey !== "string" || !dateKeyPattern.test(dateKey)) return false;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const normalized = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  return normalized === dateKey;
};

export const cleanCurrentAndFutureDateKeys = (
  dateKeys = [],
  todayKey = getTodayKey()
) => {
  if (!Array.isArray(dateKeys)) return [];

  return Array.from(
    new Set(
      dateKeys.filter(
        (dateKey) => isDateKey(dateKey) && dateKey >= todayKey
      )
    )
  ).sort();
};

export const cleanCurrentAndFutureDateMap = (
  dateMap = {},
  todayKey = getTodayKey()
) => {
  const cleaned = {};

  for (const [dateKey, value] of Object.entries(dateMap || {})) {
    if (!isDateKey(dateKey) || dateKey < todayKey) continue;
    cleaned[dateKey] = value;
  }

  return cleaned;
};

export const cleanPastScheduleDates = (schedule = {}, todayKey = getTodayKey()) => ({
  dateSchedules: cleanCurrentAndFutureDateMap(schedule?.dateSchedules || {}, todayKey),
  scheduleOverrides: cleanCurrentAndFutureDateMap(
    schedule?.scheduleOverrides || {},
    todayKey
  ),
  nonWorkingDays: cleanCurrentAndFutureDateKeys(
    schedule?.nonWorkingDays || [],
    todayKey
  ),
});

export const isTimeKeyOrEmpty = (time) => {
  if (time === "") return true;
  if (typeof time !== "string" || !timeKeyPattern.test(time)) return false;

  const [hours, minutes] = time.split(":").map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

export const timeToMinutes = (time) => {
  if (!isTimeKeyOrEmpty(time) || !time) return null;

  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
};

// ─── Default schedule ───
export const getDefaultSchedule = (profile) => ({
  ...defaultScheduleFallback,
  ...(profile?.defaultSchedule || {}),
});

const toPlainScheduleObject = (value = {}) => {
  if (!value) return {};
  if (typeof value.toObject === "function") return value.toObject();
  if (value._doc && typeof value._doc === "object") return value._doc;
  return value;
};

export const serializeDefaultSchedule = (...sources) => {
  const defaultSchedule = { ...defaultScheduleFallback };

  for (const source of sources) {
    const plainSource = toPlainScheduleObject(source);

    if (plainSource.startTime) {
      defaultSchedule.startTime = plainSource.startTime;
    }

    if (plainSource.endTime) {
      defaultSchedule.endTime = plainSource.endTime;
    }

    if (plainSource.hasBreak !== undefined) {
      defaultSchedule.hasBreak = Boolean(plainSource.hasBreak);
    }

    if (plainSource.breakStart !== undefined) {
      defaultSchedule.breakStart = plainSource.breakStart || "";
    }

    if (plainSource.breakEnd !== undefined) {
      defaultSchedule.breakEnd = plainSource.breakEnd || "";
    }
  }

  return sanitizeDefaultSchedule(defaultSchedule);
};

// ─── Sanitizers ───
export const sanitizeWeeklySchedule = (weeklySchedule) => {
  const sanitized = {};

  for (const dayKey of dayKeys) {
    if (!Object.hasOwn(weeklySchedule || {}, dayKey)) continue;

    const daySchedule = weeklySchedule?.[dayKey] || {};
    const nextDaySchedule = {
      working: Boolean(daySchedule.working),
      from: daySchedule.from || "",
      to: daySchedule.to || "",
      breakFrom: daySchedule.breakFrom || "",
      breakTo: daySchedule.breakTo || "",
    };

    if (daySchedule.working === false) {
      sanitized[dayKey] = {
        working: false,
        from: "",
        to: "",
        breakFrom: "",
        breakTo: "",
      };
      continue;
    }

    if (daySchedule.working !== true) continue;

    for (const field of ["from", "to", "breakFrom", "breakTo"]) {
      if (!isTimeKeyOrEmpty(nextDaySchedule[field])) {
        throw new Error("Working hours must use HH:mm format");
      }
    }

    const startMinutes = timeToMinutes(nextDaySchedule.from);
    const endMinutes = timeToMinutes(nextDaySchedule.to);
    const breakFromFilled = Boolean(nextDaySchedule.breakFrom);
    const breakToFilled = Boolean(nextDaySchedule.breakTo);
    const breakFromMinutes = timeToMinutes(nextDaySchedule.breakFrom);
    const breakToMinutes = timeToMinutes(nextDaySchedule.breakTo);

    if (startMinutes === null || endMinutes === null) {
      throw new Error("Working hours must use HH:mm format");
    }

    if (endMinutes <= startMinutes) {
      throw new Error("End time must be later than start time");
    }

    if (breakFromFilled !== breakToFilled) {
      throw new Error("Break start and break end must both be filled or both empty");
    }

    if (
      breakFromFilled &&
      (breakFromMinutes === null || breakToMinutes === null)
    ) {
      throw new Error("Break time must use HH:mm format");
    }

    if (breakFromFilled && breakToMinutes <= breakFromMinutes) {
      throw new Error("Break end must be later than break start");
    }

    if (
      breakFromFilled &&
      (breakFromMinutes < startMinutes || breakToMinutes > endMinutes)
    ) {
      throw new Error("Break time must be inside working hours");
    }

    sanitized[dayKey] = nextDaySchedule;
  }

  return sanitized;
};

const isAllDaysOffShape = (weeklySchedule = {}) =>
  dayKeys.every((dayKey) => {
    const daySchedule = weeklySchedule?.[dayKey] || {};

    return (
      Object.hasOwn(weeklySchedule || {}, dayKey) &&
      daySchedule.working === false &&
      !daySchedule.from &&
      !daySchedule.to &&
      !daySchedule.breakFrom &&
      !daySchedule.breakTo
    );
  });

export const markExplicitAllDaysOffWeeklySchedule = (weeklySchedule = {}) =>
  isAllDaysOffShape(weeklySchedule)
    ? { ...weeklySchedule, [explicitAllDaysOffMarker]: true }
    : weeklySchedule || {};

export const normalizeAutoClosedWeeklySchedule = (weeklySchedule = {}) => {
  if (weeklySchedule?.[explicitAllDaysOffMarker] && isAllDaysOffShape(weeklySchedule)) {
    return weeklySchedule || {};
  }

  const hasAllDays = dayKeys.every((dayKey) =>
    Object.hasOwn(weeklySchedule || {}, dayKey)
  );

  if (!hasAllDays) return weeklySchedule || {};

  const isOldAutoClosedShape = isAllDaysOffShape(weeklySchedule);

  return isOldAutoClosedShape ? {} : weeklySchedule || {};
};

export const normalizeScheduleForAvailability = (schedule) => {
  if (!schedule) return schedule;

  const weeklySchedule = normalizeAutoClosedWeeklySchedule(schedule.weeklySchedule);
  const cleanedScheduleDates = cleanPastScheduleDates(schedule);

  const hasWeeklyScheduleChanged = weeklySchedule !== schedule.weeklySchedule;
  const hasDateFieldsChanged =
    JSON.stringify(cleanedScheduleDates.dateSchedules) !==
      JSON.stringify(schedule.dateSchedules || {}) ||
    JSON.stringify(cleanedScheduleDates.scheduleOverrides) !==
      JSON.stringify(schedule.scheduleOverrides || {}) ||
    JSON.stringify(cleanedScheduleDates.nonWorkingDays) !==
      JSON.stringify(schedule.nonWorkingDays || []);

  if (!hasWeeklyScheduleChanged && !hasDateFieldsChanged) return schedule;

  return {
    dateSchedules: cleanedScheduleDates.dateSchedules,
    defaultSchedule: schedule.defaultSchedule,
    nonWorkingDays: cleanedScheduleDates.nonWorkingDays,
    scheduleOverrides: cleanedScheduleDates.scheduleOverrides,
    weeklySchedule,
  };
};

export const sanitizeDaySchedule = (daySchedule = {}) => {
  const nextDaySchedule = {
    working: Boolean(daySchedule.working),
    from: daySchedule.from || "",
    to: daySchedule.to || "",
    breakFrom: daySchedule.breakFrom || "",
    breakTo: daySchedule.breakTo || "",
  };

  for (const field of ["from", "to", "breakFrom", "breakTo"]) {
    if (!isTimeKeyOrEmpty(nextDaySchedule[field])) {
      throw new Error("Working hours must use HH:mm format");
    }
  }

  return nextDaySchedule;
};

export const sanitizeDateSchedules = (dateSchedules = {}) => {
  const todayKey = getTodayKey();
  const sanitized = {};

  for (const [dateKey, daySchedule] of Object.entries(
    cleanCurrentAndFutureDateMap(dateSchedules, todayKey)
  )) {
    sanitized[dateKey] = sanitizeDaySchedule(daySchedule);
  }

  return sanitized;
};

export const sanitizeDefaultSchedule = (defaultSchedule = {}) => {
  const hasBreak = Boolean(defaultSchedule.hasBreak);
  const startTime = defaultSchedule.startTime || defaultScheduleFallback.startTime;
  const endTime = defaultSchedule.endTime || defaultScheduleFallback.endTime;
  const breakStart = hasBreak ? defaultSchedule.breakStart || "" : "";
  const breakEnd = hasBreak ? defaultSchedule.breakEnd || "" : "";
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const breakStartMinutes = timeToMinutes(breakStart);
  const breakEndMinutes = timeToMinutes(breakEnd);

  if (startMinutes === null || endMinutes === null) {
    throw new Error("Default working hours must use HH:mm format");
  }

  if (endMinutes <= startMinutes) {
    throw new Error("Default end time must be later than start time");
  }

  if (hasBreak) {
    if (breakStartMinutes === null || breakEndMinutes === null) {
      throw new Error("Default break time must use HH:mm format");
    }

    if (breakEndMinutes <= breakStartMinutes) {
      throw new Error("Default break end must be later than break start");
    }

    if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
      throw new Error("Default break time must be inside working hours");
    }
  }

  return {
    startTime,
    endTime,
    hasBreak,
    breakStart,
    breakEnd,
  };
};

export const sanitizeScheduleOverrides = (scheduleOverrides = {}) => {
  const todayKey = getTodayKey();
  const sanitized = {};

  for (const [dateKey, override] of Object.entries(
    cleanCurrentAndFutureDateMap(scheduleOverrides, todayKey)
  )) {
    const isWorking = Boolean(override?.isWorking);

    if (!isWorking) {
      sanitized[dateKey] = { isWorking: false };
      continue;
    }

    const startTime = override?.startTime || "";
    const endTime = override?.endTime || "";
    const breakStart = override?.breakStart || "";
    const breakEnd = override?.breakEnd || "";
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const hasBreakStart = Boolean(breakStart);
    const hasBreakEnd = Boolean(breakEnd);
    const breakStartMinutes = timeToMinutes(breakStart);
    const breakEndMinutes = timeToMinutes(breakEnd);

    if (startMinutes === null || endMinutes === null) {
      throw new Error("Start time and end time are required");
    }

    if (endMinutes <= startMinutes) {
      throw new Error("End time must be later than start time");
    }

    if (!isTimeKeyOrEmpty(startTime) || !isTimeKeyOrEmpty(endTime)) {
      throw new Error("Working hours must use HH:mm format");
    }

    if (hasBreakStart !== hasBreakEnd) {
      throw new Error("Break start and break end must both be filled or both empty");
    }

    if (
      hasBreakStart &&
      (!isTimeKeyOrEmpty(breakStart) ||
        !isTimeKeyOrEmpty(breakEnd) ||
        breakStartMinutes === null ||
        breakEndMinutes === null)
    ) {
      throw new Error("Break time must use HH:mm format");
    }

    if (hasBreakStart && breakEndMinutes <= breakStartMinutes) {
      throw new Error("Break end must be later than break start");
    }

    if (
      hasBreakStart &&
      (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes)
    ) {
      throw new Error("Break time must be inside working hours");
    }

    sanitized[dateKey] = {
      isWorking: true,
      startTime,
      endTime,
      breakStart,
      breakEnd,
    };
  }

  return sanitized;
};
