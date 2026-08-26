export const ARMENIA_TIME_ZONE = "Asia/Yerevan";
export const ARMENIA_UTC_OFFSET_HOURS = 4;

const ARMENIA_UTC_OFFSET_MS = ARMENIA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY_PATTERN = /^\d{2}:\d{2}$/;

const formatUtcDateKey = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const isArmeniaDateKey = (dateKey) => {
  if (typeof dateKey !== "string" || !DATE_KEY_PATTERN.test(dateKey)) return false;

  const [year, month, day] = dateKey.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return formatUtcDateKey(candidate) === dateKey;
};

export const isArmeniaTimeKey = (time) => {
  if (typeof time !== "string" || !TIME_KEY_PATTERN.test(time)) return false;

  const [hours, minutes] = time.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

export const getArmeniaDateKey = (date = new Date()) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  return formatUtcDateKey(new Date(date.getTime() + ARMENIA_UTC_OFFSET_MS));
};

export const getArmeniaMonthKey = (date = new Date()) => {
  const dateKey = getArmeniaDateKey(date);
  if (!dateKey) return "";

  const [year, month] = dateKey.split("-");
  return `${year}-${month}`;
};

export const getArmeniaMinutesOfDay = (date = new Date()) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  return (
    date.getUTCHours() * 60 + date.getUTCMinutes() + ARMENIA_UTC_OFFSET_HOURS * 60
  ) % (24 * 60);
};

export const getArmeniaTimeKey = (date = new Date()) => {
  const minutes = getArmeniaMinutesOfDay(date);
  if (minutes === null) return "";

  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
};

export const getArmeniaWeekBounds = (date = new Date()) => {
  const dateKey = getArmeniaDateKey(date);
  if (!dateKey) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = current.getUTCDay() === 0 ? -6 : 1 - current.getUTCDay();
  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startKey: formatUtcDateKey(monday),
    endKey: formatUtcDateKey(sunday),
  };
};

export const addArmeniaDays = (dateKey, offset) => {
  if (!isArmeniaDateKey(dateKey) || !Number.isInteger(offset)) return dateKey;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset);
  return formatUtcDateKey(date);
};

export const getArmeniaWeekStartKey = (date = new Date()) =>
  getArmeniaWeekBounds(date)?.startKey || "";

export const parseArmeniaDateTime = (dateKey, time) => {
  if (!isArmeniaDateKey(dateKey) || !isArmeniaTimeKey(time)) return null;

  const parsed = new Date(`${dateKey}T${time}:00+04:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatArmeniaDate = (date, options) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: ARMENIA_TIME_ZONE,
    ...options,
  }).format(date);
};

export const formatArmeniaCalendarDate = (dateKey, options) => {
  if (!isArmeniaDateKey(dateKey)) return "";

  const [year, month, day] = dateKey.split("-").map(Number);
  return formatArmeniaDate(new Date(Date.UTC(year, month - 1, day)), options);
};
