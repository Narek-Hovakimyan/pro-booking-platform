import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import { getOrCreateDefaultSubscriptionPlan } from "../subscriptionService.js";
import { createAuditLogOrRollback } from "./platformBillingAuditHelpers.js";
import { getSalonBillingDetail } from "./platformBillingSalonReadService.js";
import {
  mutateCanonicalSubscription,
} from "../subscription/subscriptionManualMutations.js";

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

  const plan = await getOrCreateDefaultSubscriptionPlan();
  const now = new Date();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;
  const extendFrom = (periodStart) => {
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + normalizedMonths);
    return periodEnd;
  };
  const mutation = await mutateCanonicalSubscription({
    ownerType: "salon",
    ownerId: salon._id,
    createPayload: () => {
      const periodStart = now;
      const periodEnd = extendFrom(periodStart);
      return {
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
      };
    },
    updatePayload: (subscription) => {
      const isContinuing =
        ["trialing", "active"].includes(subscription.status) &&
        subscription.currentPeriodEnd &&
        new Date(subscription.currentPeriodEnd) > now;
      const periodStart = isContinuing
        ? new Date(subscription.currentPeriodEnd)
        : now;

      return {
        status: "active",
        seatCount: normalizedSeatCount,
        pricePerSeat: plan.pricePerSeat,
        totalPrice: monthlyTotal,
        currentPeriodStart: periodStart,
        currentPeriodEnd: extendFrom(periodStart),
        lastPaymentAt: now,
        trialEndsAt: undefined,
        cancelledAt: undefined,
        payerId: salon.ownerId,
        planId: plan._id,
        provider: "manual",
      };
    },
  });
  const subscription = mutation.subscription;
  const previous = mutation.previous;
  const oldValue = previous
    ? {
        status: previous.status,
        seatCount: previous.seatCount,
        currentPeriodEnd: previous.currentPeriodEnd,
      }
    : null;
  const oldSubscriptionState = previous
    ? {
        status: previous.status,
        seatCount: previous.seatCount,
        pricePerSeat: previous.pricePerSeat,
        totalPrice: previous.totalPrice,
        currentPeriodStart: previous.currentPeriodStart,
        currentPeriodEnd: previous.currentPeriodEnd,
        lastPaymentAt: previous.lastPaymentAt,
        trialEndsAt: previous.trialEndsAt,
        cancelledAt: previous.cancelledAt,
        payerId: previous.payerId,
        planId: previous.planId,
        provider: previous.provider,
      }
    : null;

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
        if (Number.isInteger(subscription.__v)) {
          await Subscription.findOneAndUpdate(
            { _id: subscription._id, __v: subscription.__v },
            { $set: oldSubscriptionState, $inc: { __v: 1 } },
            { returnDocument: "after" }
          );
        } else {
          Object.assign(subscription, oldSubscriptionState);
          await subscription.save();
        }
      } else {
        const filter = Number.isInteger(subscription.__v)
          ? { _id: subscription._id, __v: subscription.__v }
          : { _id: subscription._id };
        await Subscription.deleteOne(filter);
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
