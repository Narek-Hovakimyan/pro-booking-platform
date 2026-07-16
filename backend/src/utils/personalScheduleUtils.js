import { dayKeys, isTimeKeyOrEmpty, timeToMinutes } from "./scheduleUtils.js";

const dayFields = ["working", "from", "to", "breakFrom", "breakTo"];
const requestFields = ["weeklySchedule"];

export class PersonalScheduleValidationError extends Error {
  constructor() {
    super("Invalid personal schedule");
    this.name = "PersonalScheduleValidationError";
  }
}

const invalid = () => {
  throw new PersonalScheduleValidationError();
};

const isPlainObject = (value) => {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const ownKeys = (value) => {
  try {
    return Reflect.ownKeys(value);
  } catch {
    invalid();
  }
};

const hasOwn = (value, key) => {
  try {
    return Object.prototype.hasOwnProperty.call(value, key);
  } catch {
    invalid();
  }
};

const readOwn = (value, key) => {
  if (!hasOwn(value, key)) return { present: false, value: undefined };

  try {
    return { present: true, value: value[key] };
  } catch {
    invalid();
  }
};

const validateOnlyKeys = (value, allowedKeys) => {
  const allowed = new Set(allowedKeys);

  for (const key of ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
  }
};

const createWorkingDay = () => ({
  working: true,
  from: "09:00",
  to: "18:00",
  breakFrom: "",
  breakTo: "",
});

const createNonWorkingDay = () => ({
  working: false,
  from: "",
  to: "",
  breakFrom: "",
  breakTo: "",
});

export const createPersonalDefaultSchedule = () => ({
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
});

export const createCanonicalPersonalSchedule = () => ({
  weeklySchedule: {
    sun: createNonWorkingDay(),
    mon: createWorkingDay(),
    tue: createWorkingDay(),
    wed: createWorkingDay(),
    thu: createWorkingDay(),
    fri: createWorkingDay(),
    sat: createNonWorkingDay(),
  },
  defaultSchedule: createPersonalDefaultSchedule(),
  nonWorkingDays: [],
});

export const getPersonalScheduleRequestWeeklySchedule = (body) => {
  if (!isPlainObject(body)) invalid();
  validateOnlyKeys(body, requestFields);

  const weeklySchedule = readOwn(body, "weeklySchedule");
  if (!weeklySchedule.present) invalid();
  return weeklySchedule.value;
};

const readTime = (day, field, required) => {
  const result = readOwn(day, field);
  if (!result.present) {
    if (required) invalid();
    return "";
  }

  if (typeof result.value !== "string" || !isTimeKeyOrEmpty(result.value)) {
    invalid();
  }

  return result.value;
};

const canonicalizeWorkingDay = (day) => {
  const from = readTime(day, "from", true);
  const to = readTime(day, "to", true);
  const breakFrom = readTime(day, "breakFrom", false);
  const breakTo = readTime(day, "breakTo", false);
  const fromMinutes = timeToMinutes(from);
  const toMinutes = timeToMinutes(to);
  const breakFromMinutes = timeToMinutes(breakFrom);
  const breakToMinutes = timeToMinutes(breakTo);

  if (fromMinutes === null || toMinutes === null || toMinutes <= fromMinutes) {
    invalid();
  }

  if (Boolean(breakFrom) !== Boolean(breakTo)) invalid();

  if (breakFrom) {
    if (
      breakFromMinutes === null ||
      breakToMinutes === null ||
      breakToMinutes <= breakFromMinutes ||
      breakFromMinutes < fromMinutes ||
      breakToMinutes > toMinutes
    ) {
      invalid();
    }
  }

  return { working: true, from, to, breakFrom, breakTo };
};

const canonicalizeDay = (day) => {
  if (!isPlainObject(day)) invalid();
  validateOnlyKeys(day, dayFields);

  const working = readOwn(day, "working");
  if (!working.present || typeof working.value !== "boolean") invalid();

  if (working.value) return canonicalizeWorkingDay(day);

  for (const field of ["from", "to", "breakFrom", "breakTo"]) {
    readOwn(day, field);
  }

  return createNonWorkingDay();
};

export const validatePersonalWeeklySchedule = (weeklySchedule) => {
  if (!isPlainObject(weeklySchedule)) invalid();
  validateOnlyKeys(weeklySchedule, dayKeys);

  const canonical = {};
  let workingDays = 0;

  for (const dayKey of dayKeys) {
    const day = readOwn(weeklySchedule, dayKey);
    if (!day.present) invalid();
    canonical[dayKey] = canonicalizeDay(day.value);
    if (canonical[dayKey].working) workingDays += 1;
  }

  if (workingDays === 0) invalid();
  return canonical;
};

const cloneCanonicalWeeklySchedule = (weeklySchedule) => {
  const cloned = {};

  for (const dayKey of dayKeys) {
    const day = weeklySchedule[dayKey];
    cloned[dayKey] = {
      working: day.working,
      from: day.from,
      to: day.to,
      breakFrom: day.breakFrom,
      breakTo: day.breakTo,
    };
  }

  return cloned;
};

export const serializePersonalSchedule = (schedule, exists) => {
  if (!exists) {
    const canonical = createCanonicalPersonalSchedule();
    return { exists: false, schedule: { ...canonical, updatedAt: null } };
  }

  const weeklySchedule = validatePersonalWeeklySchedule(schedule?.weeklySchedule);
  const updatedAt = schedule?.updatedAt instanceof Date && !Number.isNaN(schedule.updatedAt.getTime())
    ? new Date(schedule.updatedAt.getTime())
    : null;

  return {
    exists: true,
    schedule: {
      weeklySchedule: cloneCanonicalWeeklySchedule(weeklySchedule),
      defaultSchedule: createPersonalDefaultSchedule(),
      nonWorkingDays: [],
      updatedAt,
    },
  };
};
