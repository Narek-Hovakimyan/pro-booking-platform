import mongoose from "mongoose";

/**
 * Subscription constants and pure helper functions.
 * No DB access, no side effects — safe to import anywhere.
 */

/* ─── Constants ──────────────────────────────────────────── */

export const DEFAULT_PLAN_CODE = "barber_monthly";
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 30;
export const PAID_SUBSCRIPTION_STATUSES = ["trialing", "active"];
export const RECOVERABLE_PAYMENT_ATTEMPT_STATUSES = ["pending", "requires_action"];
export const MANUAL_PROVIDER = "manual";
export const PAYMENT_ATTEMPT_EXPIRY_HOURS = 24;
export const SUBSCRIPTION_SEAT_BARBER_FIELDS =
  "name phone avatarUrl profession salon salonStatus salons.salon salons.status salons.relationshipType salons.relationshipStatus salons.worksAsSpecialist";

/* ─── ID helpers ────────────────────────────────────────── */

export const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

export const getIdsForQuery = (ids) =>
  ids.map((id) =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
  );

export const getOwnerIdForQuery = (ownerId) =>
  mongoose.Types.ObjectId.isValid(ownerId)
    ? new mongoose.Types.ObjectId(ownerId)
    : ownerId;

/* ─── Subscription status helpers ────────────────────────── */

export const isSubscriptionStatusActive = (status) =>
  PAID_SUBSCRIPTION_STATUSES.includes(status);

export const hasUnexpiredPeriod = (subscription, now = new Date()) => {
  if (!subscription?.currentPeriodEnd) return true;

  const periodEnd = new Date(subscription.currentPeriodEnd);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() >= now.getTime();
};

export const subscriptionHasPaidAccess = (
  subscription,
  now = new Date(),
  { statusAlreadyFiltered = false } = {}
) =>
  Boolean(subscription) &&
  (isSubscriptionStatusActive(subscription.status) ||
    (statusAlreadyFiltered && !subscription.status)) &&
  hasUnexpiredPeriod(subscription, now);

/* ─── Query helper ──────────────────────────────────────── */

export const resolveQuery = async (query) => {
  if (query && typeof query.lean === "function") {
    return query.lean();
  }

  return query;
};

/* ─── Date helpers ───────────────────────────────────────── */

export const addDays = (date, days) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

/* ─── Payment helpers ────────────────────────────────────── */

export const normalizePaymentHistoryLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 100);
};

export const buildPaymentAttemptExpiry = (now = new Date()) =>
  new Date(now.getTime() + PAYMENT_ATTEMPT_EXPIRY_HOURS * 60 * 60 * 1000);