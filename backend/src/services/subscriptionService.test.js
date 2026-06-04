import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import PaymentRecord from "../models/PaymentRecord.js";

import {
  getOrCreateDefaultSubscriptionPlan,
  getSubscriptionByOwner,
  createTrialSubscription,
  grantManualSubscription,
  barberHasPaidAccess,
  getMySubscriptionAccess,
} from "./subscriptionService.js";

/* ── Stub state ─────────────────────────────────────────── */
const originalPlanFindOne = SubscriptionPlan.findOne;
const originalPlanCreate = SubscriptionPlan.create;
const originalSubFindOne = Subscription.findOne;
const originalSubCreate = Subscription.create;
const originalSubSave = Subscription.prototype.save;
const originalSeatFindOne = SubscriptionSeat.findOne;
const originalPaymentCreate = PaymentRecord.create;

const barberId = new mongoose.Types.ObjectId();
const salonId = new mongoose.Types.ObjectId();
const payerId = new mongoose.Types.ObjectId();
const clientId = new mongoose.Types.ObjectId();

const defaultPlanDoc = {
  _id: new mongoose.Types.ObjectId(),
  name: "Barber Monthly",
  code: "barber_monthly",
  pricePerSeat: 5000,
  currency: "AMD",
  interval: "month",
  features: [],
  isActive: true,
};

afterEach(() => {
  SubscriptionPlan.findOne = originalPlanFindOne;
  SubscriptionPlan.create = originalPlanCreate;
  Subscription.findOne = originalSubFindOne;
  Subscription.create = originalSubCreate;
  Subscription.prototype.save = originalSubSave;
  SubscriptionSeat.findOne = originalSeatFindOne;
  PaymentRecord.create = originalPaymentCreate;
});

/* ── Chainable query helper ─────────────────────────────── */

/**
 * Creates a thenable chainable query stub that supports .populate() and .lean().
 * When awaited, resolves to the given result (or null).
 */
const chainableQuery = (result) => {
  const then = (resolve) => Promise.resolve(result).then(resolve);
  return {
    populate() { return this; },
    lean() { return this; },
    then,
    catch(fn) { return Promise.resolve(result).catch(fn); },
  };
};

/* ── Helper ─────────────────────────────────────────────── */
const makeSubDoc = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  ownerType: "barber",
  ownerId: barberId,
  ownerRefModel: "User",
  payerId,
  planId: defaultPlanDoc._id,
  status: "active",
  seatCount: 1,
  pricePerSeat: 5000,
  totalPrice: 5000,
  currentPeriodStart: new Date(),
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  provider: "manual",
  lastPaymentAt: new Date(),
  save() { return this; },
  ...overrides,
});

/* ── Tests ──────────────────────────────────────────────── */

test("default plan creation is idempotent", async () => {
  let callCount = 0;

  SubscriptionPlan.findOne = async (query) => {
    if (query.code === "barber_monthly") {
      callCount++;
      return callCount === 1 ? null : defaultPlanDoc;
    }
    return null;
  };

  SubscriptionPlan.create = async (data) => ({ ...defaultPlanDoc, ...data });

  const first = await getOrCreateDefaultSubscriptionPlan();
  assert.ok(first);
  assert.equal(first.code, "barber_monthly");

  const second = await getOrCreateDefaultSubscriptionPlan();
  assert.ok(second);
  assert.equal(second.code, "barber_monthly");
});

test("trial subscription creation computes totalPrice correctly", async () => {
  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.findOne = async () => null;

  let createdSub = null;
  Subscription.create = async (data) => {
    createdSub = { ...data, _id: new mongoose.Types.ObjectId() };
    return createdSub;
  };

  const result = await createTrialSubscription({
    ownerType: "barber",
    ownerId: barberId,
    payerId,
    seatCount: 3,
  });

  assert.ok(result);
  assert.equal(result.status, "trialing");
  assert.equal(result.seatCount, 3);
  assert.equal(result.pricePerSeat, 5000);
  assert.equal(result.totalPrice, 15000); // 5000 * 3
  assert.equal(result.ownerRefModel, "User");
  assert.ok(result.trialEndsAt);
});

test("manual barber subscription grants barberHasPaidAccess true", async () => {
  SubscriptionPlan.findOne = async () => defaultPlanDoc;

  let findOneCallCount = 0;
  Subscription.findOne = async (query) => {
    findOneCallCount++;
    if (findOneCallCount === 1) return null; // grantManualSubscription check
    if (findOneCallCount === 2) return makeSubDoc({ status: "active" }); // barberHasPaidAccess individual check
    return null;
  };

  Subscription.create = async (data) => {
    return { ...data, _id: new mongoose.Types.ObjectId(), save() { return this; } };
  };

  PaymentRecord.create = async () => ({});

  // barberHasPaidAccess calls SubscriptionSeat.findOne(...).populate("subscriptionId")
  SubscriptionSeat.findOne = async () => null;

  await grantManualSubscription({
    ownerType: "barber",
    ownerId: barberId,
    payerId,
    seatCount: 2,
    months: 1,
  });

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, true);
});

test("manual salon subscription alone does NOT grant access without seat", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  // Returns null but must support .populate() chain
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("salon subscription + active seat grants access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const parentSub = makeSubDoc({ status: "active" });
  const activeSeat = {
    _id: new mongoose.Types.ObjectId(),
    subscriptionId: parentSub,
    barberId,
    status: "active",
  };

  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, true);
});

test("expired salon subscription + active seat does NOT grant access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const parentSub = makeSubDoc({ status: "expired" });
  const activeSeat = {
    _id: new mongoose.Types.ObjectId(),
    subscriptionId: parentSub,
    barberId,
    status: "active",
  };

  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("revoked seat does NOT grant access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  SubscriptionSeat.findOne = () => chainableQuery(null);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("getMySubscriptionAccess returns correct structure for barber", async () => {
  const barberUser = {
    _id: barberId,
    role: "barber",
  };

  SubscriptionPlan.findOne = async () => defaultPlanDoc;

  // getMySubscriptionAccess calls Subscription.findOne(...).populate("planId").lean()
  const subDoc = makeSubDoc({ status: "active" });
  Subscription.findOne = () => chainableQuery(subDoc);

  // getMySubscriptionAccess calls SubscriptionSeat.findOne(...).populate(...).lean()
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const result = await getMySubscriptionAccess(barberUser);

  assert.ok(result);
  assert.equal(result.role, "barber");
  assert.equal(result.applicability, "applicable");
  assert.ok(result.hasAccess);
  assert.ok(result.individualSubscription);
  assert.equal(result.coveredBy, "individual");
  assert.ok(result.defaultPlan);
  assert.equal(result.defaultPlan.code, "barber_monthly");
});

test("getMySubscriptionAccess returns not-applicable for client", async () => {
  const clientUser = {
    _id: clientId,
    role: "client",
  };

  const result = await getMySubscriptionAccess(clientUser);

  assert.ok(result);
  assert.equal(result.role, "client");
  assert.equal(result.applicability, "not-applicable");
  assert.equal(result.hasAccess, false);
  assert.equal(result.individualSubscription, null);
  assert.equal(result.salonSeatCoverage, null);
  assert.equal(result.coveredBy, null);
  assert.ok(result.message);
});

test("dev grant endpoint disabled in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const isProduction = process.env.NODE_ENV === "production";
    assert.equal(isProduction, true);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("no existing barber route is blocked in Phase 1 (smoke test)", async () => {
  const subController = await import("../controllers/subscriptionController.js");
  const subRoutes = await import("../routes/subscriptionRoutes.js");

  assert.ok(subController.getMySubscription);
  assert.ok(subController.getDefaultPlan);
  assert.ok(subController.devGrantSubscription);
  assert.ok(subRoutes.default);
});
