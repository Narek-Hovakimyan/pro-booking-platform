import Booking from "../../models/Booking.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import {
  getOrCreateDefaultSubscriptionPlanWithSession,
  runInRequiredTransaction,
} from "../subscription/subscriptionPaymentMutationTransactionHelpers.js";
import { extendManualSubscription } from "../subscription/subscriptionManualMutations.js";
import { serializeSubscriptionStatus } from "../subscription/subscriptionSerializers.js";
import { applyPaymentAttemptTransition } from "./paymentAttemptState.js";
import {
  getConfiguredPaymentProviderName,
  getPaymentProvider,
} from "./paymentProviderFactory.js";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

const TERMINAL_STATUSES = new Set(["paid", "failed", "refunded", "cancelled", "expired"]);

const isTerminalIdempotentStatus = (currentStatus, nextStatus) =>
  currentStatus === nextStatus && TERMINAL_STATUSES.has(nextStatus);

const serializePaymentAttempt = (attempt) => {
  if (!attempt) return null;
  const raw = attempt.toObject ? attempt.toObject() : attempt;

  return {
    id: raw.id || raw._id,
    _id: raw._id,
    purpose: raw.purpose || "subscription",
    ownerType: raw.ownerType,
    ownerId: raw.ownerId,
    payerId: raw.payerId,
    bookingId: raw.bookingId || null,
    subscriptionId: raw.subscriptionId || null,
    amount: raw.amount,
    currency: raw.currency,
    metadata: raw.metadata ?? {},
    status: raw.status,
    provider: raw.provider,
    providerPaymentId: raw.providerPaymentId || raw.providerIntentId || null,
    checkoutUrl: raw.checkoutUrl || null,
    paidAt: raw.paidAt || null,
    confirmedAt: raw.confirmedAt || null,
    failedAt: raw.failedAt || null,
    refundedAt: raw.refundedAt || null,
  };
};

export const buildSafePaymentMetadata = ({
  attempt = null,
  providerName = getConfiguredPaymentProviderName(),
  status = "pending",
  message = "",
} = {}) => ({
  paymentAttemptId: attempt ? getIdString(attempt._id) : null,
  paymentStatus: attempt?.status || status,
  checkoutUrl: attempt?.checkoutUrl || null,
  provider: attempt?.provider || providerName,
  message:
    message ||
    (attempt?.checkoutUrl
      ? "Deposit payment can be completed online."
      : "Deposit is required, but online payment is not enabled yet."),
});

const BOOKING_DEPOSIT_PURPOSE = "booking_deposit";
const BOOKING_DEPOSIT_CURRENCY = "AMD";
const bookingDepositIdempotencyKey = (bookingId) =>
  `booking-deposit:${getIdString(bookingId)}`;
const bookingDepositClaimPayload = ({ booking, createdBy, providerName, now }) => ({
  purpose: BOOKING_DEPOSIT_PURPOSE, ownerType: "barber", ownerId: booking.barberId,
  payerId: booking.clientId || createdBy, bookingId: booking._id, amount: booking.depositAmount,
  currency: BOOKING_DEPOSIT_CURRENCY, provider: providerName,
  providerIdempotencyKey: bookingDepositIdempotencyKey(booking._id),
  status: "pending", metadata: { purpose: BOOKING_DEPOSIT_PURPOSE }, createdBy,
  expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
});

const isDuplicateKeyError = (error) => error?.code === 11000 || error?.codeName === "DuplicateKey";
const claimBookingDepositAttempt = async ({ booking, createdBy, providerName, now }) => {
  const claim = bookingDepositClaimPayload({ booking, createdBy, providerName, now });
  try {
    return await SubscriptionPaymentAttempt.findOneAndUpdate({ purpose: BOOKING_DEPOSIT_PURPOSE, bookingId: booking._id }, { $setOnInsert: claim }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return SubscriptionPaymentAttempt.findOne({ purpose: BOOKING_DEPOSIT_PURPOSE, bookingId: booking._id });
  }
};

const assertBookingDepositAttemptMatchesBooking = ({ attempt, booking, createdBy }) => {
  const payerId = booking.clientId || createdBy;
  const matches = attempt && attempt.ownerType === "barber" &&
    getIdString(attempt.ownerId) === getIdString(booking.barberId) &&
    getIdString(attempt.payerId) === getIdString(payerId) && attempt.amount === booking.depositAmount &&
    attempt.currency === BOOKING_DEPOSIT_CURRENCY;
  if (matches) return;
  const error = new Error("Booking deposit payment attempt context is invalid");
  error.code = "BOOKING_DEPOSIT_ATTEMPT_CONTEXT_INVALID";
  error.statusCode = 409;
  throw error;
};

const hasBookingDepositContinuation = (attempt) => Boolean(attempt?.providerPaymentId || attempt?.providerIntentId || attempt?.checkoutUrl) || attempt?.provider === "manual" || TERMINAL_STATUSES.has(attempt?.status);

export const createBookingDepositPaymentAttempt = async ({
  booking,
  createdBy,
  now = new Date(),
}) => {
  if (!booking?.depositRequired || Number(booking.depositAmount || 0) <= 0) {
    return null;
  }

  const providerName = getConfiguredPaymentProviderName();
  if (providerName === "disabled") {
    return buildSafePaymentMetadata({
      providerName,
      message: "Deposit is required, but online payment is not enabled yet.",
    });
  }

  let attempt = await claimBookingDepositAttempt({ booking, createdBy, providerName, now });
  assertBookingDepositAttemptMatchesBooking({ attempt, booking, createdBy });
  if (hasBookingDepositContinuation(attempt)) {
    return buildSafePaymentMetadata({ attempt });
  }

  const idempotencyKey = attempt.providerIdempotencyKey || bookingDepositIdempotencyKey(booking._id);
  const provider = getPaymentProvider(attempt.provider || providerName);
  const paymentIntent = await provider.createPaymentIntent({
    amount: booking.depositAmount,
    currency: BOOKING_DEPOSIT_CURRENCY,
    idempotencyKey,
    metadata: {
      purpose: "booking_deposit",
      bookingId: getIdString(booking._id),
      barberId: getIdString(booking.barberId),
      clientId: getIdString(booking.clientId),
    },
  });

  attempt = await SubscriptionPaymentAttempt.findOneAndUpdate(
    { _id: attempt._id, purpose: BOOKING_DEPOSIT_PURPOSE, bookingId: booking._id },
    {
      $set: {
        provider: attempt.provider || providerName,
        providerIdempotencyKey: idempotencyKey,
        providerPaymentId: paymentIntent.providerPaymentId || paymentIntent.providerIntentId || null,
        providerIntentId: paymentIntent.providerIntentId || paymentIntent.providerPaymentId || null,
        checkoutUrl: paymentIntent.checkoutUrl || null,
        status: paymentIntent.status || "pending",
      },
    },
    { new: true }
  );
  if (!attempt) {
    const error = new Error("Booking deposit payment attempt could not be persisted");
    error.code = "BOOKING_DEPOSIT_ATTEMPT_PERSIST_FAILED";
    error.statusCode = 503;
    throw error;
  }

  return buildSafePaymentMetadata({
    attempt,
    message:
      paymentIntent.message ||
      "Deposit is required, but online payment is not enabled yet.",
  });
};

const normalizeWebhookStatus = (event) => {
  const rawStatus = String(event.status || event.type || "").toLowerCase();

  if (["paid", "succeeded", "payment.paid", "payment_intent.succeeded"].includes(rawStatus)) {
    return "paid";
  }

  if (["failed", "payment.failed", "payment_intent.payment_failed"].includes(rawStatus)) {
    return "failed";
  }

  if (["refunded", "payment.refunded", "charge.refunded"].includes(rawStatus)) {
    return "refunded";
  }

  return null;
};

const findAttemptForWebhookEvent = async ({
  providerName,
  providerPaymentId,
  session = null,
}) => {
  if (!providerPaymentId) {
    const error = new Error("Webhook event is missing provider payment id");
    error.code = "WEBHOOK_PAYMENT_ID_MISSING";
    error.statusCode = 400;
    throw error;
  }

  const attempt = await SubscriptionPaymentAttempt.findOne(
    {
      provider: providerName,
      $or: [
        { providerPaymentId },
        { providerIntentId: providerPaymentId },
      ],
    },
    null,
    session ? { session } : undefined
  );

  if (!attempt) {
    const error = new Error("Payment attempt not found for webhook event");
    error.code = "PAYMENT_ATTEMPT_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  return attempt;
};

const findAttemptById = (attemptId, session = null) =>
  SubscriptionPaymentAttempt.findOne(
    { _id: attemptId },
    null,
    session ? { session } : undefined
  );

const finalizationError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const paymentRecordReference = (attempt) =>
  attempt.providerPaymentId || attempt.providerIntentId || `${attempt.provider}:${attempt._id}`;

const resolveSubscriptionForAttempt = async (attempt, options) => {
  const subscription = attempt.subscriptionId
    ? await Subscription.findById(attempt.subscriptionId, null, options)
    : await Subscription.findOne(
      { ownerType: attempt.ownerType, ownerId: attempt.ownerId },
      null,
      options
    );

  if (!subscription && attempt.subscriptionId) {
    throw finalizationError("Subscription not found for payment attempt", 404);
  }
  if (subscription && (
    subscription.ownerType !== attempt.ownerType ||
    getIdString(subscription.ownerId) !== getIdString(attempt.ownerId)
  )) {
    throw finalizationError("Payment attempt subscription does not match its owner");
  }
  return subscription;
};

const verifyPaidSubscriptionFinalization = async ({ attempt, subscription, options }) => {
  if (attempt.subscriptionId && getIdString(attempt.subscriptionId) !== getIdString(subscription._id)) {
    throw finalizationError("Paid payment attempt has an invalid subscription linkage", 409);
  }
  if (subscription.status !== "active") {
    throw finalizationError("Paid payment attempt is missing its subscription effect", 409);
  }

  const payment = await PaymentRecord.findOne(
    {
      subscriptionId: subscription._id,
      ownerType: attempt.ownerType,
      ownerId: attempt.ownerId,
      providerPaymentId: paymentRecordReference(attempt),
      status: "paid",
    },
    null,
    options
  );
  if (!payment) {
    throw finalizationError("Paid payment attempt is missing its accounting record", 409);
  }
};

export const finalizeSubscriptionPaymentAttempt = async ({
  attempt,
  now = new Date(),
  session,
  confirmedAt = null,
}) => {
  if (!session) {
    throw finalizationError("Payment confirmation requires an active database transaction", 503);
  }
  if (!attempt || (attempt.purpose || "subscription") !== "subscription") {
    throw finalizationError("Only subscription payment attempts can be finalized");
  }
  if (!["barber", "salon"].includes(attempt.ownerType) || !attempt.ownerId || !attempt.payerId) {
    throw finalizationError("Payment attempt owner context is invalid");
  }

  const options = { session };
  const subscription = await resolveSubscriptionForAttempt(attempt, options);
  if (attempt.status === "paid") {
    if (!subscription) {
      throw finalizationError("Paid payment attempt is missing its subscription effect", 409);
    }
    await verifyPaidSubscriptionFinalization({ attempt, subscription, options });
    return { attempt, subscription, idempotent: true };
  }
  if (!["pending", "requires_action"].includes(attempt.status)) {
    throw finalizationError("Only pending payment attempts can be finalized");
  }

  const plan = subscription
    ? await SubscriptionPlan.findById(subscription.planId, null, options)
    : await getOrCreateDefaultSubscriptionPlanWithSession(session);
  if (!plan) {
    throw finalizationError("Subscription plan not found for payment attempt", 409);
  }
  const expectedAmount = plan.pricePerSeat * attempt.seatCount * attempt.months;
  if (attempt.amount !== expectedAmount) {
    throw finalizationError("Payment attempt amount does not match the subscription plan");
  }
  if (attempt.currency !== plan.currency) {
    throw finalizationError("Payment attempt currency does not match the subscription plan");
  }

  const finalizedSubscription = await extendManualSubscription({
    ownerType: attempt.ownerType,
    ownerId: attempt.ownerId,
    payerId: attempt.payerId,
    seatCount: attempt.seatCount,
    months: attempt.months,
    now,
    session,
    plan,
  });
  const providerPaymentId = paymentRecordReference(attempt);
  const payment = await PaymentRecord.findOneAndUpdate(
    {
      subscriptionId: finalizedSubscription._id,
      ownerType: attempt.ownerType,
      ownerId: attempt.ownerId,
      amount: attempt.amount,
      currency: attempt.currency,
      periodStart: finalizedSubscription.currentPeriodStart,
      periodEnd: finalizedSubscription.currentPeriodEnd,
      paidAt: now,
      providerPaymentId: null,
      status: "paid",
    },
    { $set: { providerPaymentId } },
    { returnDocument: "after", session }
  );
  if (!payment) {
    throw finalizationError("Subscription accounting record could not be finalized", 409);
  }

  attempt.subscriptionId = finalizedSubscription._id;
  attempt.providerPaymentId = attempt.providerPaymentId || providerPaymentId;
  attempt.providerIntentId = attempt.providerIntentId || attempt.providerPaymentId;
  attempt.status = "paid";
  attempt.paidAt = now;
  if (confirmedAt) attempt.confirmedAt = confirmedAt;
  await attempt.save(options);

  return { attempt, subscription: finalizedSubscription, idempotent: false };
};

export const processPaymentWebhook = async ({
  rawBody,
  headers,
  now = new Date(),
}) => {
  const providerName = getConfiguredPaymentProviderName();
  const provider = getPaymentProvider(providerName);
  const event = await provider.parseWebhookEvent(rawBody, headers);
  const nextStatus = normalizeWebhookStatus(event);

  if (!nextStatus) {
    return { ignored: true, message: "Unsupported payment webhook event" };
  }

  const eventId =
    event.id || `${providerName}:${event.providerPaymentId}:${nextStatus}`;
  const run = async (session = null) => {
    const options = session ? { session } : undefined;
    const attempt = await findAttemptForWebhookEvent({
      providerName,
      providerPaymentId: event.providerPaymentId,
      session,
    });
    const claimed = await SubscriptionPaymentAttempt.findOneAndUpdate(
      { _id: attempt._id, processedWebhookEventIds: { $ne: eventId } },
      { $push: { processedWebhookEventIds: { $each: [eventId], $slice: -100 } } },
      { returnDocument: "after", ...options }
    );
    if (!claimed) {
      const current = await findAttemptById(attempt._id, session);
      return { idempotent: true, paymentAttempt: serializePaymentAttempt(current) };
    }

    if (isTerminalIdempotentStatus(claimed.status, nextStatus)) {
      if (nextStatus === "paid" && (claimed.purpose || "subscription") === "subscription") {
        const finalized = await finalizeSubscriptionPaymentAttempt({
          attempt: claimed,
          now,
          session,
        });
        return {
          idempotent: true,
          paymentAttempt: serializePaymentAttempt(finalized.attempt),
          subscription: finalized.subscription,
          attempt: finalized.attempt,
        };
      }
      return {
        idempotent: true,
        paymentAttempt: serializePaymentAttempt(claimed),
        attempt: claimed,
      };
    }

    let transition = { idempotent: false };
    let subscription = null;
    let booking = null;

    if (
      nextStatus === "paid" &&
      (claimed.purpose || "subscription") === "subscription"
    ) {
      const finalized = await finalizeSubscriptionPaymentAttempt({
        attempt: claimed,
        now,
        session,
      });
      subscription = finalized.subscription;
      transition = { idempotent: finalized.idempotent };
    } else {
      transition = applyPaymentAttemptTransition(claimed, nextStatus, now);
    }

    if (
      !transition.idempotent && claimed.purpose === "booking_deposit" &&
      ["paid", "failed", "refunded"].includes(nextStatus)
    ) {
      booking = await Booking.findById(claimed.bookingId, null, options);
      const target = { paid: "paid", failed: "failed", refunded: "refunded" }[nextStatus];
      const expected = { paid: "pending", failed: "pending", refunded: "paid" }[nextStatus];
      if (booking && booking.depositStatus === expected) {
        booking.depositStatus = target;
        await booking.save(options);
      }
    }

    if (!transition.idempotent && !(nextStatus === "paid" && (claimed.purpose || "subscription") === "subscription")) {
      await claimed.save(options);
    }
    return {
      idempotent: transition.idempotent,
      paymentAttempt: serializePaymentAttempt(claimed),
      subscription,
      booking,
      attempt: claimed,
    };
  };

  const result = await runInRequiredTransaction(async (session) => run(session));

  if (result.idempotent) return result;
  const { subscription, booking, attempt: processedAttempt } = result;
  const attemptForResponse = processedAttempt;

  return {
    idempotent: result.idempotent,
    paymentAttempt: result.paymentAttempt,
    subscription: subscription
      ? serializeSubscriptionStatus(subscription, null, now)
      : attemptForResponse.subscriptionId
        ? serializeSubscriptionStatus(
            await Subscription.findById(attemptForResponse.subscriptionId),
            null,
            now
          )
        : null,
    bookingId: booking ? getIdString(booking._id) : getIdString(attemptForResponse.bookingId),
  };
};

export const __paymentAttemptServiceTestHooks = {
  normalizeWebhookStatus,
};
