import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import { createBookingDepositPaymentAttempt } from "./paymentAttemptService.js";

const enabled =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const originalProvider = process.env.PAYMENT_PROVIDER;
const originalNodeEnv = process.env.NODE_ENV;

const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/booking_deposit_attempt_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await SubscriptionPaymentAttempt.deleteMany({});
  await SubscriptionPaymentAttempt.createIndexes();
};

const booking = (id = new mongoose.Types.ObjectId()) => ({
  _id: id,
  barberId: new mongoose.Types.ObjectId(),
  clientId: new mongoose.Types.ObjectId(),
  depositRequired: true,
  depositAmount: 500,
});

afterEach(async () => {
  process.env.PAYMENT_PROVIDER = originalProvider;
  process.env.NODE_ENV = originalNodeEnv;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
});

test("real Mongo concurrent booking-deposit claims create one attempt", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "mock";
  await connect();
  const target = booking();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      createBookingDepositPaymentAttempt({ booking: target, createdBy: target.clientId })
    )
  );
  const attempts = await SubscriptionPaymentAttempt.find({
    purpose: "booking_deposit",
    bookingId: target._id,
  }).lean();

  assert.equal(attempts.length, 1);
  assert.equal(new Set(results.map((result) => result.paymentAttemptId)).size, 1);
  assert.equal(new Set(results.map((result) => result.checkoutUrl)).size, 1);
});

test("real Mongo keeps different booking-deposit claims independent", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "mock";
  await connect();
  const first = booking();
  const second = booking();
  await Promise.all([
    createBookingDepositPaymentAttempt({ booking: first, createdBy: first.clientId }),
    createBookingDepositPaymentAttempt({ booking: second, createdBy: second.clientId }),
  ]);

  assert.equal(await SubscriptionPaymentAttempt.countDocuments({ purpose: "booking_deposit" }), 2);
});

test("real Mongo index includes malformed booking-deposit bookingIds but excludes subscriptions", { skip: !enabled }, async () => {
  await connect();
  await SubscriptionPaymentAttempt.collection.insertOne({ purpose: "booking_deposit", bookingId: null });
  await assert.rejects(
    () => SubscriptionPaymentAttempt.collection.insertOne({ purpose: "booking_deposit", bookingId: null }),
    (error) => error?.code === 11000
  );
  await assert.doesNotReject(() =>
    SubscriptionPaymentAttempt.collection.insertOne({ purpose: "subscription", bookingId: null })
  );
});
