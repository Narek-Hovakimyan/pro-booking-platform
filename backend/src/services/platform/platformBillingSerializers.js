import { getDaysRemaining } from "../subscriptionService.js";
import { SAFE_PAYMENT_FIELDS } from "./platformBillingConstants.js";

export const serializeSubscriptionForPlatform = (subscription, now = new Date()) => {
  if (!subscription) return null;

  const raw = subscription;
  const currentPeriodEnd = raw.currentPeriodEnd || raw.trialEndsAt || null;
  const daysRemaining = getDaysRemaining(currentPeriodEnd, now);
  const endDate = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const periodEnded =
    endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= now.getTime();
  const isExpired = raw.status === "expired" || Boolean(periodEnded);

  return {
    _id: raw._id,
    ownerType: raw.ownerType,
    ownerId: raw.ownerId,
    status: raw.status,
    isExpired,
    seatCount: Number(raw.seatCount || 1),
    pricePerSeat: Number(raw.pricePerSeat || 0),
    totalPrice: Number(raw.totalPrice || 0),
    provider: raw.provider || "manual",
    currentPeriodStart: raw.currentPeriodStart || null,
    currentPeriodEnd: currentPeriodEnd,
    daysRemaining,
    lastPaymentAt: raw.lastPaymentAt || null,
    trialEndsAt: raw.trialEndsAt || null,
    cancelledAt: raw.cancelledAt || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
};

export const serializeSalonSubscriptionForPlatform = (subscription, now = new Date()) => {
  const serialized = serializeSubscriptionForPlatform(subscription, now);
  if (!serialized) return null;

  return {
    status: serialized.status,
    isExpired: serialized.isExpired,
    seatCount: serialized.seatCount,
    pricePerSeat: serialized.pricePerSeat,
    totalPrice: serialized.totalPrice,
    provider: serialized.provider,
    currentPeriodStart: serialized.currentPeriodStart,
    currentPeriodEnd: serialized.currentPeriodEnd,
    daysRemaining: serialized.daysRemaining,
    lastPaymentAt: serialized.lastPaymentAt,
    trialEndsAt: serialized.trialEndsAt,
    cancelledAt: serialized.cancelledAt,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
  };
};

export const serializeIndividualSubscriptionForPlatform = (subscription, now = new Date()) => {
  const serialized = serializeSubscriptionForPlatform(subscription, now);
  if (!serialized) return null;

  return {
    status: serialized.status,
    isExpired: serialized.isExpired,
    seatCount: serialized.seatCount,
    pricePerSeat: serialized.pricePerSeat,
    totalPrice: serialized.totalPrice,
    provider: serialized.provider,
    currentPeriodStart: serialized.currentPeriodStart,
    currentPeriodEnd: serialized.currentPeriodEnd,
    daysRemaining: serialized.daysRemaining,
    lastPaymentAt: serialized.lastPaymentAt,
    trialEndsAt: serialized.trialEndsAt,
    cancelledAt: serialized.cancelledAt,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
  };
};

export const serializePaymentAttempt = (attempt) => {
  if (!attempt) return null;
  const safe = {
    id: attempt._id,
  };
  for (const field of SAFE_PAYMENT_FIELDS) {
    if (attempt[field] !== undefined) {
      safe[field] = attempt[field];
    }
  }
  safe.source = "payment_attempt";
  if (attempt.metadata?.action) {
    safe.action = attempt.metadata.action;
  }
  // Exclude raw metadata entirely.
  return safe;
};

export const serializePaymentRecord = (record) => {
  if (!record) return null;
  const safe = {
    id: record._id,
  };
  for (const field of SAFE_PAYMENT_FIELDS) {
    if (record[field] !== undefined) {
      safe[field] = record[field];
    }
  }
  safe.source = "payment_record";
  return safe;
};

export const serializeIndividualPaymentAttempt = (attempt) => {
  if (!attempt) return null;

  return {
    id: attempt._id,
    amount: attempt.amount,
    currency: attempt.currency,
    status: attempt.status,
    provider: attempt.provider,
    seatCount: attempt.seatCount,
    months: attempt.months,
    createdAt: attempt.createdAt || null,
    updatedAt: attempt.updatedAt || null,
    paidAt: attempt.paidAt || null,
    confirmedAt: attempt.confirmedAt || null,
    failedAt: attempt.failedAt || null,
    cancelledAt: attempt.cancelledAt || null,
    refundedAt: attempt.refundedAt || null,
    expiresAt: attempt.expiresAt || null,
    source: "payment_attempt",
    action: attempt.metadata?.action,
  };
};

export const serializeIndividualPaymentRecord = (record) => {
  if (!record) return null;

  return {
    id: record._id,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    provider: record.provider,
    seatCount: record.seatCount,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    paidAt: record.paidAt || null,
    periodStart: record.periodStart || null,
    periodEnd: record.periodEnd || null,
    source: "payment_record",
  };
};
