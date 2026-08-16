import {
  formatArmeniaCalendarDate,
  getArmeniaDateKey,
  isArmeniaDateKey,
} from "./armeniaDateTime";

export const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const formatUtcDateKey = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey) {
  if (!isDateKey(dateKey)) return null;

  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);

  return formatDateKey(date) === dateKey ? date : null;
}

export function formatDateLabel(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getDayKeyFromDate(date) {
  return weekdayKeys[date.getDay()];
}

export function getNext7Days(options = {}) {
  if (options.armenia === true) return getNext7ArmeniaDays(options.now);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);

    return {
      date,
      value: formatDateKey(date),
      dayKey: getDayKeyFromDate(date),
      label: formatDateLabel(date),
    };
  });
}

export function isToday(dateValue) {
  return dateValue === formatDateKey(new Date());
}

export function isDateKey(dateKey) {
  return typeof dateKey === "string" && DATE_KEY_PATTERN.test(dateKey);
}

export function isPastDateKey(dateKey) {
  return isDateKey(dateKey) && dateKey < formatDateKey(new Date());
}

export const getArmeniaTodayKey = (now = new Date()) => getArmeniaDateKey(now);

export function getArmeniaDayKey(dateKey) {
  if (!isArmeniaDateKey(dateKey)) return "";

  const [year, month, day] = dateKey.split("-").map(Number);
  return weekdayKeys[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function formatArmeniaDateLabel(dateKey) {
  return formatArmeniaCalendarDate(dateKey, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getNext7ArmeniaDays(now = new Date()) {
  const todayKey = getArmeniaTodayKey(now);
  if (!todayKey) return [];

  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + index);
    const value = formatUtcDateKey(date);

    return {
      value,
      dayKey: getArmeniaDayKey(value),
      label: formatArmeniaDateLabel(value),
    };
  });
}

export function isBeforeArmeniaToday(dateKey, now = new Date()) {
  return isArmeniaDateKey(dateKey) && dateKey < getArmeniaTodayKey(now);
}
