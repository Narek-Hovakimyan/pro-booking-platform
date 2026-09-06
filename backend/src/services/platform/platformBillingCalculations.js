import mongoose from "mongoose";

export const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

export const escapeRegex = (text) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeSearchTerm = (value) =>
  typeof value === "string" ? value.trim() : "";

export const normalizePositiveSafeInteger = (value, fieldName) => {
  const isSupportedInput =
    typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "");
  const numericValue = isSupportedInput ? Number(value) : NaN;

  if (!Number.isSafeInteger(numericValue) || numericValue < 1) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }

  return numericValue;
};

export const calculateSafeTotalPrice = (pricePerSeat, seatCount) => {
  const totalPrice = Number(pricePerSeat) * seatCount;

  if (!Number.isSafeInteger(totalPrice) || totalPrice < 0) {
    const error = new Error("totalPrice exceeds the supported range");
    error.statusCode = 400;
    throw error;
  }

  return totalPrice;
};

export const addMonthsToValidDate = (periodStart, months) => {
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + months);

  if (!Number.isFinite(periodEnd.getTime())) {
    const error = new Error("subscription period exceeds the supported range");
    error.statusCode = 400;
    throw error;
  }

  return periodEnd;
};

export const paginateQuery = (query, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  return query.skip(skip).limit(safeLimit).lean();
};

export const computeSeatUsage = (seatCount, usedSeats) => {
  const total = Math.max(0, Number(seatCount) || 0);
  const used = Math.max(0, usedSeats);
  return {
    total,
    used,
    available: Math.max(0, total - used),
  };
};

export const getPaymentSortTime = (payment) =>
  new Date(payment?.paidAt || payment?.confirmedAt || payment?.createdAt || 0).getTime();

export const toObjectIdOrNull = (value) => {
  const id = getIdString(value);
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
};
