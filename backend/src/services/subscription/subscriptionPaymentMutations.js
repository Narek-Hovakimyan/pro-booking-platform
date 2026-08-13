import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import {
  getAuthorizedPaymentAttempt,
  validateSubscriptionRequester,
} from "./subscriptionAuthorization.js";
import {
  getOrCreateDefaultSubscriptionPlan,
  isDevPaymentConfirmationAvailable,
} from "./subscriptionPlanHelpers.js";
import { applyPaymentAttemptTransition } from "../payment/paymentAttemptState.js";
import {
  getConfiguredPaymentProviderName,
  getPaymentProvider,
} from "../payment/paymentProviderFactory.js";
import { serializeUserPaymentAttempt } from "../payment/subscriptionPaymentSerializers.js";
import { serializeSubscriptionStatus } from "./subscriptionSerializers.js";
import { buildPaymentAttemptExpiry } from "./subscriptionHelpers.js";
import { extendManualSubscription } from "./subscriptionManualMutations.js";
import {
  getAuthorizedPaymentAttemptInSession,
  getOrCreateDefaultSubscriptionPlanWithSession,
  runInRequiredTransaction,
} from "./subscriptionPaymentMutationTransactionHelpers.js";
import { updateSubscriptionSeatCount } from "./seatCapacityMutations.js";

const createWithOptionalSession = async (Model, payload, session) => {
  if (!session) return Model.create(payload);

  const [document] = await Model.create([payload], { session });
  return document;
};

export const createSubscriptionPaymentIntent = async ({
  requester,
  ownerType,
  ownerId,
  seatCount = 1,
  months = 1,
  action = "renew",
  providerName = getConfiguredPaymentProviderName(),
  now = new Date(),
}) => {
  if (!["renew", "update_seats"].includes(action)) {
    const error = new Error("action must be 'renew' or 'update_seats'");
    error.statusCode = 400;
    throw error;
  }

  if (!["barber", "salon"].includes(ownerType)) {
    const error = new Error("ownerType must be 'barber' or 'salon'");
    error.statusCode = 400;
    throw error;
  }

  if (!ownerId) {
    const error = new Error("ownerId is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedSeatCount = Number(seatCount ?? 1);
  const normalizedMonths = Number(months ?? 1);
  if (!Number.isInteger(normalizedSeatCount) || normalizedSeatCount < 1) {
    const error = new Error("seatCount must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(normalizedMonths) || normalizedMonths < 1) {
    const error = new Error("months must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  await validateSubscriptionRequester({
    requester,
    ownerType,
    ownerId,
    payerId: ownerType === "barber" ? requester?._id : null,
    action: "prepare",
  });

  const plan = await getOrCreateDefaultSubscriptionPlan();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;

  if (action === "update_seats") {
    const existingSubscription = await Subscription.findOne({ ownerType, ownerId });
    const serializedSubscription = serializeSubscriptionStatus(
      existingSubscription,
      plan,
      now
    );

    if (!serializedSubscription?.isActive) {
      const error = new Error(
        "Subscription must be active before updating seats. Please renew first."
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const amount = monthlyTotal * normalizedMonths;
  const provider = getPaymentProvider(providerName);
  const paymentIntent = await provider.createPaymentIntent({
    amount,
    currency: plan.currency,
    metadata: {
      ownerType,
      ownerId: String(ownerId),
      seatCount: normalizedSeatCount,
      months: action === "update_seats" ? 0 : normalizedMonths,
      planCode: plan.code,
      action,
    },
  });
  const attempt = await SubscriptionPaymentAttempt.create({
    purpose: "subscription",
    ownerType,
    ownerId,
    payerId: requester._id,
    provider: providerName,
    providerPaymentId:
      paymentIntent.providerPaymentId || paymentIntent.providerIntentId || null,
    providerIntentId:
      paymentIntent.providerIntentId || paymentIntent.providerPaymentId || null,
    checkoutUrl: paymentIntent.checkoutUrl || null,
    amount,
    currency: plan.currency,
    seatCount: normalizedSeatCount,
    months: normalizedMonths,
    status: paymentIntent.status || "pending",
    metadata: {
      ownerType,
      ownerId: String(ownerId),
      seatCount: normalizedSeatCount,
      months: action === "update_seats" ? 0 : normalizedMonths,
      planCode: plan.code,
      monthlyTotal,
      action,
    },
    createdBy: requester._id,
    expiresAt: buildPaymentAttemptExpiry(now),
  });

  return {
    checkoutUrl: paymentIntent.checkoutUrl || null,
    requiresManualActivation: Boolean(paymentIntent.requiresManualActivation),
    paymentDisabled: Boolean(paymentIntent.paymentDisabled),
    message: paymentIntent.message || null,
    paymentAttempt: serializeUserPaymentAttempt(attempt),
    seatCount: normalizedSeatCount,
    months: normalizedMonths,
    pricePerSeat: plan.pricePerSeat,
    monthlyTotal,
    amount,
    currency: plan.currency,
    status: attempt.status,
  };
};

export const cancelSubscriptionPaymentAttempt = async ({
  paymentAttemptId,
  requester,
}) => {
  const attempt = await getAuthorizedPaymentAttempt({
    paymentAttemptId,
    requester,
    action: "cancel",
  });

  if (attempt.status !== "pending") {
    const error = new Error("Only pending payment attempts can be cancelled");
    error.statusCode = 400;
    throw error;
  }

  applyPaymentAttemptTransition(attempt, "cancelled");
  await attempt.save();

  return serializeUserPaymentAttempt(attempt);
};

export const confirmSubscriptionPaymentAttempt = async ({
  paymentAttemptId,
  confirmedBy,
  now = new Date(),
}) => {
  if (!isDevPaymentConfirmationAvailable()) {
    const error = new Error("Dev payment confirmation is disabled in production");
    error.statusCode = 403;
    error.code = "DEV_PAYMENT_CONFIRM_DISABLED";
    throw error;
  }

  return runInRequiredTransaction(async (session) => {
    const options = { session };
    const lockedAttempt = await getAuthorizedPaymentAttemptInSession({
      paymentAttemptId,
      requester: confirmedBy,
      action: "confirm",
      session,
    });

    if ((lockedAttempt.purpose || "subscription") !== "subscription") {
      const error = new Error("Only subscription payment attempts can be dev-confirmed");
      error.statusCode = 400;
      throw error;
    }

    if (lockedAttempt.status === "paid") {
      return {
        paymentAttempt: serializeUserPaymentAttempt(lockedAttempt),
        subscription: lockedAttempt.subscriptionId
          ? serializeSubscriptionStatus(
              await Subscription.findById(lockedAttempt.subscriptionId, null, options),
              null,
              now
            )
          : null,
        idempotent: true,
      };
    }

    if (!["pending", "requires_action"].includes(lockedAttempt.status)) {
      const error = new Error("Only pending payment attempts can be confirmed");
      error.statusCode = 400;
      throw error;
    }

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(
      lockedAttempt._id,
      null,
      options
    );

    if (refreshedAttempt.status === "paid") {
      return {
        paymentAttempt: serializeUserPaymentAttempt(refreshedAttempt),
        subscription: refreshedAttempt.subscriptionId
          ? serializeSubscriptionStatus(
              await Subscription.findById(refreshedAttempt.subscriptionId, null, options),
              null,
              now
            )
          : null,
        idempotent: true,
      };
    }

    if (!["pending", "requires_action"].includes(refreshedAttempt.status)) {
      const error = new Error("Only pending payment attempts can be confirmed");
      error.statusCode = 400;
      throw error;
    }

    if (refreshedAttempt.expiresAt && new Date(refreshedAttempt.expiresAt) <= now) {
      refreshedAttempt.status = "expired";
      await refreshedAttempt.save(options);

      const error = new Error("Payment attempt has expired");
      error.statusCode = 400;
      throw error;
    }

    const subscription = await extendManualSubscription({
      ownerType: refreshedAttempt.ownerType,
      ownerId: refreshedAttempt.ownerId,
      payerId: refreshedAttempt.payerId,
      seatCount: refreshedAttempt.seatCount,
      months: refreshedAttempt.months,
      now,
      session,
    });

    applyPaymentAttemptTransition(refreshedAttempt, "paid", now);
    refreshedAttempt.subscriptionId = subscription._id;
    refreshedAttempt.providerPaymentId =
      refreshedAttempt.providerPaymentId ||
      `${refreshedAttempt.provider}:${refreshedAttempt._id}`;
    refreshedAttempt.providerIntentId =
      refreshedAttempt.providerIntentId || refreshedAttempt.providerPaymentId;
    await refreshedAttempt.save(options);

    return {
      paymentAttempt: serializeUserPaymentAttempt(refreshedAttempt),
      subscription: serializeSubscriptionStatus(subscription, null, now),
      idempotent: false,
    };
  });
};

export const confirmSubscriptionSeatUpdate = async ({
  paymentAttemptId,
  confirmedBy,
  now = new Date(),
}) => {
  if (!isDevPaymentConfirmationAvailable()) {
    const error = new Error("Dev payment confirmation is disabled in production");
    error.statusCode = 403;
    error.code = "DEV_PAYMENT_CONFIRM_DISABLED";
    throw error;
  }

  return runInRequiredTransaction(async (session) => {
    const options = { session };
    const lockedAttempt = await getAuthorizedPaymentAttemptInSession({
      paymentAttemptId,
      requester: confirmedBy,
      action: "confirm",
      session,
    });

    if (lockedAttempt.purpose !== "subscription") {
      const error = new Error("Only subscription payment attempts can be dev-confirmed");
      error.statusCode = 400;
      throw error;
    }

    if (lockedAttempt.metadata?.action !== "update_seats") {
      const error = new Error("Only update_seats payment attempts can be confirmed through this endpoint");
      error.statusCode = 400;
      throw error;
    }

    if (lockedAttempt.status === "paid") {
      return {
        paymentAttempt: serializeUserPaymentAttempt(lockedAttempt),
        idempotent: true,
      };
    }

    if (!["pending", "requires_action"].includes(lockedAttempt.status)) {
      const error = new Error("Only pending payment attempts can be confirmed");
      error.statusCode = 400;
      throw error;
    }

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(
      lockedAttempt._id,
      null,
      options
    );

    if (refreshedAttempt.status === "paid") {
      return {
        paymentAttempt: serializeUserPaymentAttempt(refreshedAttempt),
        idempotent: true,
      };
    }

    if (!["pending", "requires_action"].includes(refreshedAttempt.status)) {
      const error = new Error("Only pending payment attempts can be confirmed");
      error.statusCode = 400;
      throw error;
    }

    if (refreshedAttempt.expiresAt && new Date(refreshedAttempt.expiresAt) <= now) {
      refreshedAttempt.status = "expired";
      await refreshedAttempt.save(options);
      const error = new Error("Payment attempt has expired");
      error.statusCode = 400;
      throw error;
    }

    const subscription = await Subscription.findById(
      refreshedAttempt.subscriptionId,
      null,
      options
    ) || await Subscription.findOne(
      { ownerType: refreshedAttempt.ownerType, ownerId: refreshedAttempt.ownerId },
      null,
      options
    );

    if (!subscription) {
      const error = new Error("Subscription not found");
      error.statusCode = 404;
      throw error;
    }

    const serializedSubscription = serializeSubscriptionStatus(
      subscription,
      null,
      now
    );
    if (!serializedSubscription?.isActive) {
      const error = new Error(
        "Subscription must be active before updating seats. Please renew first."
      );
      error.statusCode = 400;
      throw error;
    }

    const oldSeatCount = subscription.seatCount;
    const plan = await getOrCreateDefaultSubscriptionPlanWithSession(session);
    const requestedSeatCount = refreshedAttempt.seatCount || subscription.seatCount;
    const updatedSubscription = await updateSubscriptionSeatCount({
      subscriptionId: subscription._id,
      seatCount: requestedSeatCount,
      updates: {
        totalPrice: plan.pricePerSeat * requestedSeatCount,
        pricePerSeat: plan.pricePerSeat,
        lastPaymentAt: now,
      },
      session,
    });

    const extraSeats = Math.max(
      0,
      requestedSeatCount - oldSeatCount
    );
    await createWithOptionalSession(
      PaymentRecord,
      {
        subscriptionId: updatedSubscription._id,
        payerId: refreshedAttempt.payerId,
        ownerType: refreshedAttempt.ownerType,
        ownerId: refreshedAttempt.ownerId,
        amount: refreshedAttempt.amount,
        currency: refreshedAttempt.currency,
        seatCount: extraSeats,
        periodStart: updatedSubscription.currentPeriodStart,
        periodEnd: updatedSubscription.currentPeriodEnd,
        status: "paid",
        provider: refreshedAttempt.provider || "manual",
        paidAt: now,
      },
      session
    );

    applyPaymentAttemptTransition(refreshedAttempt, "paid", now);
    refreshedAttempt.subscriptionId = updatedSubscription._id;
    await refreshedAttempt.save(options);

    return {
      paymentAttempt: serializeUserPaymentAttempt(refreshedAttempt),
      subscription: serializeSubscriptionStatus(updatedSubscription, null, now),
      idempotent: false,
    };
  });
};
