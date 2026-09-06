import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import { getOrCreateDefaultSubscriptionPlan } from "../subscriptionService.js";
import {
  createPlatformBillingAuditLog,
  runPlatformBillingTransaction,
} from "./platformBillingAuditHelpers.js";
import { getSalonBillingDetail } from "./platformBillingSalonReadService.js";
import { serializeSalonSubscriptionForPlatform } from "./platformBillingSerializers.js";
import {
  PLATFORM_SALON_ACTIVATION_ACTION,
  assertMatchingPlatformBillingOperation,
  createActivationRequestFingerprint,
  createPlatformBillingOperation,
  findPlatformBillingOperation,
  isDuplicatePlatformBillingOperationError,
  normalizePlatformBillingIdempotencyKey,
} from "./platformBillingIdempotencyService.js";
import {
  mutateCanonicalSubscription,
} from "../subscription/subscriptionManualMutations.js";
import { assertSeatCountCanContainActiveSeats } from "../subscription/seatCapacityMutations.js";
import { getOrCreateDefaultSubscriptionPlanWithSession } from "../subscription/subscriptionPaymentMutationTransactionHelpers.js";
import {
  addMonthsToValidDate,
  calculateSafeTotalPrice,
  normalizePositiveSafeInteger,
} from "./platformBillingCalculations.js";

/**
 * Activate or renew a salon subscription.
 * Platform admin only — does NOT require the salon owner to be the actor.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {number} [options.seatCount]
 * @param {number} [options.months=1]
 * @param {string} options.note - Required reason for activation
 * @param {Object} options.actor - req.user (platform admin)
 * @returns {Object} Updated salon billing detail
 */
export const activateSalonSubscription = async (salonId, options = {}) => {
  const { months, note, actor, requestIp } = options;
  const hasSeatCount = options.seatCount !== undefined;

  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const requestedSeatCount = hasSeatCount
    ? normalizePositiveSafeInteger(options.seatCount, "seatCount")
    : null;
  const normalizedMonths = months === undefined
    ? 1
    : normalizePositiveSafeInteger(months, "months");
  const idempotencyKey = normalizePlatformBillingIdempotencyKey(options.idempotencyKey);
  const operationContext = idempotencyKey
    ? {
        key: idempotencyKey,
        actorId: actor?._id,
        action: PLATFORM_SALON_ACTIVATION_ACTION,
        resourceType: "salon",
        resourceId: String(salonId),
        requestFingerprint: createActivationRequestFingerprint({
          months: normalizedMonths,
          hasSeatCount,
          seatCount: requestedSeatCount,
          note,
        }),
      }
    : null;
  const detailBeforeMutation = operationContext
    ? await getSalonBillingDetail(salonId)
    : null;
  let replaySnapshot = null;

  try {
    await runPlatformBillingTransaction(async (session) => {
      if (operationContext) {
        const existing = await findPlatformBillingOperation(operationContext, session);
        if (existing) {
          replaySnapshot = assertMatchingPlatformBillingOperation(
            existing,
            operationContext.requestFingerprint
          );
          return;
        }
      }
    const salon = await Salon.findById(salonId, null, { session }).lean();
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    const plan = session
      ? await getOrCreateDefaultSubscriptionPlanWithSession(session)
      : await getOrCreateDefaultSubscriptionPlan();
    const now = new Date();
    const extendFrom = (periodStart) =>
      addMonthsToValidDate(periodStart, normalizedMonths);
    const mutation = await mutateCanonicalSubscription({
      ownerType: "salon",
      ownerId: salon._id,
      session,
      createPayload: () => {
        const periodStart = now;
        const seatCount = requestedSeatCount ?? 1;
        return {
          ownerType: "salon",
          ownerId: salon._id,
          ownerRefModel: "Salon",
          payerId: salon.ownerId,
          planId: plan._id,
          status: "active",
          seatCount,
          pricePerSeat: plan.pricePerSeat,
          totalPrice: calculateSafeTotalPrice(plan.pricePerSeat, seatCount),
          currentPeriodStart: periodStart,
          currentPeriodEnd: extendFrom(periodStart),
          provider: "manual",
          lastPaymentAt: now,
        };
      },
      updatePayload: (subscription) => {
        const seatCount = requestedSeatCount ?? subscription.seatCount;
        assertSeatCountCanContainActiveSeats(subscription, seatCount);
        const isContinuing =
          ["trialing", "active"].includes(subscription.status) &&
          subscription.currentPeriodEnd &&
          new Date(subscription.currentPeriodEnd) > now;
        const periodStart = isContinuing
          ? new Date(subscription.currentPeriodEnd)
          : now;

        return {
          status: "active",
          seatCount,
          pricePerSeat: plan.pricePerSeat,
          totalPrice: calculateSafeTotalPrice(plan.pricePerSeat, seatCount),
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
      if (operationContext) {
        const previousSeats = detailBeforeMutation?.seats || {
          total: 0, used: 0, available: 0, assignments: [],
        };
        const responseSnapshot = {
          ...detailBeforeMutation,
          subscription: serializeSalonSubscriptionForPlatform(subscription),
          seats: {
            ...previousSeats,
            total: subscription.seatCount,
            available: Math.max(0, subscription.seatCount - previousSeats.used),
          },
        };
        await createPlatformBillingOperation(operationContext, responseSnapshot, session);
        replaySnapshot = responseSnapshot;
      }
    });
  } catch (error) {
    if (!operationContext || !isDuplicatePlatformBillingOperationError(error)) throw error;
    const existing = await findPlatformBillingOperation(operationContext);
    if (!existing) throw error;
    replaySnapshot = assertMatchingPlatformBillingOperation(
      existing,
      operationContext.requestFingerprint
    );
  }

  return replaySnapshot || getSalonBillingDetail(salonId);
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
