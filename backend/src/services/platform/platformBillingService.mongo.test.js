import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import PaymentRecord from "../../models/PaymentRecord.js";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import {
  activateSalonSubscription,
  confirmSalonPayment,
} from "./platformBillingService.js";
import { assignActiveSeat } from "../subscription/seatCapacityMutations.js";

const REAL_MONGO_TESTS_ENABLED =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true";

const originals = {
  platformAuditLogCreate: PlatformAuditLog.create,
  startSession: mongoose.startSession,
  subscriptionFindOneAndUpdate: Subscription.findOneAndUpdate,
};

const actorId = new mongoose.Types.ObjectId();
const requestIp = "203.0.113.10";

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
    PaymentRecord.deleteMany({}),
    PlatformAuditLog.deleteMany({}),
    Salon.deleteMany({}),
    Subscription.deleteMany({}),
    SubscriptionPaymentAttempt.deleteMany({}),
    SubscriptionPlan.deleteMany({}),
    SubscriptionSeat.deleteMany({}),
    User.deleteMany({}),
  ]);
  await Promise.all([
    SubscriptionPaymentAttempt.createIndexes(),
    SubscriptionPlan.createIndexes(),
    Subscription.createIndexes(),
    SubscriptionSeat.createIndexes(),
  ]);
};

afterEach(async () => {
  PlatformAuditLog.create = originals.platformAuditLogCreate;
  mongoose.startSession = originals.startSession;
  Subscription.findOneAndUpdate = originals.subscriptionFindOneAndUpdate;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
});

const createFixture = async ({ providerPaymentId, attemptStatus = "pending" }) => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const subscriptionId = new mongoose.Types.ObjectId();
  const planId = new mongoose.Types.ObjectId();

  await User.create({
    _id: ownerId,
    name: "Salon Owner",
    phone: `+374${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 10))}`,
    email: `owner-${providerPaymentId}@example.com`,
    password: "hashed-password",
    role: "barber",
  });

  await Salon.create({
    _id: salonId,
    name: "Replica Salon",
    city: "Yerevan",
    address: "10 Test St",
    phone: "+37410000000",
    ownerId,
  });
  await SubscriptionPlan.create({
    _id: planId,
    name: "Fixture Monthly",
    code: `fixture_${providerPaymentId}`,
    pricePerSeat: 5000,
    currency: "AMD",
    interval: "month",
    features: [],
    isActive: true,
  });

  await Subscription.create({
    _id: subscriptionId,
    ownerType: "salon",
    ownerId: salonId,
    ownerRefModel: "Salon",
    payerId: ownerId,
    planId,
    status: "trialing",
    seatCount: 2,
    pricePerSeat: 5000,
    totalPrice: 10000,
    provider: "manual",
    currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
  });

  const attempt = await SubscriptionPaymentAttempt.create({
    purpose: "subscription",
    ownerType: "salon",
    ownerId: salonId,
    payerId: ownerId,
    subscriptionId,
    provider: "manual",
    providerPaymentId,
    providerIntentId: providerPaymentId,
    amount: 15000,
    currency: "AMD",
    seatCount: 3,
    months: 1,
    status: attemptStatus,
    metadata: { action: "renew" },
  });

  return { attempt, salonId, ownerId, subscriptionId };
};

const createActivationFixture = async ({
  status = "active",
  seatCount = 5,
  activeSeatCount = 0,
  currentPeriodEnd = new Date("2030-02-01T00:00:00.000Z"),
} = {}) => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const planId = new mongoose.Types.ObjectId();

  await User.create({
    _id: ownerId,
    name: "Activation Owner",
    phone: `+374${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 10))}`,
    email: `activation-owner-${salonId}@example.com`,
    password: "hashed-password",
    role: "barber",
  });
  await Salon.create({
    _id: salonId,
    name: "Activation Salon",
    city: "Yerevan",
    address: "10 Test St",
    phone: "+37410000004",
    ownerId,
  });
  await SubscriptionPlan.create({
    _id: planId,
    name: "Barber Monthly",
    code: "barber_monthly",
    pricePerSeat: 5000,
    currency: "AMD",
    interval: "month",
    features: [],
    isActive: true,
  });
  const subscription = await Subscription.create({
    ownerType: "salon",
    ownerId: salonId,
    ownerRefModel: "Salon",
    payerId: ownerId,
    planId,
    status,
    seatCount,
    activeSeatCount,
    pricePerSeat: 5000,
    totalPrice: seatCount * 5000,
    provider: "manual",
    currentPeriodStart: new Date("2030-01-01T00:00:00.000Z"),
    currentPeriodEnd,
  });
  await SubscriptionSeat.create(
    Array.from({ length: activeSeatCount }, () => ({
      subscriptionId: subscription._id,
      salonId,
      barberId: new mongoose.Types.ObjectId(),
      assignedBy: ownerId,
      status: "active",
    }))
  );

  return { salonId, subscriptionId: subscription._id };
};

test(
  "real Mongo simultaneous platform activations preserve both extensions",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_activation_race");
    const ownerId = new mongoose.Types.ObjectId();
    const salonId = new mongoose.Types.ObjectId();
    const initialEnd = new Date("2030-01-01T00:00:00.000Z");

    await User.create({
      _id: ownerId,
      name: "Platform Salon Owner",
      phone: `+374${String(Date.now()).slice(-7)}1`,
      email: `platform-owner-${Date.now()}@example.com`,
      password: "hashed-password",
      role: "barber",
    });
    await Salon.create({
      _id: salonId,
      name: "Concurrent Platform Salon",
      city: "Yerevan",
      address: "10 Test St",
      phone: "+37410000001",
      ownerId,
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
    await Subscription.create({
      ownerType: "salon",
      ownerId: salonId,
      ownerRefModel: "Salon",
      payerId: ownerId,
      planId: new mongoose.Types.ObjectId(),
      status: "active",
      seatCount: 1,
      pricePerSeat: 5000,
      totalPrice: 5000,
      provider: "manual",
      currentPeriodStart: new Date("2029-12-01T00:00:00.000Z"),
      currentPeriodEnd: initialEnd,
    });

    await Promise.all([
      activateSalonSubscription(String(salonId), {
        actor: { _id: actorId }, note: "January extension", requestIp,
      }),
      activateSalonSubscription(String(salonId), {
        actor: { _id: actorId }, note: "February extension", requestIp,
      }),
    ]);

    const subscriptions = await Subscription.find({ ownerType: "salon", ownerId: salonId }).lean();
    assert.equal(subscriptions.length, 1);
    const expectedEnd = new Date(initialEnd);
    expectedEnd.setMonth(expectedEnd.getMonth() + 2);
    assert.equal(subscriptions[0].currentPeriodEnd.getTime(), expectedEnd.getTime());
    assert.equal(
      await PlatformAuditLog.countDocuments({ action: "salon_subscription.activate", salonId }),
      2
    );
  }
);

test(
  "real Mongo platform activation preserves omitted multi-seat capacity with active assignments",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_activation_omitted_active_seats");
    const { salonId, subscriptionId } = await createActivationFixture({
      seatCount: 5,
      activeSeatCount: 4,
    });

    const result = await activateSalonSubscription(String(salonId), {
      actor: { _id: actorId },
      note: "Renew without seat count",
      requestIp,
    });

    const refreshed = await Subscription.findById(subscriptionId).lean();
    assert.equal(result.subscription.seatCount, 5);
    assert.equal(refreshed.seatCount, 5);
    assert.equal(refreshed.totalPrice, 25000);
    assert.equal(refreshed.activeSeatCount, 4);
    assert.equal(
      await PlatformAuditLog.countDocuments({
        action: "salon_subscription.activate",
        salonId,
        "oldValue.seatCount": 5,
        "newValue.seatCount": 5,
      }),
      1
    );
  }
);

test(
  "real Mongo platform activation does not shrink idle existing capacity when seatCount is omitted",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_activation_omitted_idle_seats");
    const { salonId, subscriptionId } = await createActivationFixture({
      seatCount: 5,
      activeSeatCount: 0,
    });

    await activateSalonSubscription(String(salonId), {
      actor: { _id: actorId },
      note: "Renew idle capacity",
      requestIp,
    });

    const refreshed = await Subscription.findById(subscriptionId).lean();
    assert.equal(refreshed.seatCount, 5);
    assert.equal(refreshed.totalPrice, 25000);
  }
);

test(
  "real Mongo platform activation rejects string Infinity before durable mutation",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_activation_rejects_non_finite_count");
    const { salonId, subscriptionId } = await createActivationFixture({
      seatCount: 5,
      activeSeatCount: 0,
    });

    await assert.rejects(
      () => activateSalonSubscription(String(salonId), {
        actor: { _id: actorId },
        note: "Reject non-finite seat count",
        seatCount: "Infinity",
        requestIp,
      }),
      { statusCode: 400 }
    );

    const refreshed = await Subscription.findById(subscriptionId).lean();
    assert.equal(refreshed.seatCount, 5);
    assert.equal(refreshed.totalPrice, 25000);
    assert.equal(await PlatformAuditLog.countDocuments({ salonId }), 0);
  }
);

test(
  "real Mongo platform activation rejects unsafe totals and unrepresentable periods",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_activation_rejects_unsafe_calculations");
    const { salonId, subscriptionId } = await createActivationFixture({
      seatCount: 5,
      activeSeatCount: 0,
    });

    for (const options of [
      { seatCount: String(Number.MAX_SAFE_INTEGER) },
      { months: String(Number.MAX_SAFE_INTEGER) },
    ]) {
      await assert.rejects(
        () => activateSalonSubscription(String(salonId), {
          actor: { _id: actorId },
          note: "Reject unsafe calculation",
          ...options,
          requestIp,
        }),
        { statusCode: 400 }
      );
    }

    const refreshed = await Subscription.findById(subscriptionId).lean();
    assert.equal(refreshed.seatCount, 5);
    assert.equal(refreshed.totalPrice, 25000);
    assert.equal(await PlatformAuditLog.countDocuments({ salonId }), 0);
  }
);

test(
  "real Mongo platform activation reduction cannot bypass current seat capacity with a stale __v",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_seat_reduction_race");
    const ownerId = new mongoose.Types.ObjectId();
    const salonId = new mongoose.Types.ObjectId();
    await User.create({
      _id: ownerId,
      name: "Seat Race Owner",
      phone: `+374${String(Date.now()).slice(-7)}2`,
      email: `seat-race-${Date.now()}@example.com`,
      password: "hashed-password",
      role: "barber",
    });
    await Salon.create({ _id: salonId, name: "Seat Race Salon", city: "Yerevan", address: "1 Test St", phone: "+37410000002", ownerId });
    const plan = await SubscriptionPlan.create({ name: "Barber Monthly", code: "barber_monthly", pricePerSeat: 5000, currency: "AMD", interval: "month", features: [], isActive: true });
    const subscription = await Subscription.create({
      ownerType: "salon", ownerId: salonId, ownerRefModel: "Salon", payerId: ownerId, planId: plan._id,
      status: "active", seatCount: 2, activeSeatCount: 1, pricePerSeat: 5000, totalPrice: 10000,
      provider: "manual", currentPeriodStart: new Date("2030-01-01T00:00:00.000Z"), currentPeriodEnd: new Date("2030-02-01T00:00:00.000Z"),
    });
    await SubscriptionSeat.create({ subscriptionId: subscription._id, salonId, barberId: new mongoose.Types.ObjectId(), assignedBy: ownerId, status: "active" });
    let entered;
    const enteredPromise = new Promise((resolve) => { entered = resolve; });
    let release;
    const releasePromise = new Promise((resolve) => { release = resolve; });
    let intercepted = false;
    Subscription.findOneAndUpdate = function delayedVersionedMutation(filter, ...args) {
      if (!intercepted && Number.isInteger(filter?.__v)) {
        intercepted = true;
        entered();
        return releasePromise.then(() => originals.subscriptionFindOneAndUpdate.call(this, filter, ...args));
      }
      return originals.subscriptionFindOneAndUpdate.call(this, filter, ...args);
    };
    const activation = activateSalonSubscription(String(salonId), {
      actor: { _id: actorId }, seatCount: 1, months: 1, note: "Reduce seats", requestIp,
    });
    await enteredPromise;
    await assignActiveSeat({ subscriptionId: subscription._id, salonId, barberId: new mongoose.Types.ObjectId(), assignedBy: ownerId });
    release();
    await assert.rejects(activation, (error) => error.statusCode === 400);
    const [current, activeSeats] = await Promise.all([
      Subscription.findById(subscription._id).lean(),
      SubscriptionSeat.countDocuments({ subscriptionId: subscription._id, status: "active" }),
    ]);
    assert.equal(current.seatCount, 2);
    assert.equal(current.activeSeatCount, activeSeats);
    assert.ok(current.activeSeatCount <= current.seatCount);
  }
);

test(
  "real Mongo platform activation aborts both subscription mutation and audit on audit failure",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_activation_audit_abort");
    const ownerId = new mongoose.Types.ObjectId();
    const salonId = new mongoose.Types.ObjectId();
    const initialEnd = new Date("2030-02-01T00:00:00.000Z");

    await User.create({
      _id: ownerId,
      name: "Audit Abort Owner",
      phone: `+374${String(Date.now()).slice(-7)}3`,
      email: `audit-abort-${Date.now()}@example.com`,
      password: "hashed-password",
      role: "barber",
    });
    await Salon.create({ _id: salonId, name: "Audit Abort Salon", city: "Yerevan", address: "1 Test St", phone: "+37410000003", ownerId });
    const plan = await SubscriptionPlan.create({ name: "Barber Monthly", code: "barber_monthly", pricePerSeat: 5000, currency: "AMD", interval: "month", features: [], isActive: true });
    const subscription = await Subscription.create({
      ownerType: "salon", ownerId: salonId, ownerRefModel: "Salon", payerId: ownerId, planId: plan._id,
      status: "active", seatCount: 1, pricePerSeat: 5000, totalPrice: 5000, provider: "manual",
      currentPeriodStart: new Date("2030-01-01T00:00:00.000Z"), currentPeriodEnd: initialEnd,
    });
    PlatformAuditLog.create = async () => {
      throw new Error("force activation audit failure");
    };

    await assert.rejects(
      () => activateSalonSubscription(String(salonId), {
        actor: { _id: actorId }, seatCount: 2, months: 1, note: "Audit failure", requestIp,
      }),
      /force activation audit failure/
    );

    const refreshed = await Subscription.findById(subscription._id).lean();
    assert.equal(refreshed.status, "active");
    assert.equal(refreshed.seatCount, 1);
    assert.equal(refreshed.currentPeriodEnd.getTime(), initialEnd.getTime());
    assert.equal(await PlatformAuditLog.countDocuments({ salonId }), 0);
  }
);

test(
  "real Mongo confirmSalonPayment fails closed before mutation when a transaction session is unavailable",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_confirm_tx_unavailable");
    const providerPaymentId = `platform_confirm_unavailable_${Date.now()}`;
    const { attempt, salonId, subscriptionId } = await createFixture({ providerPaymentId });

    let attemptReadCount = 0;
    const originalFindById = SubscriptionPaymentAttempt.findById;
    SubscriptionPaymentAttempt.findById = function wrappedFindById(...args) {
      attemptReadCount++;
      return originalFindById.apply(this, args);
    };
    mongoose.startSession = async () => null;

    try {
      await assert.rejects(
        () =>
          confirmSalonPayment(String(attempt._id), {
            actor: { _id: actorId },
            note: "Manual payment verified",
            requestIp,
          }),
        (error) =>
          error.statusCode === 503 &&
          error.code === "PAYMENT_CONFIRMATION_TRANSACTION_UNAVAILABLE"
      );
    } finally {
      SubscriptionPaymentAttempt.findById = originalFindById;
    }
    assert.equal(attemptReadCount, 0);
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId, ownerType: "salon", ownerId: salonId }),
      0
    );
    assert.equal(
      await PlatformAuditLog.countDocuments({
        paymentAttemptId: attempt._id,
        action: "salon_subscription.payment_confirm",
      }),
      0
    );

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    const refreshedSubscription = await Subscription.findById(subscriptionId).lean();
    assert.equal(refreshedAttempt.status, "pending");
    assert.equal(refreshedAttempt.paidAt, null);
    assert.equal(refreshedAttempt.confirmedAt, null);
    assert.equal(refreshedSubscription.status, "trialing");
    assert.equal(refreshedSubscription.seatCount, 2);
  }
);

test(
  "real Mongo confirmSalonPayment confirms atomically and creates one payment record and audit log",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_confirm_success");
    const providerPaymentId = `platform_confirm_${Date.now()}`;
    const { attempt, salonId, subscriptionId } = await createFixture({ providerPaymentId });

    const result = await confirmSalonPayment(String(attempt._id), {
      actor: { _id: actorId },
      note: "Manual payment verified",
      requestIp,
    });

    assert.equal(result.salon.id.toString(), String(salonId));
    assert.equal(result.subscription.status, "active");
    assert.equal(result.subscription.seatCount, 3);
    assert.equal(result.latestPendingAttempt, null);
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId, ownerType: "salon", ownerId: salonId }),
      1
    );
    assert.equal(
      await PlatformAuditLog.countDocuments({
        paymentAttemptId: attempt._id,
        action: "salon_subscription.payment_confirm",
      }),
      1
    );

    const refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    assert.equal(refreshedAttempt.status, "paid");
    assert.ok(refreshedAttempt.paidAt);
    assert.ok(refreshedAttempt.confirmedAt);
  }
);

test(
  "real Mongo simultaneous duplicate confirmSalonPayment calls mutate once",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_confirm_duplicate");
    const providerPaymentId = `platform_confirm_dupe_${Date.now()}`;
    const { attempt, salonId, subscriptionId } = await createFixture({ providerPaymentId });

    const results = await Promise.allSettled([
      confirmSalonPayment(String(attempt._id), {
        actor: { _id: actorId },
        note: "Manual payment verified",
        requestIp,
      }),
      confirmSalonPayment(String(attempt._id), {
        actor: { _id: actorId },
        note: "Manual payment verified",
        requestIp,
      }),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId, ownerType: "salon", ownerId: salonId }),
      1
    );
    assert.equal(
      await PlatformAuditLog.countDocuments({
        paymentAttemptId: attempt._id,
        action: "salon_subscription.payment_confirm",
      }),
      1
    );
  }
);

test(
  "real Mongo confirmSalonPayment rolls back payment, subscription, payment record, and audit on failure and retries once",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    await connectIsolatedDb("platform_confirm_rollback");
    const providerPaymentId = `platform_confirm_rollback_${Date.now()}`;
    const { attempt, salonId, subscriptionId } = await createFixture({ providerPaymentId });

    let failOnce = true;
    PlatformAuditLog.create = async function patchedCreate(docs, options) {
      const session = options?.session;
      if (failOnce) {
        const visibleAttempt = await SubscriptionPaymentAttempt.findById(
          attempt._id,
          null,
          session ? { session } : undefined
        );
        const visibleSubscription = await Subscription.findById(
          subscriptionId,
          null,
          session ? { session } : undefined
        );
        const visiblePayment = await PaymentRecord.findOne(
          { subscriptionId, ownerType: "salon", ownerId: salonId },
          null,
          session ? { session } : undefined
        );
        assert.equal(visibleAttempt.status, "paid");
        assert.equal(visibleSubscription.status, "active");
        assert.ok(visiblePayment);
        failOnce = false;
        throw new Error("force audit transaction failure");
      }

      return originals.platformAuditLogCreate.call(this, docs, options);
    };

    await assert.rejects(
      () =>
        confirmSalonPayment(String(attempt._id), {
          actor: { _id: actorId },
          note: "Manual payment verified",
          requestIp,
        }),
      /force audit transaction failure/
    );

    let refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    let refreshedSubscription = await Subscription.findById(subscriptionId).lean();
    assert.equal(refreshedAttempt.status, "pending");
    assert.equal(refreshedAttempt.paidAt, null);
    assert.equal(refreshedAttempt.confirmedAt, null);
    assert.equal(refreshedSubscription.status, "trialing");
    assert.equal(refreshedSubscription.seatCount, 2);
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId, ownerType: "salon", ownerId: salonId }),
      0
    );
    assert.equal(
      await PlatformAuditLog.countDocuments({
        paymentAttemptId: attempt._id,
        action: "salon_subscription.payment_confirm",
      }),
      0
    );

    const retry = await confirmSalonPayment(String(attempt._id), {
      actor: { _id: actorId },
      note: "Manual payment verified",
      requestIp,
    });

    assert.equal(retry.subscription.status, "active");
    refreshedAttempt = await SubscriptionPaymentAttempt.findById(attempt._id).lean();
    refreshedSubscription = await Subscription.findById(subscriptionId).lean();
    assert.equal(refreshedAttempt.status, "paid");
    assert.equal(refreshedSubscription.status, "active");
    assert.equal(
      await PaymentRecord.countDocuments({ subscriptionId, ownerType: "salon", ownerId: salonId }),
      1
    );
    assert.equal(
      await PlatformAuditLog.countDocuments({
        paymentAttemptId: attempt._id,
        action: "salon_subscription.payment_confirm",
      }),
      1
    );
  }
);
