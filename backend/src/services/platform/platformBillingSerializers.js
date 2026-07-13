import { getDaysRemaining } from "../subscriptionService.js";

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
