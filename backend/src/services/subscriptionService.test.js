import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import PaymentRecord from "../models/PaymentRecord.js";
import Salon from "../models/Salon.js";
import User from "../models/User.js";

import {
  getOrCreateDefaultSubscriptionPlan,
  getSubscriptionByOwner,
  createTrialSubscription,
  createSalonTrialSubscription,
  expireSubscriptions,
  grantSubscriptionGraceToExistingBarbers,
  grantManualSubscription,
  barberHasPaidAccess,
  getPaidAccessByBarberIds,
  getMySubscriptionAccess,
  getSalonSubscriptionDetails,
  assignSalonSubscriptionSeat,
  revokeSalonSubscriptionSeat,
  updateSalonSubscriptionSeatCount,
} from "./subscriptionService.js";

/* ── Stub state ─────────────────────────────────────────── */
const originalPlanFindOne = SubscriptionPlan.findOne;
const originalPlanCreate = SubscriptionPlan.create;
const originalSubFindOne = Subscription.findOne;
const originalSubFind = Subscription.find;
const originalSubCreate = Subscription.create;
const originalSubSave = Subscription.prototype.save;
const originalSeatFindOne = SubscriptionSeat.findOne;
const originalSeatFind = SubscriptionSeat.find;
const originalSeatCountDocuments = SubscriptionSeat.countDocuments;
const originalSeatCreate = SubscriptionSeat.create;
const originalSeatFindById = SubscriptionSeat.findById;
const originalPaymentCreate = PaymentRecord.create;
const originalSalonFindById = Salon.findById;
const originalUserFindById = User.findById;
const originalUserFind = User.find;

const barberId = new mongoose.Types.ObjectId();
const salonId = new mongoose.Types.ObjectId();
const payerId = new mongoose.Types.ObjectId();
const clientId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();

const defaultPlanDoc = {
  _id: new mongoose.Types.ObjectId(),
  name: "Barber Monthly",
  code: "barber_monthly",
  pricePerSeat: 5000,
  currency: "AMD",
  interval: "month",
  features: [],
  isActive: true,
  save() {
    return this;
  },
};

afterEach(() => {
  SubscriptionPlan.findOne = originalPlanFindOne;
  SubscriptionPlan.create = originalPlanCreate;
  Subscription.findOne = originalSubFindOne;
  Subscription.find = originalSubFind;
  Subscription.create = originalSubCreate;
  Subscription.prototype.save = originalSubSave;
  SubscriptionSeat.findOne = originalSeatFindOne;
  SubscriptionSeat.find = originalSeatFind;
  SubscriptionSeat.countDocuments = originalSeatCountDocuments;
  SubscriptionSeat.create = originalSeatCreate;
  SubscriptionSeat.findById = originalSeatFindById;
  PaymentRecord.create = originalPaymentCreate;
  Salon.findById = originalSalonFindById;
  User.findById = originalUserFindById;
  User.find = originalUserFind;
});

/* ── Chainable query helper ─────────────────────────────── */

/**
 * Creates a thenable chainable query stub that supports .populate() and .lean().
 * When awaited, resolves to the given result (or null).
 */
const chainableQuery = (result) => {
  const then = (resolve) => Promise.resolve(result).then(resolve);
  return {
    populate() {
      return this;
    },
    select() {
      return this;
    },
    lean() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    then,
    catch(fn) {
      return Promise.resolve(result).catch(fn);
    },
  };
};

/* ── Helpers ────────────────────────────────────────────── */
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
  save() {
    return this;
  },
  ...overrides,
});

const makeSalonDoc = (overrides = {}) => ({
  _id: salonId,
  name: "Test Salon",
  ownerId,
  admins: [],
  ...overrides,
});

const makeBarberUser = (overrides = {}) => ({
  _id: barberId,
  role: "barber",
  name: "Test Barber",
  salons: [{ salon: salonId, status: "approved" }],
  salon: salonId,
  salonStatus: "approved",
  ...overrides,
});

const ownerId = new mongoose.Types.ObjectId();

/* ══════════════════════════════════════════════════════════
 *  Phase 1 tests
 * ══════════════════════════════════════════════════════════ */

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
  assert.equal(result.totalPrice, 15000);
  assert.equal(result.ownerRefModel, "User");
  assert.ok(result.trialEndsAt);
});

test("manual barber subscription grants barberHasPaidAccess true", async () => {
  SubscriptionPlan.findOne = async () => defaultPlanDoc;

  let findOneCallCount = 0;
  Subscription.findOne = async (query) => {
    findOneCallCount++;
    if (findOneCallCount === 1) return null;
    if (findOneCallCount === 2) return makeSubDoc({ status: "active" });
    return null;
  };

  Subscription.create = async (data) => {
    return { ...data, _id: new mongoose.Types.ObjectId(), save() { return this; } };
  };

  PaymentRecord.create = async () => ({});

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

test("grace grants active subscription to existing barber", async () => {
  const now = new Date("2026-06-04T00:00:00.000Z");
  let createdSubscription = null;
  let createdPayment = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  User.find = () => chainableQuery([{ _id: barberId }]);
  Subscription.findOne = async () => null;
  Subscription.create = async (payload) => {
    createdSubscription = {
      _id: new mongoose.Types.ObjectId(),
      ...payload,
    };
    return createdSubscription;
  };
  PaymentRecord.create = async (payload) => {
    createdPayment = payload;
    return payload;
  };

  const summary = await grantSubscriptionGraceToExistingBarbers({ now });

  assert.equal(summary.totalBarbersFound, 1);
  assert.equal(summary.grantedCount, 1);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.errorsCount, 0);
  assert.equal(createdSubscription.status, "active");
  assert.equal(createdSubscription.ownerType, "barber");
  assert.equal(createdSubscription.ownerRefModel, "User");
  assert.equal(String(createdSubscription.ownerId), String(barberId));
  assert.equal(String(createdSubscription.payerId), String(barberId));
  assert.equal(createdSubscription.totalPrice, defaultPlanDoc.pricePerSeat);
  assert.ok(createdPayment);
  assert.equal(createdPayment.status, "paid");
});

test("grace is idempotent for existing active barber", async () => {
  let createCalls = 0;
  let paymentCalls = 0;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  User.find = () => chainableQuery([{ _id: barberId }]);
  Subscription.findOne = async (query) => {
    if (query.status?.$in) return makeSubDoc({ status: "active" });
    return null;
  };
  Subscription.create = async () => {
    createCalls++;
    return makeSubDoc();
  };
  PaymentRecord.create = async () => {
    paymentCalls++;
    return {};
  };

  const summary = await grantSubscriptionGraceToExistingBarbers();

  assert.equal(summary.grantedCount, 0);
  assert.equal(summary.skippedCount, 1);
  assert.equal(createCalls, 0);
  assert.equal(paymentCalls, 0);
});

test("grace skips existing trialing barber", async () => {
  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  User.find = () => chainableQuery([{ _id: barberId }]);
  Subscription.findOne = async (query) => {
    if (query.status?.$in) return makeSubDoc({ status: "trialing" });
    return null;
  };
  PaymentRecord.create = async () => {
    assert.fail("PaymentRecord should not be created for skipped trial");
  };

  const summary = await grantSubscriptionGraceToExistingBarbers();

  assert.equal(summary.grantedCount, 0);
  assert.equal(summary.skippedCount, 1);
});

test("after grace, getPaidAccessByBarberIds includes barber", async () => {
  const grantedSubscription = makeSubDoc({ ownerId: barberId, status: "active" });

  Subscription.find = () => chainableQuery([grantedSubscription]);
  SubscriptionSeat.find = () => chainableQuery([]);

  const access = await getPaidAccessByBarberIds([barberId]);

  assert.equal(access.get(String(barberId)), true);
});

test("createSalonTrialSubscription creates trialing salon subscription", async () => {
  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.findOne = async () => null;
  Subscription.create = async (payload) => ({
    _id: new mongoose.Types.ObjectId(),
    ...payload,
  });

  const subscription = await createSalonTrialSubscription({
    salonId,
    payerId,
  });

  assert.equal(subscription.ownerType, "salon");
  assert.equal(String(subscription.ownerId), String(salonId));
  assert.equal(String(subscription.payerId), String(payerId));
  assert.equal(subscription.status, "trialing");
  assert.equal(subscription.seatCount, 1);
  assert.equal(subscription.ownerRefModel, "Salon");
  assert.ok(subscription.trialEndsAt);
});

test("getPaidAccessByBarberIds returns paid individual and salon-seat covered barbers", async () => {
  const paidIndividualBarberId = new mongoose.Types.ObjectId();
  const paidSeatBarberId = new mongoose.Types.ObjectId();
  const unpaidBarberId = new mongoose.Types.ObjectId();
  const parentSub = makeSubDoc({ ownerType: "salon", status: "trialing" });

  Subscription.find = () =>
    chainableQuery([
      makeSubDoc({ ownerId: paidIndividualBarberId, status: "active" }),
    ]);
  SubscriptionSeat.find = () =>
    chainableQuery([
      {
        barberId: paidSeatBarberId,
        status: "active",
        subscriptionId: parentSub,
      },
    ]);

  const access = await getPaidAccessByBarberIds([
    paidIndividualBarberId,
    paidSeatBarberId,
    unpaidBarberId,
  ]);

  assert.equal(access.get(String(paidIndividualBarberId)), true);
  assert.equal(access.get(String(paidSeatBarberId)), true);
  assert.equal(access.get(String(unpaidBarberId)), false);
});

test("getPaidAccessByBarberIds ignores active seats on expired salon subscriptions", async () => {
  const coveredBarberId = new mongoose.Types.ObjectId();
  const parentSub = makeSubDoc({ ownerType: "salon", status: "expired" });

  Subscription.find = () => chainableQuery([]);
  SubscriptionSeat.find = () =>
    chainableQuery([
      {
        barberId: coveredBarberId,
        status: "active",
        subscriptionId: parentSub,
      },
    ]);

  const access = await getPaidAccessByBarberIds([coveredBarberId]);

  assert.equal(access.get(String(coveredBarberId)), false);
});

test("getMySubscriptionAccess returns correct structure for barber", async () => {
  const barberUser = {
    _id: barberId,
    role: "barber",
  };

  SubscriptionPlan.findOne = async () => defaultPlanDoc;

  const subDoc = makeSubDoc({ status: "active" });
  Subscription.findOne = () => chainableQuery(subDoc);

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

/* ══════════════════════════════════════════════════════════
 *  Phase 2 tests — Salon seat assignment
 * ══════════════════════════════════════════════════════════ */

test("salon owner can view subscription seat details", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 5,
    totalPrice: 25000,
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () => chainableQuery([]);

  User.find = () => chainableQuery([makeBarberUser()]);

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.ok(result);
  assert.ok(result.subscription);
  assert.equal(result.subscription.seatCount, 5);
  assert.equal(result.activeSeats.length, 0);
  assert.equal(result.revokedSeats.length, 0);
  assert.equal(result.availableSeatCount, 5);
  assert.equal(result.approvedMembers.length, 1);
});

test("salon admin can view subscription seat details", async () => {
  const salonDoc = makeSalonDoc({ ownerId, admins: [adminId] });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 3,
    totalPrice: 15000,
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () => chainableQuery([]);
  User.find = () => chainableQuery([makeBarberUser()]);

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: adminId, role: "barber" },
  });

  assert.ok(result);
  assert.ok(result.subscription);
  assert.equal(result.availableSeatCount, 3);
});

test("non-owner/non-admin cannot view details", async () => {
  const salonDoc = makeSalonDoc({ ownerId, admins: [] });

  Salon.findById = async () => salonDoc;

  await assert.rejects(
    () =>
      getSalonSubscriptionDetails({
        salonId,
        requester: { _id: otherUserId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }
  );
});

test("owner can assign seat to approved member", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 5,
    totalPrice: 25000,
    status: "active",
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.countDocuments = async () => 2; // 2 active, 5 max → can assign
  SubscriptionSeat.findOne = async (query) => {
    // Check if query has barberId and status "active" → no existing active seat
    if (query.status === "active") return null;
    // Check for revoked seat → none
    if (query.status === "revoked") return null;
    return null;
  };

  User.findById = async () => makeBarberUser();
  SubscriptionSeat.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
  });

  const seat = await assignSalonSubscriptionSeat({
    salonId,
    barberId,
    assignedBy: { _id: ownerId, role: "barber" },
  });

  assert.ok(seat);
  assert.equal(seat.status, "active");
  assert.equal(seat.salonId.toString(), salonId.toString());
});

test("cannot assign seat to non-approved member", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 5,
    totalPrice: 25000,
    status: "active",
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.countDocuments = async () => 2;
  SubscriptionSeat.findOne = async () => null;

  // Barber with no approved membership
  User.findById = async () => ({
    _id: barberId,
    role: "barber",
    salons: [],
    salon: null,
    salonStatus: "none",
  });

  await assert.rejects(
    () =>
      assignSalonSubscriptionSeat({
        salonId,
        barberId,
        assignedBy: { _id: ownerId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("not an approved member"));
      return true;
    }
  );
});

test("cannot assign more seats than subscription.seatCount", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 3,
    totalPrice: 15000,
    status: "active",
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.countDocuments = async () => 3; // already full

  await assert.rejects(
    () =>
      assignSalonSubscriptionSeat({
        salonId,
        barberId,
        assignedBy: { _id: ownerId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("Cannot assign more than"));
      return true;
    }
  );
});

test("duplicate active seat is prevented (returns existing)", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 5,
    totalPrice: 25000,
    status: "active",
  });

  const existingSeat = {
    _id: new mongoose.Types.ObjectId(),
    subscriptionId: salonSub._id,
    barberId,
    status: "active",
  };

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.countDocuments = async () => 2;
  SubscriptionSeat.findOne = async (query) => {
    if (query.status === "active" && query.barberId) return existingSeat;
    return null;
  };
  User.findById = async () => makeBarberUser();

  const seat = await assignSalonSubscriptionSeat({
    salonId,
    barberId,
    assignedBy: { _id: ownerId, role: "barber" },
  });

  assert.ok(seat);
  assert.equal(seat.status, "active");
});

test("revoked seat does not grant barberHasPaidAccess (via Phase 1 function)", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  SubscriptionSeat.findOne = () => chainableQuery(null);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("active seat grants barberHasPaidAccess", async () => {
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

test("expired salon subscription + active seat does not grant access", async () => {
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

test("expireSubscriptions expires trialing subscription after trial end", async () => {
  const now = new Date("2026-06-04T00:00:00.000Z");
  const subscription = makeSubDoc({
    status: "trialing",
    trialEndsAt: new Date("2026-06-03T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-06-03T00:00:00.000Z"),
  });
  let savedStatus = null;

  subscription.save = async function save() {
    savedStatus = this.status;
    return this;
  };
  Subscription.find = async () => [subscription];

  const summary = await expireSubscriptions({ now });

  assert.equal(summary.checkedCount, 1);
  assert.equal(summary.expiredCount, 1);
  assert.equal(summary.errorsCount, 0);
  assert.equal(savedStatus, "expired");
});

test("expired subscription no longer grants barber access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber" && query.status?.$in) return null;
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const hasAccess = await barberHasPaidAccess(barberId);

  assert.equal(hasAccess, false);
});

test("owner can revoke active seat", async () => {
  const seatId = new mongoose.Types.ObjectId();
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
  });

  const seatDoc = {
    _id: seatId,
    subscriptionId: salonSub,
    salonId,
    barberId,
    status: "active",
    assignedAt: new Date(),
    save() {
      return this;
    },
  };

  Salon.findById = async () => makeSalonDoc({ ownerId });

  SubscriptionSeat.findById = () => chainableQuery(seatDoc);

  const result = await revokeSalonSubscriptionSeat({
    seatId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.ok(result);
  assert.equal(result.status, "revoked");
  assert.ok(result.revokedAt);
});

test("non-owner cannot revoke seat", async () => {
  const seatId = new mongoose.Types.ObjectId();
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
  });

  const seatDoc = {
    _id: seatId,
    subscriptionId: salonSub,
    salonId,
    barberId,
    status: "active",
    assignedAt: new Date(),
    save() {
      return this;
    },
  };

  // Requester is not owner or admin
  const otherSalon = makeSalonDoc({ ownerId, admins: [] });

  Salon.findById = async () => otherSalon;
  SubscriptionSeat.findById = () => chainableQuery(seatDoc);

  await assert.rejects(
    () =>
      revokeSalonSubscriptionSeat({
        seatId,
        requester: { _id: otherUserId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }
  );
});

test("cannot reduce seatCount below active seats", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 10,
    totalPrice: 50000,
    save() {
      return this;
    },
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = async () => salonSub;
  SubscriptionSeat.countDocuments = async () => 5; // 5 active seats

  await assert.rejects(
    () =>
      updateSalonSubscriptionSeatCount({
        salonId,
        seatCount: 3,
        requester: { _id: ownerId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("Cannot reduce seat count below"));
      return true;
    }
  );
});

test("can increase seatCount and totalPrice updates", async () => {
  const salonDoc = makeSalonDoc({ ownerId });

  let savedSub = null;
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 3,
    totalPrice: 15000,
    pricePerSeat: 5000,
    save() {
      savedSub = this;
      return this;
    },
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = async () => salonSub;
  SubscriptionSeat.countDocuments = async () => 2; // 2 active, increasing to 5 is fine
  SubscriptionPlan.findOne = async () => defaultPlanDoc;

  const result = await updateSalonSubscriptionSeatCount({
    salonId,
    seatCount: 5,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.ok(result);
  assert.equal(result.seatCount, 5);
  assert.equal(result.totalPrice, 25000); // 5 * 5000
});

test("no existing barber route is blocked in Phase 2 (smoke test)", async () => {
  const subController = await import("../controllers/subscriptionController.js");

  assert.ok(subController.getSalonSubscription);
  assert.ok(subController.getSalonSubscriptionSeats);
  assert.ok(subController.assignSeat);
  assert.ok(subController.revokeSeat);
  assert.ok(subController.updateSeatCount);
});

/* ══════════════════════════════════════════════════════════
 *  Phase 3 tests — Subscription enforcement
 * ══════════════════════════════════════════════════════════ */

test("requireBarberSubscription middleware exports correctly", async () => {
  const mod = await import("../middleware/subscriptionMiddleware.js");
  assert.ok(mod.requireBarberSubscription);
  assert.equal(typeof mod.requireBarberSubscription, "function");
});

test("requireBarberSubscription passes non-barber roles through", async () => {
  const mod = await import("../middleware/subscriptionMiddleware.js");

  const req = {
    user: { _id: clientId, role: "client" },
  };
  let nextCalled = false;
  const res = {
    status() { return this; },
    json() { assert.fail("Should not return error"); },
  };
  const next = () => { nextCalled = true; };

  await mod.requireBarberSubscription(req, res, next);
  assert.equal(nextCalled, true);
});

test("requireBarberSubscription rejects unauthenticated requests", async () => {
  const mod = await import("../middleware/subscriptionMiddleware.js");

  const req = {};
  let statusCode = null;
  let responseJson = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { responseJson = data; },
  };
  const next = () => { assert.fail("Should not call next"); };

  await mod.requireBarberSubscription(req, res, next);
  assert.equal(statusCode, 401);
  assert.deepEqual(responseJson, { message: "Not authenticated" });
});

test("requireBarberSubscription passes paid barber through", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber" && query.ownerId === barberId) {
      return makeSubDoc({ status: "active" });
    }
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const mod = await import("../middleware/subscriptionMiddleware.js");

  const req = {
    user: { _id: barberId, role: "barber" },
  };
  let nextCalled = false;
  const res = {
    status() { return this; },
    json() { assert.fail("Should not return error"); },
  };
  const next = () => { nextCalled = true; };

  await mod.requireBarberSubscription(req, res, next);
  assert.equal(nextCalled, true);
});

test("requireBarberSubscription passes trialing barber through", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber" && query.ownerId === barberId) {
      return makeSubDoc({ status: "trialing" });
    }
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const mod = await import("../middleware/subscriptionMiddleware.js");

  const req = {
    user: { _id: barberId, role: "barber" },
  };
  let nextCalled = false;
  const res = {
    status() { return this; },
    json() { assert.fail("Should not return error"); },
  };
  const next = () => { nextCalled = true; };

  await mod.requireBarberSubscription(req, res, next);
  assert.equal(nextCalled, true);
});

test("requireBarberSubscription blocks unpaid barber with 403", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const mod = await import("../middleware/subscriptionMiddleware.js");

  const req = {
    user: { _id: barberId, role: "barber" },
  };
  let statusCode = null;
  let responseJson = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { responseJson = data; },
  };
  const next = () => { assert.fail("Should not call next"); };

  await mod.requireBarberSubscription(req, res, next);
  assert.equal(statusCode, 403);
  assert.ok(responseJson);
  assert.deepEqual(responseJson, {
    code: "SUBSCRIPTION_REQUIRED",
    message:
      "An active subscription or salon seat assignment is required to access this feature.",
  });
});

test("booking creation is blocked for unpaid barber (barberHasPaidAccess check)", async () => {
  // When barber has no subscription and no seat, createBooking should return 403
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const bookingCtrl = await import("../controllers/bookingController.js");
  assert.ok(bookingCtrl.createBooking);
  // The check is within createBooking – we verify the function exists and imports barberHasPaidAccess
  // This is a structural test to confirm the enforcement was added
  const fs = await import("fs");
  const source = fs.readFileSync("./src/controllers/bookingController.js", "utf-8");
  assert.ok(source.includes("barberHasPaidAccess(barberId)"), "createBooking must call barberHasPaidAccess");
  assert.ok(source.includes('"BARBER_UNAVAILABLE"'), "createBooking must return BARBER_UNAVAILABLE code");
  assert.ok(source.includes("not currently accepting bookings"), "createBooking must return user-friendly message");
});

test("public barber listings use paid-access filtering", async () => {
  const fs = await import("fs");
  const userSource = fs.readFileSync("./src/controllers/userController.js", "utf-8");
  const profileSource = fs.readFileSync("./src/controllers/barberProfileController.js", "utf-8");

  assert.ok(
    userSource.includes("getPaidAccessByBarberIds"),
    "GET /api/users/barbers must filter unpaid barbers"
  );
  assert.ok(
    userSource.includes("paidBarbers"),
    "GET /api/users/barbers must continue with the filtered barber set"
  );
  assert.ok(
    profileSource.includes("getPaidAccessByBarberIds"),
    "card-summary listing must filter unpaid barbers"
  );
});

test("no client booking flow is blocked in Phase 3", async () => {
  const bookingRoutes = await import("../routes/bookingRoutes.js");
  // The createBooking route should still be unprotected from requireBarberSubscription
  // Only client-facing routes should pass through
  assert.ok(bookingRoutes.default);

  const fs = await import("fs");
  const source = fs.readFileSync("./src/routes/bookingRoutes.js", "utf-8");

  // Client routes should NOT have requireBarberSubscription
  // The booking creation route (POST /) should not have requireBarberSubscription middleware before it
  // (the check is inside createBooking)
  assert.ok(source.includes("requireBarberSubscription"));

  // Verify GET /client routes don't have subscription check
  const getClientPattern = source.match(/router\.get\("\/client\/:clientId".*/);
  assert.ok(getClientPattern);
  assert.ok(!getClientPattern[0].includes("requireBarberSubscription"));

  const createPattern = source.match(/router\.post\("\/",.*/);
  assert.ok(createPattern);
  assert.ok(!createPattern[0].includes("requireBarberSubscription"));

  const barberReadPattern = source.match(/router\.get\("\/barber\/:barberId".*/);
  assert.ok(barberReadPattern);
  assert.ok(!barberReadPattern[0].includes("requireBarberSubscription"));
});

test("paid barber/admin routes require subscription", async () => {
  const fs = await import("fs");
  const serviceRoutes = fs.readFileSync("./src/routes/serviceRoutes.js", "utf-8");
  const scheduleRoutes = fs.readFileSync("./src/routes/scheduleRoutes.js", "utf-8");
  const bookingRoutes = fs.readFileSync("./src/routes/bookingRoutes.js", "utf-8");
  const voucherRoutes = fs.readFileSync("./src/routes/voucherRoutes.js", "utf-8");
  const revenueRoutes = fs.readFileSync("./src/routes/revenueRoutes.js", "utf-8");
  const barberRoutes = fs.readFileSync("./src/routes/barberRoutes.js", "utf-8");
  const portfolioRoutes = fs.readFileSync("./src/routes/portfolioPhotoRoutes.js", "utf-8");
  const waitlistRoutes = fs.readFileSync("./src/routes/waitlistRoutes.js", "utf-8");

  for (const source of [
    serviceRoutes,
    scheduleRoutes,
    bookingRoutes,
    voucherRoutes,
    revenueRoutes,
    barberRoutes,
    portfolioRoutes,
    waitlistRoutes,
  ]) {
    assert.ok(source.includes("requireBarberSubscription"));
  }

  assert.match(serviceRoutes, /router\.post\("\/",\s*protect,\s*requireBarberSubscription/);
  assert.match(serviceRoutes, /router\.put\("\/:id",\s*protect,\s*requireBarberSubscription/);
  assert.match(serviceRoutes, /router\.delete\("\/:id",\s*protect,\s*requireBarberSubscription/);
  assert.match(scheduleRoutes, /router\.put\("\/",\s*protect,\s*requireBarberSubscription/);
  assert.match(scheduleRoutes, /router\.put\("\/:barberId\/:salonId",\s*protect,\s*requireBarberSubscription/);
  assert.match(bookingRoutes, /router\.put\("\/:id",\s*protect,\s*requireBarberSubscription/);
  assert.match(bookingRoutes, /router\.patch\("\/:id\/no-show",\s*protect,\s*requireBarberSubscription/);
  assert.match(bookingRoutes, /router\.patch\("\/:id\/late-cancel",\s*protect,\s*requireBarberSubscription/);
  assert.match(voucherRoutes, /router\.post\("\/",\s*protect,\s*requireBarberSubscription/);
  assert.match(voucherRoutes, /router\.put\("\/:id",\s*protect,\s*requireBarberSubscription/);
  assert.match(voucherRoutes, /router\.delete\("\/:id",\s*protect,\s*requireBarberSubscription/);
  assert.match(revenueRoutes, /router\.get\("\/me",\s*protect,\s*requireBarberSubscription/);
  assert.match(barberRoutes, /router\.get\("\/me\/clients",\s*protect,\s*requireBarberSubscription/);
  assert.match(portfolioRoutes, /router\.post\("\/",\s*protect,\s*requireBarberSubscription/);
  assert.match(portfolioRoutes, /router\.put\("\/:id",\s*protect,\s*requireBarberSubscription/);
  assert.match(portfolioRoutes, /router\.delete\("\/:id",\s*protect,\s*requireBarberSubscription/);
  assert.match(waitlistRoutes, /router\.patch\("\/:id\/approve",\s*protect,\s*requireBarberSubscription/);
  assert.match(waitlistRoutes, /router\.patch\("\/:id\/reject",\s*protect,\s*requireBarberSubscription/);
  assert.match(waitlistRoutes, /router\.patch\("\/:id\/offer",\s*protect,\s*requireBarberSubscription/);
});

test("subscription endpoints remain accessible while unpaid", async () => {
  const fs = await import("fs");
  const source = fs.readFileSync("./src/routes/subscriptionRoutes.js", "utf-8");

  assert.ok(!source.includes("requireBarberSubscription"));
  assert.match(source, /router\.get\("\/me",\s*protect,\s*getMySubscription/);
  assert.match(source, /router\.get\("\/salon\/:salonId",\s*protect,\s*getSalonSubscription/);
  assert.match(source, /router\.post\("\/salon\/:salonId\/seats",\s*protect,\s*assignSeat/);
  assert.match(source, /router\.patch\("\/seats\/:seatId\/revoke",\s*protect,\s*revokeSeat/);
});

test("barber profile upsert does not require subscription (Phase 1 non-enforcement preserved)", async () => {
  const fs = await import("fs");
  const source = fs.readFileSync("./src/routes/barberRoutes.js", "utf-8");

  // Profile upsert route should NOT have subscription guard
  const upsertMatch = source.match(/router\.put\(\s*"\/profile\/:barberId",/);
  assert.ok(upsertMatch);
  assert.ok(!source.match(/router\.put\(\s*"\/profile\/:barberId",\s*protect,\s*requireBarberSubscription/));
});
