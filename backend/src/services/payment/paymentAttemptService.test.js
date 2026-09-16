import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import MockPaymentProvider from "./MockPaymentProvider.js";
import {
  createBookingDepositPaymentAttempt,
  processPaymentWebhook,
} from "./paymentAttemptService.js";

const originalEnv = process.env.NODE_ENV;
const originalProvider = process.env.PAYMENT_PROVIDER;
const originalSecret = process.env.PAYMENT_WEBHOOK_SECRET;
const originalAttemptFindOne = SubscriptionPaymentAttempt.findOne;
const originalAttemptFindOneAndUpdate = SubscriptionPaymentAttempt.findOneAndUpdate;
const originalBookingFindById = Booking.findById;
const originalStartSession = mongoose.startSession;
const readyStateDescriptor = Object.getOwnPropertyDescriptor(
  mongoose.connection,
  "readyState"
);

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalProvider === undefined) {
    delete process.env.PAYMENT_PROVIDER;
  } else {
    process.env.PAYMENT_PROVIDER = originalProvider;
  }
  if (originalSecret === undefined) {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
  } else {
    process.env.PAYMENT_WEBHOOK_SECRET = originalSecret;
  }
  SubscriptionPaymentAttempt.findOne = originalAttemptFindOne;
  SubscriptionPaymentAttempt.findOneAndUpdate = originalAttemptFindOneAndUpdate;
  Booking.findById = originalBookingFindById;
  mongoose.startSession = originalStartSession;
  MockPaymentProvider.paymentIntentsByIdempotencyKey.clear();
  if (readyStateDescriptor) {
    Object.defineProperty(mongoose.connection, "readyState", readyStateDescriptor);
  } else {
    delete mongoose.connection.readyState;
  }
});

test("production manual provider rejects unsigned fake paid webhook", async () => {
  process.env.NODE_ENV = "production";
  process.env.PAYMENT_PROVIDER = "manual";

  await assert.rejects(
    () =>
      processPaymentWebhook({
        rawBody: Buffer.from(
          JSON.stringify({
            id: "evt_fake_paid",
            type: "payment.paid",
            providerPaymentId: "fake-payment-id",
          })
        ),
        headers: {},
      }),
    (error) => error.code === "WEBHOOK_NOT_SUPPORTED" && error.statusCode === 400
  );
});

test("duplicate paid deposit webhook is idempotent", async () => {
  process.env.NODE_ENV = "development";
  process.env.PAYMENT_PROVIDER = "mock";
  process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    get: () => 1,
  });
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      return callback();
    },
    async endSession() {},
  });

  const booking = {
    _id: "booking-1",
    depositStatus: "pending",
    saveCount: 0,
    async save() {
      this.saveCount += 1;
      return this;
    },
  };
  const attempt = {
    _id: "507f1f77bcf86cd799439011",
    purpose: "booking_deposit",
    ownerType: "barber",
    ownerId: "barber-1",
    payerId: "client-1",
    bookingId: "booking-1",
    provider: "mock",
    providerPaymentId: "mock-payment-1",
    amount: 25,
    currency: "AMD",
    status: "pending",
    processedWebhookEventIds: [],
    saveCount: 0,
    async save() {
      this.saveCount += 1;
      return this;
    },
  };

  SubscriptionPaymentAttempt.findOne = async () => attempt;
  SubscriptionPaymentAttempt.findOneAndUpdate = async (filter, update) => {
    if (attempt.processedWebhookEventIds.includes(update.$push.processedWebhookEventIds.$each[0])) return null;
    attempt.processedWebhookEventIds.push(...update.$push.processedWebhookEventIds.$each);
    return attempt;
  };
  Booking.findById = async () => booking;

  const rawBody = Buffer.from(
    JSON.stringify({
      id: "evt_paid_once",
      type: "payment.paid",
      providerPaymentId: "mock-payment-1",
    })
  );
  const headers = { "x-payment-webhook-secret": "test-secret" };

  const first = await processPaymentWebhook({ rawBody, headers });
  const second = await processPaymentWebhook({ rawBody, headers });

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(attempt.status, "paid");
  assert.equal(booking.depositStatus, "paid");
  assert.equal(booking.saveCount, 1);
  assert.equal(attempt.saveCount, 1);
});

test("webhook processing fails closed before mutation when transactions are unavailable", async () => {
  process.env.NODE_ENV = "development";
  process.env.PAYMENT_PROVIDER = "mock";
  process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";

  let attemptedRead = false;
  SubscriptionPaymentAttempt.findOne = async () => {
    attemptedRead = true;
    throw new Error("should not read attempts without a transaction");
  };

  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    get: () => 0,
  });

  await assert.rejects(
    () =>
      processPaymentWebhook({
        rawBody: Buffer.from(
          JSON.stringify({
            id: "evt_requires_tx",
            type: "payment.paid",
            providerPaymentId: "mock-payment-no-session",
          })
        ),
        headers: { "x-payment-webhook-secret": "test-secret" },
      }),
    (error) =>
      error.statusCode === 503 &&
      error.code === "PAYMENT_CONFIRMATION_TRANSACTION_UNAVAILABLE"
  );

  assert.equal(attemptedRead, false);
});

test("payment-attempt schema rejects unsafe references, numbers, currency, metadata, and event growth", async () => {
  const base = {
    purpose: "booking_deposit",
    ownerType: "barber",
    ownerId: "507f1f77bcf86cd799439012",
    payerId: "507f1f77bcf86cd799439013",
    bookingId: "507f1f77bcf86cd799439014",
    amount: 100,
    currency: "AMD",
    seatCount: 1,
    months: 1,
  };
  await assert.doesNotReject(() => new SubscriptionPaymentAttempt(base).validate());
  const subscriptionBase = { ...base, purpose: "subscription", bookingId: null };
  await assert.doesNotReject(() => new SubscriptionPaymentAttempt(subscriptionBase).validate());
  await assert.rejects(() => new SubscriptionPaymentAttempt({ ...subscriptionBase, status: "paid" }).validate());
  await assert.rejects(() => new SubscriptionPaymentAttempt({ ...base, amount: 1.5 }).validate());
  await assert.rejects(() => new SubscriptionPaymentAttempt({ ...base, currency: "USD" }).validate());
  await assert.rejects(() => new SubscriptionPaymentAttempt({ ...base, bookingId: null }).validate());
  await assert.rejects(() => new SubscriptionPaymentAttempt({ ...base, subscriptionId: base.bookingId }).validate());
  await assert.rejects(() => new SubscriptionPaymentAttempt({ ...base, metadata: { nested: { a: { b: { c: { d: { e: 1 } } } } } } }).validate());
  await assert.rejects(() => new SubscriptionPaymentAttempt({ ...base, processedWebhookEventIds: Array.from({ length: 101 }, (_, i) => `evt-${i}`) }).validate());
});

test("booking-deposit retries reuse one claim and deterministic provider intent", async () => {
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "mock";
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    barberId: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(),
    depositRequired: true,
    depositAmount: 500,
  };
  let attempt = null;
  let claims = 0;
  SubscriptionPaymentAttempt.findOneAndUpdate = async (_filter, update) => {
    if (update.$setOnInsert) {
      claims += 1;
      attempt ||= { _id: new mongoose.Types.ObjectId(), ...update.$setOnInsert };
      return attempt;
    }
    Object.assign(attempt, update.$set);
    return attempt;
  };

  const first = await createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId });
  const second = await createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId });

  assert.equal(claims, 2);
  assert.equal(first.paymentAttemptId, String(attempt._id));
  assert.equal(second.paymentAttemptId, String(attempt._id));
  assert.equal(first.checkoutUrl, second.checkoutUrl);
  assert.equal(MockPaymentProvider.paymentIntentsByIdempotencyKey.size, 1);
});

test("booking-deposit retry recovers a provider intent after local persistence failure", async () => {
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "mock";
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    barberId: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(),
    depositRequired: true,
    depositAmount: 500,
  };
  let attempt = null;
  let persistFails = true;
  SubscriptionPaymentAttempt.findOneAndUpdate = async (_filter, update) => {
    if (update.$setOnInsert) {
      attempt ||= { _id: new mongoose.Types.ObjectId(), ...update.$setOnInsert };
      return attempt;
    }
    if (persistFails) {
      persistFails = false;
      throw new Error("local persistence interrupted");
    }
    Object.assign(attempt, update.$set);
    return attempt;
  };

  await assert.rejects(() => createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId }));
  const savedIntent = [...MockPaymentProvider.paymentIntentsByIdempotencyKey.values()][0];
  const resumed = await createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId });

  assert.equal(MockPaymentProvider.paymentIntentsByIdempotencyKey.size, 1);
  assert.equal(attempt.providerPaymentId, savedIntent.providerPaymentId);
  assert.equal(resumed.checkoutUrl, savedIntent.checkoutUrl);
});

test("booking-deposit unique index is scoped to booking-deposit attempts", () => {
  const indexes = SubscriptionPaymentAttempt.schema.indexes();
  const index = indexes.find(([keys]) =>
    keys.purpose === 1 && keys.bookingId === 1 && Object.keys(keys).length === 2
  );

  assert.deepEqual(index[1], {
    unique: true,
    partialFilterExpression: { purpose: "booking_deposit" },
  });
});

test("booking-deposit claim rejects a persisted context mismatch", async () => {
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "manual";
  const booking = {
    _id: new mongoose.Types.ObjectId(), barberId: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(), depositRequired: true, depositAmount: 500,
  };
  SubscriptionPaymentAttempt.findOneAndUpdate = async () => ({
    _id: new mongoose.Types.ObjectId(), purpose: "booking_deposit", ownerType: "barber",
    ownerId: new mongoose.Types.ObjectId(), payerId: booking.clientId, amount: 500, currency: "AMD",
  });

  await assert.rejects(
    () => createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId }),
    (error) => error.code === "BOOKING_DEPOSIT_ATTEMPT_CONTEXT_INVALID" && error.statusCode === 409
  );
});

test("manual and disabled booking deposits preserve safe continuation behavior", async () => {
  const booking = {
    _id: new mongoose.Types.ObjectId(), barberId: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(), depositRequired: true, depositAmount: 500,
  };
  let attempt = null;
  let writes = 0;
  SubscriptionPaymentAttempt.findOneAndUpdate = async (_filter, update) => {
    writes += 1;
    attempt ||= { _id: new mongoose.Types.ObjectId(), ...update.$setOnInsert };
    return attempt;
  };
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "manual";
  const first = await createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId });
  const second = await createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId });
  process.env.PAYMENT_PROVIDER = "disabled";
  const disabled = await createBookingDepositPaymentAttempt({ booking, createdBy: booking.clientId });

  assert.equal(first.paymentAttemptId, second.paymentAttemptId);
  assert.equal(writes, 2);
  assert.equal(disabled.paymentAttemptId, null);
  assert.equal(disabled.provider, "disabled");
});
