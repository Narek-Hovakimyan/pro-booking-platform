import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import { processPaymentWebhook } from "./paymentAttemptService.js";
import {
  confirmSubscriptionPaymentAttempt,
  grantSubscriptionGraceToExistingBarbers,
} from "../subscriptionService.js";

const REAL_MONGO_TESTS_ENABLED =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true";
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET,
};

const originals = {
  bookingFindById: Booking.findById,
  bookingSave: Booking.prototype.save,
  paymentRecordCreate: PaymentRecord.create,
  paymentRecordFindOneAndUpdate: PaymentRecord.findOneAndUpdate,
  subscriptionCreate: Subscription.create,
  subscriptionFindOne: Subscription.findOne,
  subscriptionFindOneAndUpdate: Subscription.findOneAndUpdate,
  subscriptionSave: Subscription.prototype.save,
  subscriptionPlanFindOne: SubscriptionPlan.findOne,
  subscriptionPlanCreate: SubscriptionPlan.create,
  salonFindById: Salon.findById,
  attemptFindOne: SubscriptionPaymentAttempt.findOne,
  attemptFindOneAndUpdate: SubscriptionPaymentAttempt.findOneAndUpdate,
  attemptFindById: SubscriptionPaymentAttempt.findById,
  attemptSave: SubscriptionPaymentAttempt.prototype.save,
  startSession: mongoose.startSession,
};

const connectIsolatedDb = async (suffix) => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI");
  }

  const isolatedUri = new URL(mongoUri);
  const databaseName =
    isolatedUri.pathname.replace(/^\/+|\/+$/g, "") || "hairbook_ci_test";
  isolatedUri.pathname = `/aud_${suffix.slice(-20)}_${process.pid}`;

  await mongoose.connect(isolatedUri.toString(), {
    serverSelectionTimeoutMS: 5000,
  });

  await Promise.all([
    Booking.deleteMany({}),
    PaymentRecord.deleteMany({}),
    PlatformAuditLog.deleteMany({}),
    Subscription.deleteMany({}),
    SubscriptionPaymentAttempt.deleteMany({}),
    SubscriptionSeat.deleteMany({}),
    SubscriptionPlan.deleteMany({}),
  ]);
  await Promise.all([
    SubscriptionPaymentAttempt.createIndexes(),
    SubscriptionPlan.createIndexes(),
    Subscription.createIndexes(),
  ]);
};

const restorePatchedMethods = () => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.PAYMENT_PROVIDER === undefined) {
    delete process.env.PAYMENT_PROVIDER;
  } else {
    process.env.PAYMENT_PROVIDER = originalEnv.PAYMENT_PROVIDER;
  }
  if (originalEnv.PAYMENT_WEBHOOK_SECRET === undefined) {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
  } else {
    process.env.PAYMENT_WEBHOOK_SECRET = originalEnv.PAYMENT_WEBHOOK_SECRET;
  }

  Booking.findById = originals.bookingFindById;
  Booking.prototype.save = originals.bookingSave;
  PaymentRecord.create = originals.paymentRecordCreate;
  PaymentRecord.findOneAndUpdate = originals.paymentRecordFindOneAndUpdate;
  Subscription.create = originals.subscriptionCreate;
  Subscription.findOne = originals.subscriptionFindOne;
  Subscription.findOneAndUpdate = originals.subscriptionFindOneAndUpdate;
  Subscription.prototype.save = originals.subscriptionSave;
  SubscriptionPlan.findOne = originals.subscriptionPlanFindOne;
  SubscriptionPlan.create = originals.subscriptionPlanCreate;
  Salon.findById = originals.salonFindById;
  SubscriptionPaymentAttempt.findOne = originals.attemptFindOne;
  SubscriptionPaymentAttempt.findOneAndUpdate = originals.attemptFindOneAndUpdate;
  SubscriptionPaymentAttempt.findById = originals.attemptFindById;
  SubscriptionPaymentAttempt.prototype.save = originals.attemptSave;
  mongoose.startSession = originals.startSession;
};

afterEach(async () => {
  restorePatchedMethods();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
});

const setWebhookEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_PROVIDER = "mock";
  process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";
};

const buildWebhookArgs = (eventId, providerPaymentId, type = "payment.paid") => ({
  rawBody: Buffer.from(
    JSON.stringify({
      id: eventId,
      type,
      providerPaymentId,
    })
  ),
  headers: { "x-payment-webhook-secret": "test-secret" },
});

const createSubscriptionAttempt = async ({
  providerPaymentId,
  ownerId = new mongoose.Types.ObjectId(),
  payerId = new mongoose.Types.ObjectId(),
  amount = 5000,
}) => {
  const attempt = await SubscriptionPaymentAttempt.create({
    purpose: "subscription",
    ownerType: "barber",
    ownerId,
    payerId,
    provider: "mock",
    providerPaymentId,
    providerIntentId: providerPaymentId,
    amount,
    currency: "AMD",
    seatCount: 1,
    months: 1,
    status: "pending",
    metadata: { action: "renew", internal: "ok" },
  });

  return { attempt, ownerId, payerId };
};

const createSalonSubscriptionAttempt = async ({
  providerPaymentId,
  ownerId = new mongoose.Types.ObjectId(),
  salonId = new mongoose.Types.ObjectId(),
}) => {
  await Salon.create({
    _id: salonId,
    name: "Replica Salon",
    city: "Yerevan",
    address: "10 Test St",
    phone: "+37410000000",
    ownerId,
  });

  const attempt = await SubscriptionPaymentAttempt.create({
    purpose: "subscription",
    ownerType: "salon",
    ownerId: salonId,
    payerId: ownerId,
    provider: "mock",
    providerPaymentId,
    providerIntentId: providerPaymentId,
    amount: 15000,
    currency: "AMD",
    seatCount: 3,
    months: 1,
    status: "pending",
    metadata: { action: "renew", internal: "ok" },
  });

  return { attempt, ownerId, salonId };
};

const createBookingAttempt = async ({
  providerPaymentId,
  bookingId = new mongoose.Types.ObjectId(),
  barberId = new mongoose.Types.ObjectId(),
  clientId = new mongoose.Types.ObjectId(),
}) => {
  await Booking.create({
    _id: bookingId,
    barberId,
    clientId,
    serviceId: new mongoose.Types.ObjectId(),
    bookingDate: "2026-08-10",
    dayKey: "mon",
    time: "10:00",
    duration: 30,
    price: 1000,
    serviceName: "Haircut",
    status: "accepted",
    depositRequired: true,
    depositAmount: 1000,
    depositStatus: "pending",
  });

  const attempt = await SubscriptionPaymentAttempt.create({
    purpose: "booking_deposit",
    ownerType: "barber",
    ownerId: barberId,
    payerId: clientId,
    bookingId,
    provider: "mock",
    providerPaymentId,
    providerIntentId: providerPaymentId,
    amount: 1000,
    currency: "AMD",
    seatCount: 1,
    months: 1,
    status: "pending",
    metadata: { purpose: "booking_deposit" },
  });

  return { attempt, bookingId };
};

test(
  "real Mongo grace applies once to a canonical trial winner and preserves its reference",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("grace_canonical_winner");
    const ownerId = new mongoose.Types.ObjectId();
    const now = new Date("2030-01-01T00:00:00.000Z");
    await User.create({
      _id: ownerId,
      name: "Grace Barber",
      phone: `+374${String(Date.now()).slice(-7)}2`,
      email: `grace-${Date.now()}@example.com`,
      password: "hashed-password",
      role: "barber",
    });
    await SubscriptionPlan.create({
      name: "Barber Monthly",
      code: "barber_monthly",
      pricePerSeat: 5000,
      currency: "AMD",
      interval: "month",
      features: [],
      isActive: true,
    });

    const originalFindOne = Subscription.findOne;
    let ownerReads = 0;
    Subscription.findOne = async function patchedFindOne(filter, projection, options) {
      if (filter?.ownerType === "barber" && String(filter.ownerId) === String(ownerId)) {
        ownerReads += 1;
        if (ownerReads === 2) {
          await Subscription.create({
            ownerType: "barber",
            ownerId,
            ownerRefModel: "User",
            payerId: ownerId,
            planId: new mongoose.Types.ObjectId(),
            status: "trialing",
            seatCount: 1,
            pricePerSeat: 5000,
            totalPrice: 5000,
            provider: "manual",
            currentPeriodStart: now,
            currentPeriodEnd: new Date("2030-02-15T00:00:00.000Z"),
          });
          return null;
        }
      }
      return originalFindOne.call(this, filter, projection, options);
    };

    const first = await grantSubscriptionGraceToExistingBarbers({ now, graceDays: 30 });
    const second = await grantSubscriptionGraceToExistingBarbers({ now, graceDays: 30 });
    const subscriptions = await Subscription.find({ ownerType: "barber", ownerId }).lean();
    assert.equal(first.grantedCount, 1);
    assert.equal(second.grantedCount, 0);
    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].status, "active");
    assert.equal(
      subscriptions[0].currentPeriodEnd.getTime(),
      new Date("2030-02-15T00:00:00.000Z").getTime()
    );
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId: subscriptions[0]._id, ownerId }),
      1
    );
  }
);

test(
  "real Mongo concurrent grace requests create one canonical activation and payment record",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("grace_concurrent");
    const ownerId = new mongoose.Types.ObjectId();
    const now = new Date("2030-02-01T00:00:00.000Z");
    await User.create({
      _id: ownerId,
      name: "Concurrent Grace Barber",
      phone: `+374${String(Date.now()).slice(-7)}3`,
      email: `grace-concurrent-${Date.now()}@example.com`,
      password: "hashed-password",
      role: "barber",
    });
    await SubscriptionPlan.create({
      name: "Barber Monthly",
      code: "barber_monthly",
      pricePerSeat: 5000,
      currency: "AMD",
      interval: "month",
      features: [],
      isActive: true,
    });

    await Promise.all([
      grantSubscriptionGraceToExistingBarbers({ now, graceDays: 30 }),
      grantSubscriptionGraceToExistingBarbers({ now, graceDays: 30 }),
    ]);

    const subscriptions = await Subscription.find({ ownerType: "barber", ownerId }).lean();
    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].status, "active");
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId: subscriptions[0]._id, ownerId }),
      1
    );
  }
);

test(
  "real Mongo concurrent paid attempts create one canonical subscription owner",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("canonical_owner_race");
    setWebhookEnv();
    const ownerId = new mongoose.Types.ObjectId();
    const payerId = new mongoose.Types.ObjectId();
    const firstProviderPaymentId = `canonical-a-${Date.now()}`;
    const secondProviderPaymentId = `canonical-b-${Date.now()}`;

    await createSubscriptionAttempt({
      providerPaymentId: firstProviderPaymentId,
      ownerId,
      payerId,
    });
    await createSubscriptionAttempt({
      providerPaymentId: secondProviderPaymentId,
      ownerId,
      payerId,
    });

    await Promise.all([
      processPaymentWebhook(buildWebhookArgs("evt-canonical-a", firstProviderPaymentId)),
      processPaymentWebhook(buildWebhookArgs("evt-canonical-b", secondProviderPaymentId)),
    ]);

    const subscriptions = await Subscription.find({ ownerType: "barber", ownerId }).lean();
    assert.equal(subscriptions.length, 1);
    const [subscription] = subscriptions;
    assert.equal(subscription.status, "active");
    const attempts = await SubscriptionPaymentAttempt.find({ ownerType: "barber", ownerId }).lean();
    assert.equal(attempts.length, 2);
    assert.ok(attempts.every((attempt) => String(attempt.subscriptionId) === String(subscription._id)));
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId: subscription._id, ownerType: "barber", ownerId }),
      2
    );
  }
);

test(
  "real Mongo duplicate webhook calls with the same event id mutate exactly once",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_webhook_same_event");
    setWebhookEnv();

    const providerPaymentId = `mock_same_${Date.now()}`;
    const { ownerId } = await createSubscriptionAttempt({ providerPaymentId });
    const webhookArgs = buildWebhookArgs("evt-paid-same", providerPaymentId);

    const results = await Promise.all([
      processPaymentWebhook(webhookArgs),
      processPaymentWebhook(webhookArgs),
    ]);

    assert.equal(results.filter((result) => result.idempotent === false).length, 1);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 1);
    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 1);

    const attempt = await SubscriptionPaymentAttempt.findOne({ providerPaymentId }).lean();
    assert.equal(attempt.status, "paid");
    assert.deepEqual(attempt.processedWebhookEventIds, ["evt-paid-same"]);
  }
);

test(
  "real Mongo different event ids for one provider payment extend subscription exactly once",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_webhook_diff_event");
    setWebhookEnv();

    const providerPaymentId = `mock_diff_${Date.now()}`;
    const { ownerId } = await createSubscriptionAttempt({ providerPaymentId });

    const [first, second] = await Promise.all([
      processPaymentWebhook(buildWebhookArgs("evt-paid-a", providerPaymentId)),
      processPaymentWebhook(buildWebhookArgs("evt-paid-b", providerPaymentId)),
    ]);

    assert.equal([first, second].filter((result) => result.idempotent === false).length, 1);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 1);

    const subscription = await Subscription.findOne({ ownerType: "barber", ownerId }).lean();
    assert.ok(subscription);
    assert.ok(
      new Date(subscription.currentPeriodEnd).getTime() -
        new Date(subscription.currentPeriodStart).getTime() <
        40 * 24 * 60 * 60 * 1000
    );

    const attempt = await SubscriptionPaymentAttempt.findOne({ providerPaymentId }).lean();
    assert.equal(attempt.status, "paid");
    assert.equal(attempt.processedWebhookEventIds.length, 2);
    assert.deepEqual([...attempt.processedWebhookEventIds].sort(), [
      "evt-paid-a",
      "evt-paid-b",
    ]);
  }
);

test(
  "real Mongo sequential different event ids for one provider payment mutate exactly once",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_webhook_sequential_diff_event");
    setWebhookEnv();

    const providerPaymentId = `mock_seq_${Date.now()}`;
    const { ownerId } = await createSubscriptionAttempt({ providerPaymentId });

    const first = await processPaymentWebhook(
      buildWebhookArgs("evt-paid-seq-a", providerPaymentId)
    );
    const second = await processPaymentWebhook(
      buildWebhookArgs("evt-paid-seq-b", providerPaymentId)
    );

    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 1);
    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 1);

    const attempt = await SubscriptionPaymentAttempt.findOne({ providerPaymentId }).lean();
    assert.equal(attempt.status, "paid");
    assert.deepEqual(attempt.processedWebhookEventIds, [
      "evt-paid-seq-a",
      "evt-paid-seq-b",
    ]);
  }
);

test(
  "real Mongo rollback removes intermediate subscription, payment attempt state, event claims, seats, and audit",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_webhook_rollback");
    setWebhookEnv();

    const providerPaymentId = `mock_rollback_${Date.now()}`;
    const { attempt, ownerId } = await createSubscriptionAttempt({ providerPaymentId });
    const originalPaymentRecordCreate = PaymentRecord.create;

    PaymentRecord.create = async function patchedCreate(docs, options) {
      const session = options?.session;
      const visibleSubscription = await Subscription.findOne(
        { ownerType: "barber", ownerId },
        null,
        session ? { session } : undefined
      );
      assert.ok(visibleSubscription, "subscription write should be visible in-transaction");
      throw new Error("force mid-transaction failure");
    };

    await assert.rejects(
      () => processPaymentWebhook(buildWebhookArgs("evt-paid-rollback", providerPaymentId)),
      /force mid-transaction failure/
    );

    PaymentRecord.create = originalPaymentRecordCreate;

    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 0);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 0);
    assert.equal(await SubscriptionSeat.countDocuments({}), 0);
    assert.equal(await PlatformAuditLog.countDocuments({}), 0);

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    assert.equal(refreshedAttempt.status, "pending");
    assert.equal(refreshedAttempt.subscriptionId, null);
    assert.deepEqual(refreshedAttempt.processedWebhookEventIds, []);
  }
);

test(
  "real Mongo booking webhook rollback preserves booking payment state and is retryable",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_booking_retry");
    setWebhookEnv();

    const providerPaymentId = `mock_booking_rollback_${Date.now()}`;
    const { bookingId } = await createBookingAttempt({ providerPaymentId });
    const originalBookingSave = Booking.prototype.save;
    let failOnce = true;

    Booking.prototype.save = async function patchedBookingSave(options) {
      await originalBookingSave.call(this, options);
      if (failOnce) {
        failOnce = false;
        throw new Error("force booking transaction failure");
      }
      return this;
    };

    await assert.rejects(
      () => processPaymentWebhook(buildWebhookArgs("evt-booking-rollback", providerPaymentId)),
      /force booking transaction failure/
    );

    let booking = await Booking.findById(bookingId).lean();
    assert.equal(booking.depositStatus, "pending");

    let attempt = await SubscriptionPaymentAttempt.findOne({ providerPaymentId }).lean();
    assert.equal(attempt.status, "pending");
    assert.deepEqual(attempt.processedWebhookEventIds, []);

    const retry = await processPaymentWebhook(
      buildWebhookArgs("evt-booking-rollback", providerPaymentId)
    );
    assert.equal(retry.idempotent, false);

    booking = await Booking.findById(bookingId).lean();
    assert.equal(booking.depositStatus, "paid");
    attempt = await SubscriptionPaymentAttempt.findOne({ providerPaymentId }).lean();
    assert.equal(attempt.status, "paid");
    assert.deepEqual(attempt.processedWebhookEventIds, ["evt-booking-rollback"]);
    assert.equal(await PaymentRecord.countDocuments({}), 0);
    assert.equal(await SubscriptionSeat.countDocuments({}), 0);
    assert.equal(await PlatformAuditLog.countDocuments({}), 0);
  }
);

test(
  "real Mongo webhook mutation passes one transaction session through booking, subscription, and payment-attempt writes",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_webhook_session");
    setWebhookEnv();

    const providerPaymentId = `mock_session_${Date.now()}`;
    const capture = {
      bookingRead: new Set(),
      bookingSave: new Set(),
      subscriptionRead: new Set(),
      subscriptionWrite: new Set(),
      planRead: new Set(),
      planWrite: new Set(),
      paymentCreate: new Set(),
      paymentWrite: new Set(),
      attemptRead: new Set(),
      attemptClaim: new Set(),
      attemptSave: new Set(),
    };

    Booking.findById = function patchedFindById(id, projection, options) {
      capture.bookingRead.add(Boolean(options?.session));
      return originals.bookingFindById.call(this, id, projection, options);
    };
    Booking.prototype.save = function patchedBookingSave(options) {
      capture.bookingSave.add(Boolean(options?.session));
      return originals.bookingSave.call(this, options);
    };
    Subscription.findOne = function patchedSubscriptionFindOne(filter, projection, options) {
      if (filter?.ownerType && filter?.ownerId) {
        capture.subscriptionRead.add(Boolean(options?.session));
      }
      return originals.subscriptionFindOne.call(this, filter, projection, options);
    };
    Subscription.create = function patchedSubscriptionCreate(docs, options) {
      capture.subscriptionWrite.add(Boolean(options?.session));
      return originals.subscriptionCreate.call(this, docs, options);
    };
    Subscription.findOneAndUpdate = function patchedSubscriptionFindOneAndUpdate(
      filter,
      update,
      options
    ) {
      capture.subscriptionWrite.add(Boolean(options?.session));
      return originals.subscriptionFindOneAndUpdate.call(this, filter, update, options);
    };
    Subscription.prototype.save = function patchedSubscriptionSave(options) {
      capture.subscriptionWrite.add(Boolean(options?.session));
      return originals.subscriptionSave.call(this, options);
    };
    SubscriptionPlan.findOne = function patchedPlanFindOne(filter, projection, options) {
      capture.planRead.add(Boolean(options?.session));
      return originals.subscriptionPlanFindOne.call(this, filter, projection, options);
    };
    SubscriptionPlan.create = function patchedPlanCreate(docs, options) {
      capture.planWrite.add(Boolean(options?.session));
      return originals.subscriptionPlanCreate.call(this, docs, options);
    };
    PaymentRecord.create = function patchedPaymentCreate(docs, options) {
      capture.paymentCreate.add(Boolean(options?.session));
      return originals.paymentRecordCreate.call(this, docs, options);
    };
    PaymentRecord.findOneAndUpdate = function patchedPaymentUpdate(filter, update, options) {
      capture.paymentWrite.add(Boolean(options?.session));
      return originals.paymentRecordFindOneAndUpdate.call(this, filter, update, options);
    };
    SubscriptionPaymentAttempt.findOne = function patchedAttemptFindOne(
      filter,
      projection,
      options
    ) {
      if (filter?.provider) {
        capture.attemptRead.add(Boolean(options?.session));
      }
      return originals.attemptFindOne.call(this, filter, projection, options);
    };
    SubscriptionPaymentAttempt.findOneAndUpdate = function patchedAttemptClaim(
      filter,
      update,
      options
    ) {
      capture.attemptClaim.add(Boolean(options?.session));
      return originals.attemptFindOneAndUpdate.call(this, filter, update, options);
    };
    SubscriptionPaymentAttempt.prototype.save = function patchedAttemptSave(options) {
      capture.attemptSave.add(Boolean(options?.session));
      return originals.attemptSave.call(this, options);
    };

    const { bookingId } = await createBookingAttempt({ providerPaymentId: `${providerPaymentId}_booking` });
    await processPaymentWebhook(
      buildWebhookArgs("evt-booking-paid", `${providerPaymentId}_booking`)
    );

    await createSubscriptionAttempt({ providerPaymentId });
    const response = await processPaymentWebhook(
      buildWebhookArgs("evt-subscription-paid", providerPaymentId)
    );

    const booking = await Booking.findOne({ _id: bookingId }).lean();
    assert.equal(booking.depositStatus, "paid");
    assert.deepEqual(response.paymentAttempt.metadata, {
      action: "renew",
      internal: "ok",
    });

    assert.deepEqual([...capture.bookingRead], [true]);
    assert.deepEqual([...capture.bookingSave], [true]);
    assert.deepEqual([...capture.subscriptionRead], [true]);
    assert.deepEqual([...capture.subscriptionWrite], [true]);
    assert.deepEqual([...capture.planRead], [true]);
    assert.deepEqual([...capture.planWrite], [true]);
    assert.deepEqual([...capture.paymentCreate], [true]);
    assert.deepEqual([...capture.paymentWrite], [true]);
    assert.deepEqual([...capture.attemptRead], [true]);
    assert.deepEqual([...capture.attemptClaim], [true]);
    assert.deepEqual([...capture.attemptSave], [true]);
  }
);

test(
  "real Mongo webhook fails closed when a transaction session is unavailable",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_webhook_missing_session");
    setWebhookEnv();

    const providerPaymentId = `mock_missing_session_${Date.now()}`;
    const { attempt, ownerId } = await createSubscriptionAttempt({ providerPaymentId });

    mongoose.startSession = async () => null;

    await assert.rejects(
      () => processPaymentWebhook(buildWebhookArgs("evt-webhook-no-session", providerPaymentId)),
      (error) =>
        error.statusCode === 503 &&
        error.code === "PAYMENT_CONFIRMATION_TRANSACTION_UNAVAILABLE"
    );

    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 0);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 0);
    assert.equal(await SubscriptionSeat.countDocuments({}), 0);
    assert.equal(await PlatformAuditLog.countDocuments({}), 0);

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    assert.equal(refreshedAttempt.status, "pending");
    assert.equal(refreshedAttempt.subscriptionId, null);
    assert.deepEqual(refreshedAttempt.processedWebhookEventIds, []);
  }
);

test(
  "real Mongo dev confirmation uses the transactional subscription extension path",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("payment_confirmation_transaction");
    setWebhookEnv();

    const ownerId = new mongoose.Types.ObjectId();
    const payerId = ownerId;
    const { attempt } = await createSubscriptionAttempt({
      providerPaymentId: `mock_confirm_${Date.now()}`,
      ownerId,
      payerId,
    });
    const seenSessions = {
      subscriptionRead: new Set(),
      paymentCreate: new Set(),
      attemptSave: new Set(),
    };

    Subscription.findOne = function patchedSubscriptionFindOne(filter, projection, options) {
      if (filter?.ownerType && filter?.ownerId) {
        seenSessions.subscriptionRead.add(Boolean(options?.session));
      }
      return originals.subscriptionFindOne.call(this, filter, projection, options);
    };
    PaymentRecord.create = function patchedPaymentCreate(docs, options) {
      seenSessions.paymentCreate.add(Boolean(options?.session));
      return originals.paymentRecordCreate.call(this, docs, options);
    };
    SubscriptionPaymentAttempt.prototype.save = function patchedAttemptSave(options) {
      seenSessions.attemptSave.add(Boolean(options?.session));
      return originals.attemptSave.call(this, options);
    };

    const response = await confirmSubscriptionPaymentAttempt({
      paymentAttemptId: attempt._id,
      confirmedBy: { _id: payerId, role: "barber" },
    });

    assert.equal(response.idempotent, false);
    assert.deepEqual([...seenSessions.subscriptionRead], [true]);
    assert.deepEqual([...seenSessions.paymentCreate], [true]);
    assert.deepEqual([...seenSessions.attemptSave], [true]);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 1);
    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 1);
  }
);

test(
  "real Mongo dev confirmation keeps authorization, idempotency, and default plan reads inside the shared transaction",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("confirm_shared_session");
    setWebhookEnv();

    const providerPaymentId = `mock_confirm_auth_${Date.now()}`;
    const { attempt, ownerId, salonId } = await createSalonSubscriptionAttempt({
      providerPaymentId,
    });
    const seenSessions = {
      attemptRead: new Set(),
      salonRead: new Set(),
      planRead: new Set(),
      planCreate: new Set(),
    };

    SubscriptionPaymentAttempt.findById = function patchedFindById(id, projection, options) {
      if (String(id) === String(attempt._id)) {
        seenSessions.attemptRead.add(Boolean(options?.session));
      }
      return originals.attemptFindById.call(this, id, projection, options);
    };
    Salon.findById = function patchedSalonFindById(id, projection, options) {
      if (String(id) === String(salonId)) {
        seenSessions.salonRead.add(Boolean(options?.session));
      }
      return originals.salonFindById.call(this, id, projection, options);
    };
    SubscriptionPlan.findOne = function patchedPlanFindOne(filter, projection, options) {
      if (filter?.code === "barber_monthly") {
        seenSessions.planRead.add(Boolean(options?.session));
      }
      return originals.subscriptionPlanFindOne.call(this, filter, projection, options);
    };
    SubscriptionPlan.create = function patchedPlanCreate(docs, options) {
      seenSessions.planCreate.add(Boolean(options?.session));
      return originals.subscriptionPlanCreate.call(this, docs, options);
    };

    const response = await confirmSubscriptionPaymentAttempt({
      paymentAttemptId: attempt._id,
      confirmedBy: { _id: ownerId, role: "barber" },
    });

    assert.equal(response.idempotent, false);
    assert.deepEqual([...seenSessions.attemptRead], [true]);
    assert.deepEqual([...seenSessions.salonRead], [true]);
    assert.deepEqual([...seenSessions.planRead], [true]);
    assert.deepEqual([...seenSessions.planCreate], [true]);
  }
);

test(
  "real Mongo dev confirmation fails closed when a transaction session is unavailable",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("confirm_missing_session");
    setWebhookEnv();

    const providerPaymentId = `mock_confirm_missing_session_${Date.now()}`;
    const { attempt, ownerId } = await createSubscriptionAttempt({ providerPaymentId });

    mongoose.startSession = async () => null;

    await assert.rejects(
      () =>
        confirmSubscriptionPaymentAttempt({
          paymentAttemptId: attempt._id,
          confirmedBy: { _id: ownerId, role: "barber" },
        }),
      (error) =>
        error.statusCode === 503 &&
        error.code === "PAYMENT_CONFIRMATION_TRANSACTION_UNAVAILABLE"
    );

    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 0);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 0);

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    assert.equal(refreshedAttempt.status, "pending");
  }
);

test(
  "real Mongo concurrent duplicate dev confirmations mutate exactly once",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("confirm_duplicate");
    setWebhookEnv();

    const providerPaymentId = `mock_confirm_dupe_${Date.now()}`;
    const { attempt, ownerId } = await createSubscriptionAttempt({ providerPaymentId });

    const results = await Promise.allSettled([
      confirmSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        confirmedBy: { _id: ownerId, role: "barber" },
      }),
      confirmSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        confirmedBy: { _id: ownerId, role: "barber" },
      }),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(
      results.filter(
        (result) => result.status === "fulfilled" && result.value.idempotent === false
      ).length,
      1
    );
    assert.equal(
      results.filter(
        (result) => result.status === "fulfilled" && result.value.idempotent === true
      ).length,
      1
    );
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 1);
    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 1);

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    assert.equal(refreshedAttempt.status, "paid");
  }
);

test(
  "real Mongo dev confirmation rolls back atomically and retry succeeds exactly once",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("confirm_rollback");
    setWebhookEnv();

    const providerPaymentId = `mock_confirm_rollback_${Date.now()}`;
    const { attempt, ownerId } = await createSubscriptionAttempt({
      providerPaymentId,
      // One seat for one month is billed at the default plan's 5,000 AMD.
      // Keep this valid so the injected save failure exercises rollback.
      amount: 5000,
    });

    let failOnce = true;
    SubscriptionPaymentAttempt.prototype.save = async function patchedSave(options) {
      if (failOnce && String(this._id) === String(attempt._id) && this.status === "paid") {
        const visibleSubscription = await Subscription.findOne(
          { ownerType: "barber", ownerId },
          null,
          options?.session ? { session: options.session } : undefined
        );
        const visiblePayment = await PaymentRecord.findOne(
          { ownerType: "barber", ownerId },
          null,
          options?.session ? { session: options.session } : undefined
        );
        assert.ok(visibleSubscription);
        assert.ok(visiblePayment);
        failOnce = false;
        throw new Error("force confirmation transaction failure");
      }

      return originals.attemptSave.call(this, options);
    };

    await assert.rejects(
      () =>
        confirmSubscriptionPaymentAttempt({
          paymentAttemptId: attempt._id,
          confirmedBy: { _id: ownerId, role: "barber" },
        }),
      /force confirmation transaction failure/
    );

    let refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    assert.equal(refreshedAttempt.status, "pending");
    assert.equal(refreshedAttempt.subscriptionId, null);
    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 0);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 0);

    const retry = await confirmSubscriptionPaymentAttempt({
      paymentAttemptId: attempt._id,
      confirmedBy: { _id: ownerId, role: "barber" },
    });

    assert.equal(retry.idempotent, false);
    assert.equal(await Subscription.countDocuments({ ownerType: "barber", ownerId }), 1);
    assert.equal(await PaymentRecord.countDocuments({ ownerId }), 1);
    refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    assert.equal(refreshedAttempt.status, "paid");
  }
);
