import mongoose from "mongoose";

import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { parseOptionalPagination } from "../../utils/requestValidation.js";
import { getIdString } from "./platformBillingCalculations.js";
import { serializePlatformAuditChanges } from "./platformAuditSerializer.js";

const OBJECT_ID_FILTERS = [
  "actorId",
  "salonId",
  "targetUserId",
  "subscriptionId",
  "paymentAttemptId",
];

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const getOptionalString = (value, field) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw createValidationError(`${field} must be a string`);
  return value.trim();
};

const getOptionalDate = (value, field) => {
  const input = getOptionalString(value, field);
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw createValidationError(`Invalid ${field} date`);
  return date;
};

const getReference = (id, values) => {
  const key = getIdString(id);
  if (!key) return { id: null, name: null, missing: true };
  const value = values.get(key);
  return { id: key, name: value?.name || null, ...(value ? {} : { missing: true }) };
};

const serializeAuditLog = (log, users, salons) => ({
  id: getIdString(log._id),
  createdAt: log.createdAt || null,
  action: typeof log.action === "string" ? log.action : "",
  actor: getReference(log.actorId, users),
  ...(log.salonId ? { salon: getReference(log.salonId, salons) } : {}),
  ...(log.targetUserId ? { targetUser: getReference(log.targetUserId, users) } : {}),
  ...(log.subscriptionId ? { subscriptionId: getIdString(log.subscriptionId) } : {}),
  ...(log.paymentAttemptId ? { paymentAttemptId: getIdString(log.paymentAttemptId) } : {}),
  note: typeof log.note === "string" ? log.note : "",
  changes: serializePlatformAuditChanges(log),
});

export const listPlatformAuditLogs = async (params = {}) => {
  const pagination = parseOptionalPagination(params);
  if (!pagination.ok) throw createValidationError(pagination.error);

  const { page, limit, skip } = pagination.value;
  if (!Number.isSafeInteger(skip) || skip < 0) {
    throw createValidationError("Pagination page and limit must be positive integers");
  }

  const filter = {};
  const action = getOptionalString(params.action, "action");
  if (action) filter.action = action;

  for (const field of OBJECT_ID_FILTERS) {
    const value = getOptionalString(params[field], field);
    if (!value) continue;
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw createValidationError(`Invalid ${field}`);
    }
    filter[field] = new mongoose.Types.ObjectId(value);
  }

  const from = getOptionalDate(params.from, "from");
  const to = getOptionalDate(params.to, "to");
  if (from && to && from > to) throw createValidationError("from must not be after to");
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [total, logs] = await Promise.all([
    PlatformAuditLog.countDocuments(filter),
    PlatformAuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const userIds = [...new Set(logs.flatMap((log) => [log.actorId, log.targetUserId])
    .filter(Boolean).map(getIdString))];
  const salonIds = [...new Set(logs.map((log) => getIdString(log.salonId)).filter(Boolean))];
  const [users, salons] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } }).select("_id name").lean()
      : [],
    salonIds.length
      ? Salon.find({ _id: { $in: salonIds } }).select("_id name").lean()
      : [],
  ]);
  const userMap = new Map(users.map((user) => [getIdString(user._id), user]));
  const salonMap = new Map(salons.map((salon) => [getIdString(salon._id), salon]));

  return {
    auditLogs: logs.map((log) => serializeAuditLog(log, userMap, salonMap)),
    page,
    limit,
    total,
  };
};
