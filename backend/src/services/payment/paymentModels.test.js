import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import PaymentEvent from "../../models/PaymentEvent.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import PaymentTransaction from "../../models/PaymentTransaction.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import {
  serializeAvailabilityBooking,
  serializeBookingForResponse,
} from "../../utils/bookingUtils.js";

const objectId = () => new mongoose.Types.ObjectId();

const makePaymentRecord = (overrides = {}) =>
  new PaymentRecord({
    subscriptionId: objectId(),
    payerId: objectId(),
    ownerType: "barber",
    ownerId: objectId(),
    amount: 5000,
    currency: "AMD",
    seatCount: 1,
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-02-01T00:00:00.000Z"),
    status: "paid",
    provider: "manual",
    paidAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });

const makeSubscriptionPlan = (overrides = {}) =>
  new SubscriptionPlan({
    name: "Barber Monthly",
    code: `barber-monthly-${new mongoose.Types.ObjectId()}`,
    pricePerSeat: 5000,
    currency: "AMD",
    interval: "month",
    ...overrides,
  });

const makeBooking = (overrides = {}) =>
  new Booking({
    barberId: objectId(),
    serviceId: objectId(),
    dayKey: "mon",
    bookingDate: "2099-06-01",
    time: "10:00",
    duration: 30,
    price: 1000,
    ...overrides,
  });

test("existing booking documents remain valid with payment defaults", () => {
  const booking = makeBooking();

  assert.equal(booking.validateSync(), undefined);
  assert.equal(booking.currency, "AMD");
  assert.equal(booking.paidAmount, 0);
  assert.equal(booking.paymentStatus, "not_required");
  assert.equal(booking.paymentProvider, "");
  assert.deepEqual(booking.paymentTransactionIds, []);
  assert.equal(booking.refundStatus, "none");
  assert.equal(booking.refundedAmount, 0);
  assert.deepEqual(booking.refundTransactionIds, []);
});

test("booking payment status defaults to pending when a deposit is required", () => {
  const booking = makeBooking({
    depositRequired: true,
    depositAmount: 250,
    depositStatus: "pending",
  });

  assert.equal(booking.validateSync(), undefined);
  assert.equal(booking.paymentStatus, "pending");
});

test("PaymentTransaction represents booking, subscription, deposit, and refund records", () => {
  const cases = [
    { ownerType: "booking", type: "payment", status: "paid" },
    { ownerType: "subscription", type: "subscription", status: "paid" },
    { ownerType: "booking", type: "deposit", status: "pending" },
    { ownerType: "booking", type: "refund", status: "refunded" },
  ];

  for (const entry of cases) {
    const transaction = new PaymentTransaction({
      ownerType: entry.ownerType,
      ownerId: objectId(),
      userId: objectId(),
      salonId: objectId(),
      provider: "mock",
      providerPaymentId: `pay-${entry.type}`,
      providerTransactionId: `txn-${entry.type}`,
      amount: 500,
      currency: "amd",
      status: entry.status,
      type: entry.type,
      idempotencyKey: `idem-${entry.type}`,
      metadata: { publicReference: entry.type },
    });

    assert.equal(transaction.validateSync(), undefined);
    assert.equal(transaction.currency, "AMD");
    assert.equal(transaction.provider, "mock");
  }
});

test("PaymentEvent defines provider event uniqueness and safe status fields", () => {
  const event = new PaymentEvent({
    provider: "mock",
    providerEventId: "evt-1",
    eventType: "payment.paid",
    ownerType: "booking",
    ownerId: objectId(),
    transactionId: objectId(),
    status: "processed",
    rawPayload: { secret: "provider-private" },
    processedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.equal(event.validateSync(), undefined);
  assert.equal(event.provider, "mock");
  assert.equal(event.status, "processed");
  assert.ok(event.processedAt instanceof Date);

  const uniqueEventIndex = PaymentEvent.schema.indexes().find(
    ([fields, options]) =>
      fields.provider === 1 &&
      fields.providerEventId === 1 &&
      options?.unique === true
  );
  assert.ok(uniqueEventIndex, "provider/providerEventId unique index exists");
});

test("PaymentRecord rejects missing or null business-required fields", () => {
  const cases = [
    { ownerType: undefined, path: "ownerType" },
    { ownerType: null, path: "ownerType" },
    { ownerId: undefined, path: "ownerId" },
    { ownerId: null, path: "ownerId" },
    { periodStart: undefined, path: "periodStart" },
    { periodStart: null, path: "periodStart" },
    { periodEnd: undefined, path: "periodEnd" },
    { periodEnd: null, path: "periodEnd" },
    { status: null, path: "status" },
    { provider: null, path: "provider" },
  ];

  for (const { path, ...overrides } of cases) {
    const error = makePaymentRecord(overrides).validateSync();
    assert.ok(error?.errors?.[path], `${path} should be required`);
  }
});

test("PaymentRecord rejects unsupported currency and invalid seatCount", () => {
  const invalidCurrency = makePaymentRecord({ currency: "USD" }).validateSync();
  assert.ok(invalidCurrency?.errors?.currency);

  for (const seatCount of [-1, 1.5, Number.NaN]) {
    const error = makePaymentRecord({ seatCount }).validateSync();
    assert.ok(error?.errors?.seatCount, `seatCount ${seatCount} should be invalid`);
  }

  assert.equal(makePaymentRecord({ seatCount: 0 }).validateSync(), undefined);
});

test("PaymentRecord keeps manual records valid without providerPaymentId", () => {
  const record = makePaymentRecord({
    provider: "manual",
    providerPaymentId: undefined,
  });

  assert.equal(record.validateSync(), undefined);
  assert.equal(record.providerPaymentId, null);
});

test("SubscriptionPlan rejects missing or invalid currency and interval values", () => {
  for (const overrides of [
    { currency: null },
    { currency: "USD" },
    { interval: null },
    { interval: "year" },
  ]) {
    const error = makeSubscriptionPlan(overrides).validateSync();
    assert.ok(error, `${JSON.stringify(overrides)} should be invalid`);
  }
});

test("public booking availability serialization does not expose payment internals", () => {
  const booking = makeBooking({
    paymentStatus: "paid",
    paymentProvider: "mock",
    paymentTransactionIds: [objectId()],
  });
  booking.rawPayload = { secret: "provider-private" };

  const serialized = serializeAvailabilityBooking(booking, objectId());

  assert.equal(serialized.paymentStatus, undefined);
  assert.equal(serialized.paymentProvider, undefined);
  assert.equal(serialized.paymentTransactionIds, undefined);
  assert.equal(serialized.rawPayload, undefined);
});

test("safe booking response keeps payment snapshot and hides ledger internals", () => {
  const transactionId = objectId();
  const refundTransactionId = objectId();
  const booking = makeBooking({
    currency: "amd",
    paidAmount: 100,
    paymentStatus: "paid",
    paymentProvider: "mock",
    paymentTransactionIds: [transactionId],
    refundStatus: "partially_refunded",
    refundedAmount: 25,
    refundTransactionIds: [refundTransactionId],
  });
  booking.providerPaymentId = "provider-payment";
  booking.providerTransactionId = "provider-transaction";
  booking.rawWebhookPayload = { secret: true };

  const serialized = serializeBookingForResponse(booking);

  assert.equal(serialized.currency, "AMD");
  assert.equal(serialized.paidAmount, 100);
  assert.equal(serialized.paymentStatus, "paid");
  assert.equal(serialized.paymentProvider, "mock");
  assert.equal(serialized.refundStatus, "partially_refunded");
  assert.equal(serialized.refundedAmount, 25);
  assert.equal(serialized.paymentTransactionIds, undefined);
  assert.equal(serialized.refundTransactionIds, undefined);
  assert.equal(serialized.providerPaymentId, undefined);
  assert.equal(serialized.providerTransactionId, undefined);
  assert.equal(serialized.rawWebhookPayload, undefined);
});

test("PaymentEvent rawPayload remains internal by default", () => {
  const rawPayloadPath = PaymentEvent.schema.path("rawPayload");

  assert.equal(rawPayloadPath.options.select, false);
});
