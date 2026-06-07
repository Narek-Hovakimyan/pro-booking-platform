import Booking from "../../models/Booking.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import { extendManualSubscription, serializeSubscriptionStatus } from "../subscriptionService.js";
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
    status: raw.status,
    provider: raw.provider,
    providerPaymentId: raw.providerPaymentId || raw.providerIntentId || null,
    checkoutUrl: raw.checkoutUrl || null,
    metadata: raw.metadata || {},
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

  const provider = getPaymentProvider(providerName);
  const paymentIntent = await provider.createPaymentIntent({
    amount: booking.depositAmount,
    currency: "AMD",
    metadata: {
      purpose: "booking_deposit",
      bookingId: getIdString(booking._id),
      barberId: getIdString(booking.barberId),
      clientId: getIdString(booking.clientId),
    },
  });

  const attempt = await SubscriptionPaymentAttempt.create({
    purpose: "booking_deposit",
    ownerType: "barber",
    ownerId: booking.barberId,
    payerId: booking.clientId || createdBy,
    bookingId: booking._id,
    amount: booking.depositAmount,
    currency: "AMD",
    provider: providerName,
    providerPaymentId:
      paymentIntent.providerPaymentId || paymentIntent.providerIntentId || null,
    providerIntentId:
      paymentIntent.providerIntentId || paymentIntent.providerPaymentId || null,
    checkoutUrl: paymentIntent.checkoutUrl || null,
    status: paymentIntent.status || "pending",
    metadata: {
      purpose: "booking_deposit",
      bookingId: getIdString(booking._id),
      barberId: getIdString(booking.barberId),
      clientId: getIdString(booking.clientId),
    },
    createdBy,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

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

const findAttemptForWebhookEvent = async ({ providerName, providerPaymentId }) => {
  if (!providerPaymentId) {
    const error = new Error("Webhook event is missing provider payment id");
    error.code = "WEBHOOK_PAYMENT_ID_MISSING";
    error.statusCode = 400;
    throw error;
  }

  const attempt = await SubscriptionPaymentAttempt.findOne({
    provider: providerName,
    $or: [
      { providerPaymentId },
      { providerIntentId: providerPaymentId },
    ],
  });

  if (!attempt) {
    const error = new Error("Payment attempt not found for webhook event");
    error.code = "PAYMENT_ATTEMPT_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  return attempt;
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

  const attempt = await findAttemptForWebhookEvent({
    providerName,
    providerPaymentId: event.providerPaymentId,
  });
  const eventId =
    event.id || `${providerName}:${event.providerPaymentId}:${nextStatus}`;

  if (attempt.processedWebhookEventIds?.includes(eventId)) {
    return {
      idempotent: true,
      paymentAttempt: serializePaymentAttempt(attempt),
    };
  }

  const transition = applyPaymentAttemptTransition(attempt, nextStatus, now);
  attempt.processedWebhookEventIds = [
    ...(attempt.processedWebhookEventIds || []),
    eventId,
  ];

  let subscription = null;
  let booking = null;

  if (!transition.idempotent && nextStatus === "paid") {
    if ((attempt.purpose || "subscription") === "subscription") {
      subscription = await extendManualSubscription({
        ownerType: attempt.ownerType,
        ownerId: attempt.ownerId,
        payerId: attempt.payerId,
        seatCount: attempt.seatCount,
        months: attempt.months,
        now,
      });
      attempt.subscriptionId = subscription._id;
    }

    if (attempt.purpose === "booking_deposit") {
      booking = await Booking.findById(attempt.bookingId);
      if (booking && booking.depositStatus !== "paid") {
        booking.depositStatus = "paid";
        await booking.save();
      }
    }
  }

  if (!transition.idempotent && nextStatus === "failed" && attempt.purpose === "booking_deposit") {
    booking = await Booking.findById(attempt.bookingId);
    if (booking && booking.depositStatus === "pending") {
      booking.depositStatus = "failed";
      await booking.save();
    }
  }

  if (!transition.idempotent && nextStatus === "refunded" && attempt.purpose === "booking_deposit") {
    booking = await Booking.findById(attempt.bookingId);
    if (booking && booking.depositStatus === "paid") {
      booking.depositStatus = "refunded";
      await booking.save();
    }
  }

  await attempt.save();

  return {
    idempotent: transition.idempotent,
    paymentAttempt: serializePaymentAttempt(attempt),
    subscription: subscription
      ? serializeSubscriptionStatus(subscription, null, now)
      : attempt.subscriptionId
        ? serializeSubscriptionStatus(
            await Subscription.findById(attempt.subscriptionId),
            null,
            now
          )
        : null,
    bookingId: booking ? getIdString(booking._id) : getIdString(attempt.bookingId),
  };
};

export const __paymentAttemptServiceTestHooks = {
  normalizeWebhookStatus,
};
