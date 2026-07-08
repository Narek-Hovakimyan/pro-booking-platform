import { isSubscriptionStatusActive, getDaysRemaining } from "./subscriptionHelpers.js";

/**
 * Serialize a subscription into a standardized status object.
 */
export const serializeSubscriptionStatus = (
  subscription,
  plan = null,
  now = new Date()
) => {
  if (!subscription) return null;

  const raw = subscription.toObject ? subscription.toObject() : subscription;
  const planData = raw.planId && typeof raw.planId === "object" ? raw.planId : plan;
  const currentPeriodEnd = raw.currentPeriodEnd || raw.trialEndsAt || null;
  const rawDaysRemaining = getDaysRemaining(currentPeriodEnd, now);
  const endDate = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const periodEnded =
    endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= now.getTime();
  const isExpired = raw.status === "expired" || Boolean(periodEnded);
  const isActive = isSubscriptionStatusActive(raw.status) && !isExpired;
  const daysRemaining = isActive ? rawDaysRemaining : 0;
  const seatCount = Number(raw.seatCount || 1);
  const pricePerSeat = Number(raw.pricePerSeat ?? planData?.pricePerSeat ?? 0);
  const monthlyTotal = Number(raw.totalPrice ?? pricePerSeat * seatCount);

  return {
    ...raw,
    id: raw.id || raw._id,
    daysRemaining,
    isActive,
    isExpired,
    isExpiringSoon:
      daysRemaining !== null && daysRemaining <= 7 && isActive,
    renewalRequiredAt: currentPeriodEnd,
    currentPeriodEnd,
    monthlyTotal,
    pricePerSeat,
    seatCount,
  };
};