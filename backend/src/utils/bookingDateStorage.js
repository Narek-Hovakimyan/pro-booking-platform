import { isDateKey } from "./bookingDateTime.js";

export const storedDateToDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    return isDateKey(value) ? value : value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return "";
};
