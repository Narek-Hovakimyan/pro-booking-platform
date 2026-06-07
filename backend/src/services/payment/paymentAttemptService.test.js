import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import { processPaymentWebhook } from "./paymentAttemptService.js";

const originalEnv = process.env.NODE_ENV;
const originalProvider = process.env.PAYMENT_PROVIDER;
const originalSecret = process.env.PAYMENT_WEBHOOK_SECRET;
const originalAttemptFindOne = SubscriptionPaymentAttempt.findOne;
const originalBookingFindById = Booking.findById;

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
  Booking.findById = originalBookingFindById;
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
    _id: "attempt-1",
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
