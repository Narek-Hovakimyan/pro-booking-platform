import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import { getOrCreateDefaultSubscriptionPlan } from "../subscriptionService.js";
import {
  createPlatformBillingAuditLog,
  runPlatformBillingTransaction,
} from "./platformBillingAuditHelpers.js";
import { getSalonBillingDetail } from "./platformBillingSalonReadService.js";
import {
  mutateCanonicalSubscription,
} from "../subscription/subscriptionManualMutations.js";
import { assertSeatCountCanContainActiveSeats } from "../subscription/seatCapacityMutations.js";
import { getOrCreateDefaultSubscriptionPlanWithSession } from "../subscription/subscriptionPaymentMutationTransactionHelpers.js";

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

  await runPlatformBillingTransaction(async (session) => {
    const salon = await Salon.findById(salonId, null, { session }).lean();
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    const normalizedSeatCount = Math.max(1, Math.floor(Number(seatCount) || 1));
    const normalizedMonths = Math.max(1, Math.floor(Number(months) || 1));
    const plan = session
      ? await getOrCreateDefaultSubscriptionPlanWithSession(session)
      : await getOrCreateDefaultSubscriptionPlan();
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
      session,
      createPayload: () => {
        const periodStart = now;
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
          currentPeriodEnd: extendFrom(periodStart),
          provider: "manual",
          lastPaymentAt: now,
        };
      },
      updatePayload: (subscription) => {
        assertSeatCountCanContainActiveSeats(subscription, normalizedSeatCount);
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
    const { subscription, previous } = mutation;
    const oldValue = previous
      ? {
          status: previous.status,
          seatCount: previous.seatCount,
          currentPeriodEnd: previous.currentPeriodEnd,
        }
      : null;

    await createPlatformBillingAuditLog({
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
    session);
  });

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

  await runPlatformBillingTransaction(async (session) => {
    const salon = await Salon.findById(salonId, null, { session }).lean();
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    const subscription = await Subscription.findOne(
      { ownerType: "salon", ownerId: salon._id },
      null,
      { session }
    );
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
    await subscription.save({ session });

    await createPlatformBillingAuditLog({
      actorId: actor._id,
      action: "salon_subscription.cancel",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { status: "cancelled", cancelledAt: subscription.cancelledAt },
      note: note.trim(),
      requestIp,
    },
    session);
  });

  return getSalonBillingDetail(salonId);
};
