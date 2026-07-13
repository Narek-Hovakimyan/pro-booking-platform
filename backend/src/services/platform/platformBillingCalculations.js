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
