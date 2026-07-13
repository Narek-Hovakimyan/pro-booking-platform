import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import { getOrCreateDefaultSubscriptionPlan } from "../subscriptionService.js";
import { createAuditLogOrRollback } from "./platformBillingAuditHelpers.js";
import { getSalonBillingDetail } from "./platformBillingSalonReadService.js";

/**
 * Activate or renew a salon subscription.
 * Platform admin only — does NOT require the salon owner to be the actor.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {number} [options.seatCount=1]
 * @param {number} [options.months=1]
 * @param {string} options.note - Required reason for activation
 * @param {Object} options.actor - req.user (platform admin)
 * @returns {Object} Updated salon billing detail
 */
export const activateSalonSubscription = async (salonId, { seatCount = 1, months = 1, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const normalizedSeatCount = Math.max(1, Math.floor(Number(seatCount) || 1));
  const normalizedMonths = Math.max(1, Math.floor(Number(months) || 1));

  let subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  const plan = await getOrCreateDefaultSubscriptionPlan();
  const now = new Date();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;

  // If subscription exists and is active/trialing with future end, extend from end date
  const isContinuing =
    subscription &&
    ["trialing", "active"].includes(subscription.status) &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now;

  const oldValue = subscription
    ? {
        status: subscription.status,
        seatCount: subscription.seatCount,
        currentPeriodEnd: subscription.currentPeriodEnd,
      }
    : null;
  const oldSubscriptionState = subscription
    ? {
        status: subscription.status,
        seatCount: subscription.seatCount,
        pricePerSeat: subscription.pricePerSeat,
        totalPrice: subscription.totalPrice,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        lastPaymentAt: subscription.lastPaymentAt,
        trialEndsAt: subscription.trialEndsAt,
        cancelledAt: subscription.cancelledAt,
        payerId: subscription.payerId,
        planId: subscription.planId,
        provider: subscription.provider,
      }
    : null;

  const periodStart = isContinuing
    ? new Date(subscription.currentPeriodEnd)
    : now;

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + normalizedMonths);

  if (subscription) {
    subscription.status = "active";
    subscription.seatCount = normalizedSeatCount;
    subscription.pricePerSeat = plan.pricePerSeat;
    subscription.totalPrice = monthlyTotal;
    subscription.currentPeriodStart = periodStart;
    subscription.currentPeriodEnd = periodEnd;
    subscription.lastPaymentAt = now;
    subscription.trialEndsAt = undefined;
    subscription.cancelledAt = undefined;
    subscription.payerId = salon.ownerId;
    subscription.planId = plan._id;
    subscription.provider = "manual";
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      ownerType: "salon",
      ownerId: salon._id,
      ownerRefModel: "Salon",
      payerId: salon.ownerId,
      planId: plan._id,
      status: "active",
      seatCount: normalizedSeatCount,
      pricePerSeat: plan.pricePerSeat,
      totalPrice: monthlyTotal,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      provider: "manual",
      lastPaymentAt: now,
    });
  }

  // Create audit log
  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.activate",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: {
        status: subscription.status,
        seatCount: subscription.seatCount,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      note: note.trim(),
      requestIp,
    },
    async () => {
      if (oldSubscriptionState) {
        Object.assign(subscription, oldSubscriptionState);
        await subscription.save();
      } else {
        await Subscription.deleteOne({ _id: subscription._id });
      }
    }
  );

  // Return fresh billing detail
  return getSalonBillingDetail(salonId);
};

/**
 * Cancel/deactivate a salon subscription.
 * Soft cancel only — sets status to 'cancelled', keeps all payment history and seat assignments.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {string} options.note - Required reason for cancellation
 * @param {Object} options.actor - req.user (platform admin)
 * @returns {Object} Updated salon billing detail
 */
export const cancelSalonSubscription = async (salonId, { note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  const cancellableStatuses = ["trialing", "active", "past_due"];
  if (!cancellableStatuses.includes(subscription.status)) {
    const error = new Error(
      `Subscription status "${subscription.status}" cannot be cancelled. Only trialing, active, or past_due subscriptions can be cancelled.`
    );
    error.statusCode = 400;
    throw error;
  }

  const oldValue = {
    status: subscription.status,
    cancelledAt: subscription.cancelledAt,
  };

  subscription.status = "cancelled";
  subscription.cancelledAt = new Date();
  await subscription.save();

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.cancel",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { status: "cancelled", cancelledAt: subscription.cancelledAt },
      note: note.trim(),
      requestIp,
    },
    async () => {
      subscription.status = oldValue.status;
      subscription.cancelledAt = oldValue.cancelledAt;
      await subscription.save();
    }
  );

  return getSalonBillingDetail(salonId);
};
