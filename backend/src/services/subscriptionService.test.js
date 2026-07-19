import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import PaymentRecord from "../models/PaymentRecord.js";
import SubscriptionPaymentAttempt from "../models/SubscriptionPaymentAttempt.js";
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
  extendManualSubscription,
  barberHasPaidAccess,
  barberHasPaidAccessForSalon,
  cancelSubscriptionPaymentAttempt,
  confirmSubscriptionPaymentAttempt,
  createSubscriptionPaymentIntent,
  getDaysRemaining,
  getMySubscriptionPaymentHistory,
  getPaidAccessByBarberIds,
  getMySubscriptionAccess,
  getSalonSubscriptionPaymentHistory,
  getSubscriptionPaymentAttempt,
  getSalonSubscriptionDetails,
  serializeSubscriptionStatus,
  assignSalonSubscriptionSeat,
  revokeSalonSeatsForRemovedMember,
  revokeSalonSubscriptionSeat,
  updateSalonSubscriptionSeatCount,
  isManualActivationAvailable,
} from "./subscriptionService.js";

/* ── Stub state ─────────────────────────────────────────── */
const originalPlanFindOne = SubscriptionPlan.findOne;
const originalPlanCreate = SubscriptionPlan.create;
const originalSubFindOne = Subscription.findOne;
const originalSubFindById = Subscription.findById;
const originalSubFind = Subscription.find;
const originalSubCreate = Subscription.create;
const originalSubSave = Subscription.prototype.save;
const originalSeatFindOne = SubscriptionSeat.findOne;
const originalSeatFind = SubscriptionSeat.find;
const originalSeatCountDocuments = SubscriptionSeat.countDocuments;
const originalSeatCreate = SubscriptionSeat.create;
const originalSeatFindById = SubscriptionSeat.findById;
const originalPaymentCreate = PaymentRecord.create;
const originalPaymentFind = PaymentRecord.find;
const originalAttemptCreate = SubscriptionPaymentAttempt.create;
const originalAttemptFind = SubscriptionPaymentAttempt.find;
const originalAttemptFindById = SubscriptionPaymentAttempt.findById;
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
  Subscription.findById = originalSubFindById;
  Subscription.find = originalSubFind;
  Subscription.create = originalSubCreate;
  Subscription.prototype.save = originalSubSave;
  SubscriptionSeat.findOne = originalSeatFindOne;
  SubscriptionSeat.find = originalSeatFind;
  SubscriptionSeat.countDocuments = originalSeatCountDocuments;
  SubscriptionSeat.create = originalSeatCreate;
  SubscriptionSeat.findById = originalSeatFindById;
  PaymentRecord.create = originalPaymentCreate;
  PaymentRecord.find = originalPaymentFind;
  SubscriptionPaymentAttempt.create = originalAttemptCreate;
  SubscriptionPaymentAttempt.find = originalAttemptFind;
  SubscriptionPaymentAttempt.findById = originalAttemptFindById;
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

const paymentHistoryQuery = (records, calls = {}) => ({
  sort(sortValue) {
    calls.sort = sortValue;
    records.sort((left, right) => {
      const rightTime = new Date(right.paidAt || right.createdAt || 0).getTime();
      const leftTime = new Date(left.paidAt || left.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
    return this;
  },
  limit(limitValue) {
    calls.limit = limitValue;
    records = records.slice(0, limitValue);
    return this;
  },
  lean() {
    return records;
  },
  then(resolve) {
    return Promise.resolve(records).then(resolve);
  },
});

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

const makeSalonRelationshipUser = ({
  _id = barberId,
  name = "Test Barber",
  relationshipType = "staff",
  relationshipStatus = "accepted",
  status = "approved",
} = {}) =>
  makeBarberUser({
    _id,
    name,
    salon: null,
    salonStatus: "none",
    salons: [
      {
        salon: salonId,
        status,
        relationshipType,
        relationshipStatus,
      },
    ],
  });

const makeSubscriptionSeat = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  subscriptionId: makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
  }),
  salonId,
  barberId,
  status: "active",
  assignedAt: new Date(),
  save() {
    return this;
  },
  ...overrides,
});

const makeBillingSeat = ({
  seatBarberId = new mongoose.Types.ObjectId(),
  name = "Test Barber",
  relationshipType = "staff",
  relationshipStatus = "accepted",
  memberStatus = "approved",
  ...overrides
} = {}) =>
  makeSubscriptionSeat({
    ...overrides,
    barberId: makeSalonRelationshipUser({
      _id: seatBarberId,
      name,
      relationshipType,
      relationshipStatus,
      status: memberStatus,
    }),
  });

const makePaymentAttempt = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  ownerType: "barber",
  ownerId: barberId,
  payerId: barberId,
  subscriptionId: null,
  provider: "manual",
  providerIntentId: null,
  amount: 5000,
  currency: "AMD",
  seatCount: 1,
  months: 1,
  status: "pending",
  metadata: {},
  paidAt: null,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  save() {
    return this;
  },
  toObject() {
    return { ...this };
  },
  ...overrides,
});

const sensitiveAttemptResponseFields = [
  "_id",
  "ownerType",
  "ownerId",
  "payerId",
  "purpose",
  "subscriptionId",
  "bookingId",
  "provider",
  "providerPaymentId",
  "providerIntentId",
  "metadata",
  "createdBy",
  "processedWebhookEventIds",
];

const sensitivePaymentRecordResponseFields = [
  "_id",
  "id",
  "ownerType",
  "ownerId",
  "payerId",
  "subscriptionId",
  "provider",
  "providerPaymentId",
  "metadata",
];

const assertFieldsAbsent = (value, fields) => {
  for (const field of fields) {
    assert.equal(value[field], undefined, `${field} should not be exposed`);
  }
};

const stubPaymentAttemptCreate = () => {
  let createdAttempt = null;

  SubscriptionPaymentAttempt.create = async (payload) => {
    createdAttempt = makePaymentAttempt(payload);
    return createdAttempt;
  };

  return {
    getCreatedAttempt: () => createdAttempt,
  };
};

const stubManualConfirmationDependencies = ({
  existingSubscription = null,
  createdSubscription = null,
} = {}) => {
  const paymentRecords = [];
  let subscriptionCreateCount = 0;
  let subscriptionFindCount = 0;
  let subscriptionToReturn = createdSubscription;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.findOne = async () => {
    subscriptionFindCount++;
    return existingSubscription;
  };
  Subscription.create = async (payload) => {
    subscriptionCreateCount++;
    subscriptionToReturn = makeSubDoc({
      ...payload,
      _id: payload._id || new mongoose.Types.ObjectId(),
    });
    return subscriptionToReturn;
  };
  PaymentRecord.create = async (payload) => {
    paymentRecords.push(payload);
    return payload;
  };

  return {
    getPaymentRecords: () => paymentRecords,
    getSubscriptionCreateCount: () => subscriptionCreateCount,
    getSubscriptionFindCount: () => subscriptionFindCount,
    getSubscription: () => subscriptionToReturn,
  };
};

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

test("dev grant endpoint disabled in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const { devGrantSubscription } = await import("../controllers/subscriptionController.js");
  let statusCode = 200;
  let responseBody = null;

  const req = {
    body: {
      ownerType: "barber",
      ownerId: barberId,
      payerId,
      seatCount: 1,
      months: 1,
    },
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseBody = payload;
      return this;
    },
  };

  try {
    await devGrantSubscription(req, res);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }

  assert.equal(statusCode, 403);
  assert.equal(responseBody.code, "DEV_SUBSCRIPTION_DISABLED");
});

test("dev-confirm remains disabled in production even if override env is set", async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAllowOverride = process.env.ALLOW_DEV_PAYMENT_CONFIRM;
  process.env.NODE_ENV = "production";
  process.env.ALLOW_DEV_PAYMENT_CONFIRM = "true";

  try {
    await assert.rejects(
      () =>
        confirmSubscriptionPaymentAttempt({
          paymentAttemptId: new mongoose.Types.ObjectId(),
          confirmedBy: { _id: barberId, role: "barber" },
        }),
      (error) =>
        error.statusCode === 403 &&
        error.code === "DEV_PAYMENT_CONFIRM_DISABLED"
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalAllowOverride === undefined) {
      delete process.env.ALLOW_DEV_PAYMENT_CONFIRM;
    } else {
      process.env.ALLOW_DEV_PAYMENT_CONFIRM = originalAllowOverride;
    }
  }
});

test("dev grant barber activates subscription and creates paid PaymentRecord", async () => {
  let createdSubscription = null;
  let createdPayment = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
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

  const result = await extendManualSubscription({
    ownerType: "barber",
    ownerId: barberId,
    payerId,
    seatCount: 1,
    months: 1,
  });

  assert.ok(result);
  assert.equal(result.status, "active");
  assert.equal(result.ownerType, "barber");
  assert.equal(result.ownerRefModel, "User");
  assert.equal(result.seatCount, 1);
  assert.equal(result.totalPrice, defaultPlanDoc.pricePerSeat);
  assert.equal(result.provider, "manual");
  assert.ok(createdPayment);
  assert.equal(createdPayment.status, "paid");
  assert.equal(createdPayment.provider, "manual");
  assert.equal(createdPayment.amount, defaultPlanDoc.pricePerSeat);
  assert.equal(String(createdPayment.subscriptionId), String(createdSubscription._id));
});

test("dev grant salon activates subscription with correct totalPrice", async () => {
  let createdPayment = null;
  let createdSeat = false;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.findOne = async () => null;
  Subscription.create = async (payload) => ({
    _id: new mongoose.Types.ObjectId(),
    ...payload,
  });
  PaymentRecord.create = async (payload) => {
    createdPayment = payload;
    return payload;
  };
  SubscriptionSeat.create = async () => {
    createdSeat = true;
    return {};
  };

  const result = await extendManualSubscription({
    ownerType: "salon",
    ownerId: salonId,
    payerId,
    seatCount: 4,
    months: 2,
  });

  assert.equal(result.status, "active");
  assert.equal(result.ownerRefModel, "Salon");
  assert.equal(result.seatCount, 4);
  assert.equal(result.pricePerSeat, defaultPlanDoc.pricePerSeat);
  assert.equal(result.totalPrice, 20000);
  assert.equal(createdPayment.amount, 40000);
  assert.equal(createdPayment.seatCount, 4);
  assert.equal(createdSeat, false);
});

test("3 seats × 1 month sets seatCount=3 and extends periodEnd by exactly 1 month", async () => {
  let createdSubscription = null;
  let createdPayment = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
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

  const result = await extendManualSubscription({
    ownerType: "barber",
    ownerId: barberId,
    payerId,
    seatCount: 3,
    months: 1,
  });

  assert.equal(result.status, "active");
  assert.equal(result.seatCount, 3);
  assert.equal(result.totalPrice, 15000);
  // currentPeriodEnd must be exactly 1 month from now, NOT 3 months
  const expectedPeriodEnd = new Date(result.currentPeriodStart);
  expectedPeriodEnd.setMonth(expectedPeriodEnd.getMonth() + 1);
  assert.equal(result.currentPeriodEnd.getTime(), expectedPeriodEnd.getTime());
  // Verify it is NOT 3 months
  const threeMonths = new Date(result.currentPeriodStart);
  threeMonths.setMonth(threeMonths.getMonth() + 3);
  assert.notEqual(result.currentPeriodEnd.getTime(), threeMonths.getTime());
  assert.equal(createdPayment.amount, 15000);
  assert.equal(createdPayment.seatCount, 3);
});

test("3 seats × 3 months sets seatCount=3 and extends periodEnd by exactly 3 months", async () => {
  let createdPayment = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.findOne = async () => null;
  Subscription.create = async (payload) => ({
    _id: new mongoose.Types.ObjectId(),
    ...payload,
  });
  PaymentRecord.create = async (payload) => {
    createdPayment = payload;
    return payload;
  };

  const result = await extendManualSubscription({
    ownerType: "barber",
    ownerId: barberId,
    payerId,
    seatCount: 3,
    months: 3,
  });

  assert.equal(result.status, "active");
  assert.equal(result.seatCount, 3);
  assert.equal(result.totalPrice, 15000);
  const expectedPeriodEnd = new Date(result.currentPeriodStart);
  expectedPeriodEnd.setMonth(expectedPeriodEnd.getMonth() + 3);
  assert.equal(result.currentPeriodEnd.getTime(), expectedPeriodEnd.getTime());
  assert.equal(createdPayment.amount, 45000);
  assert.equal(createdPayment.seatCount, 3);
});

test("extending active subscription extends from currentPeriodEnd, not now", async () => {
  const currentPeriodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const expectedPeriodEnd = new Date(currentPeriodEnd);
  expectedPeriodEnd.setMonth(expectedPeriodEnd.getMonth() + 2);
  const activeSubscription = makeSubDoc({
    status: "active",
    currentPeriodEnd,
  });
  let createCalls = 0;
  let createdPayment = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.findOne = async () => activeSubscription;
  Subscription.create = async () => {
    createCalls++;
    return makeSubDoc();
  };
  PaymentRecord.create = async (payload) => {
    createdPayment = payload;
    return payload;
  };

  const result = await extendManualSubscription({
    ownerType: "barber",
    ownerId: barberId,
    payerId,
    seatCount: 2,
    months: 2,
  });

  assert.equal(createCalls, 0);
  assert.equal(String(result._id), String(activeSubscription._id));
  assert.equal(result.status, "active");
  assert.equal(result.totalPrice, 10000);
  assert.equal(result.currentPeriodStart.getTime(), currentPeriodEnd.getTime());
  assert.equal(result.currentPeriodEnd.getTime(), expectedPeriodEnd.getTime());
  assert.equal(createdPayment.periodStart.getTime(), currentPeriodEnd.getTime());
  assert.equal(createdPayment.periodEnd.getTime(), expectedPeriodEnd.getTime());
});

test("extending expired subscription starts from now and does not create duplicate subscription", async () => {
  const before = new Date();
  const expiredSubscription = makeSubDoc({
    status: "expired",
    currentPeriodEnd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  });
  let createCalls = 0;
  let paymentCalls = 0;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.findOne = async () => expiredSubscription;
  Subscription.create = async () => {
    createCalls++;
    return makeSubDoc();
  };
  PaymentRecord.create = async () => {
    paymentCalls++;
    return {};
  };

  const result = await extendManualSubscription({
    ownerType: "barber",
    ownerId: barberId,
    payerId,
    seatCount: 1,
    months: 1,
  });
  const after = new Date();

  assert.equal(createCalls, 0);
  assert.equal(paymentCalls, 1);
  assert.equal(result.status, "active");
  assert.ok(result.currentPeriodStart >= before);
  assert.ok(result.currentPeriodStart <= after);
  assert.ok(result.currentPeriodEnd > result.currentPeriodStart);
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

  const activeSeat = makeSubscriptionSeat();
  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);
  User.findById = () => chainableQuery(makeBarberUser());

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, true);
});

test("active individual subscription with past currentPeriodEnd does not grant access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") {
      return makeSubDoc({
        status: "active",
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
    }
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("trialing individual subscription with past currentPeriodEnd does not grant access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") {
      return makeSubDoc({
        status: "trialing",
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
    }
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("active and trialing unexpired individual subscriptions grant access", async () => {
  SubscriptionSeat.findOne = () => chainableQuery(null);

  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") {
      return makeSubDoc({ status: "active" });
    }
    return null;
  };
  assert.equal(await barberHasPaidAccess(barberId), true);

  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") {
      return makeSubDoc({ status: "trialing" });
    }
    return null;
  };
  assert.equal(await barberHasPaidAccess(barberId), true);
});

test("active parent salon subscription with past currentPeriodEnd does not grant assigned seat access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const activeSeat = makeSubscriptionSeat({
    subscriptionId: makeSubDoc({
      ownerType: "salon",
      ownerId: salonId,
      status: "active",
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }),
  });
  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);
  User.findById = () => chainableQuery(makeBarberUser());

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("trialing parent salon subscription with past currentPeriodEnd does not grant salon-scoped seat access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const activeSeat = makeSubscriptionSeat({
    subscriptionId: makeSubDoc({
      ownerType: "salon",
      ownerId: salonId,
      status: "trialing",
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }),
  });
  SubscriptionSeat.find = () => chainableQuery([activeSeat]);
  User.findById = () => chainableQuery(makeBarberUser());

  const hasAccess = await barberHasPaidAccessForSalon(barberId, salonId);
  assert.equal(hasAccess, false);
});

test("stale active seat does not grant barberHasPaidAccess", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  SubscriptionSeat.findOne = () => chainableQuery(makeSubscriptionSeat());
  User.findById = () =>
    chainableQuery(
      makeBarberUser({
        salons: [{ salon: salonId, status: "rejected" }],
        salon: null,
        salonStatus: "none",
      })
    );

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("expired salon subscription + active seat does NOT grant access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const activeSeat = makeSubscriptionSeat({
    subscriptionId: makeSubDoc({
      ownerType: "salon",
      ownerId: salonId,
      status: "expired",
    }),
  });

  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("cancelled salon subscription + active seat does NOT grant access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const activeSeat = makeSubscriptionSeat({
    subscriptionId: makeSubDoc({
      ownerType: "salon",
      ownerId: salonId,
      status: "cancelled",
      currentPeriodEnd: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    }),
  });

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
  User.find = () => chainableQuery([]);

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
        salonId,
        status: "active",
        subscriptionId: parentSub,
      },
    ]);
  User.find = () =>
    chainableQuery([
      {
        _id: paidSeatBarberId,
        role: "barber",
        salons: [{ salon: salonId, status: "approved" }],
      },
      {
        _id: unpaidBarberId,
        role: "barber",
        salons: [],
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

test("stale active seat does not appear in getPaidAccessByBarberIds", async () => {
  const staleSeatBarberId = new mongoose.Types.ObjectId();
  const parentSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
  });

  Subscription.find = () => chainableQuery([]);
  SubscriptionSeat.find = () =>
    chainableQuery([
      {
        barberId: staleSeatBarberId,
        salonId,
        status: "active",
        subscriptionId: parentSub,
      },
    ]);
  User.find = () =>
    chainableQuery([
      {
        _id: staleSeatBarberId,
        role: "barber",
        salons: [{ salon: salonId, status: "rejected" }],
        salon: null,
        salonStatus: "none",
      },
    ]);

  const access = await getPaidAccessByBarberIds([staleSeatBarberId]);

  assert.equal(access.get(String(staleSeatBarberId)), false);
});

test("getPaidAccessByBarberIds ignores active seats on expired salon subscriptions", async () => {
  const coveredBarberId = new mongoose.Types.ObjectId();
  const parentSub = makeSubDoc({ ownerType: "salon", status: "expired" });

  Subscription.find = () => chainableQuery([]);
  SubscriptionSeat.find = () =>
    chainableQuery([
      {
        barberId: coveredBarberId,
        salonId,
        status: "active",
        subscriptionId: parentSub,
      },
    ]);
  User.find = () =>
    chainableQuery([
      {
        _id: coveredBarberId,
        role: "barber",
        salons: [{ salon: salonId, status: "approved" }],
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

test("manual activation availability helper is false in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    assert.equal(isManualActivationAvailable(), false);
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
  assert.ok(subController.devExtendSubscription);
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

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () => chainableQuery([]);
  SubscriptionPaymentAttempt.find = () => chainableQuery([]);

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
  assert.equal(result.defaultPlan.pricePerSeat, defaultPlanDoc.pricePerSeat);
});

test("cancelled salon subscription with future period returns inactive billing summary", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 4,
    totalPrice: 20000,
    status: "cancelled",
    currentPeriodEnd: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    cancelledAt: new Date(),
  });
  const seats = [
    makeBillingSeat({ subscriptionId: salonSub._id, name: "Staff One" }),
    makeBillingSeat({ subscriptionId: salonSub._id, name: "Staff Two" }),
  ];

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = (query) =>
    chainableQuery(query.status === "active" ? seats : []);
  SubscriptionPaymentAttempt.find = () => chainableQuery([]);
  User.find = () => chainableQuery([makeBarberUser()]);

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.equal(result.subscription.status, "cancelled");
  assert.equal(result.subscription.isActive, false);
  assert.equal(result.subscription.daysRemaining, 0);
  assert.equal(result.subscription.seatCount, 4);
  assert.equal(result.activeSeats.length, 2);
  assert.equal(result.activeCapacity, 0);
  assert.equal(result.availableSeatCount, 0);
});

test("salon admin can view subscription seat details", async () => {
  const salonDoc = makeSalonDoc({ ownerId, admins: [adminId] });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 3,
    totalPrice: 15000,
  });

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () => chainableQuery([]);
  SubscriptionPaymentAttempt.find = () => chainableQuery([]);
  User.find = () => chainableQuery([makeBarberUser()]);

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: adminId, role: "barber" },
  });

  assert.ok(result);
  assert.ok(result.subscription);
  assert.equal(result.availableSeatCount, 3);
});

test("salon billing member list includes accepted staff only", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 5,
    totalPrice: 25000,
  });
  const chairRenterId = new mongoose.Types.ObjectId();
  const pendingStaffId = new mongoose.Types.ObjectId();
  const rejectedStaffId = new mongoose.Types.ObjectId();
  let memberQuery = null;
  let memberProjection = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () => chainableQuery([]);
  SubscriptionPaymentAttempt.find = () => chainableQuery([]);
  User.find = (query, projection) => {
    memberQuery = query;
    memberProjection = projection;
    return chainableQuery([
      makeSalonRelationshipUser({ name: "Accepted Staff" }),
      makeSalonRelationshipUser({
        _id: chairRenterId,
        name: "Chair Renter",
        relationshipType: "chair_renter",
      }),
      makeSalonRelationshipUser({
        _id: pendingStaffId,
        name: "Pending Staff",
        relationshipStatus: "pending",
      }),
      makeSalonRelationshipUser({
        _id: rejectedStaffId,
        name: "Rejected Staff",
        relationshipStatus: "rejected",
      }),
    ]);
  };

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.equal(result.approvedMembers.length, 1);
  assert.equal(result.approvedMembers[0].name, "Accepted Staff");
  assert.equal(result.approvedMembers[0].salons, undefined);
  assert.equal(result.approvedMembers[0].salon, undefined);
  assert.equal(result.approvedMembers[0].salonStatus, undefined);
  assert.deepEqual(memberQuery.role, "barber");
  assert.ok(memberQuery.$or[0].salons.$elemMatch.$and);
  assert.match(memberProjection, /salons\.relationshipType/);
  assert.match(memberProjection, /salons\.relationshipStatus/);
});

test("salon subscription details recover latest pending subscription payment attempt", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 2,
    totalPrice: 10000,
  });
  const pendingAttempt = makePaymentAttempt({
    purpose: "subscription",
    ownerType: "salon",
    ownerId: salonId,
    payerId: ownerId,
    status: "pending",
    amount: 10000,
    seatCount: 2,
    months: 1,
    provider: "manual",
    metadata: { action: "update_seats", private: "secret" },
    paidAt: null,
    createdAt: new Date("2026-06-12T12:00:00.000Z"),
  });
  const calls = {};
  let attemptQuery = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () => chainableQuery([]);
  User.find = () => chainableQuery([]);
  SubscriptionPaymentAttempt.find = (query) => {
    attemptQuery = query;
    return {
      sort(sortValue) {
        calls.sort = sortValue;
        return this;
      },
      limit(limitValue) {
        calls.limit = limitValue;
        return this;
      },
      lean() {
        return [pendingAttempt];
      },
    };
  };

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.deepEqual(attemptQuery, {
    purpose: "subscription",
    ownerType: "salon",
    ownerId: salonId,
    status: { $in: ["pending", "requires_action"] },
  });
  assert.deepEqual(calls.sort, { createdAt: -1 });
  assert.equal(calls.limit, 1);
  assert.equal(result.pendingPaymentAttempt.id, String(pendingAttempt._id));
  assert.equal(result.pendingPaymentAttempt.status, "pending");
  assert.equal(result.pendingPaymentAttempt.paidAt, null);
  assert.equal(result.pendingPaymentAttempt.action, "update_seats");
  assertFieldsAbsent(result.pendingPaymentAttempt, sensitiveAttemptResponseFields);
});

test("salon pending payment recovery excludes booking deposit attempts by query", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 1,
    totalPrice: 5000,
  });
  let attemptQuery = null;

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () => chainableQuery([]);
  User.find = () => chainableQuery([]);
  SubscriptionPaymentAttempt.find = (query) => {
    attemptQuery = query;
    return chainableQuery([]);
  };

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.equal(attemptQuery.ownerType, "salon");
  assert.equal(attemptQuery.ownerId, salonId);
  assert.equal(attemptQuery.purpose, "subscription");
  assert.deepEqual(attemptQuery.status, { $in: ["pending", "requires_action"] });
  assert.equal(result.pendingPaymentAttempt, null);
});

test("non-owner/non-admin cannot view details", async () => {
  const salonDoc = makeSalonDoc({ ownerId, admins: [] });
  let attemptedPaymentLookup = false;

  Salon.findById = async () => salonDoc;
  SubscriptionPaymentAttempt.find = () => {
    attemptedPaymentLookup = true;
    return chainableQuery([]);
  };

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
  assert.equal(attemptedPaymentLookup, false);
});

test("removing barber from salon revokes active subscription seat", async () => {
  const activeSeat = makeSubscriptionSeat();
  const otherSalonSeat = makeSubscriptionSeat({
    _id: new mongoose.Types.ObjectId(),
    salonId: new mongoose.Types.ObjectId(),
  });
  let savedSeatStatus = null;
  let savedRevokedAt = null;

  activeSeat.save = async function save() {
    savedSeatStatus = this.status;
    savedRevokedAt = this.revokedAt;
    return this;
  };
  otherSalonSeat.save = async () => {
    throw new Error("Other salon seat should not be revoked");
  };

  SubscriptionSeat.find = () => chainableQuery([activeSeat, otherSalonSeat]);

  const result = await revokeSalonSeatsForRemovedMember({
    salonId,
    barberId,
    revokedBy: ownerId,
  });

  assert.equal(result.revokedCount, 1);
  assert.equal(savedSeatStatus, "revoked");
  assert.ok(savedRevokedAt instanceof Date);
  assert.equal(otherSalonSeat.status, "active");
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
  SubscriptionSeat.find = () => chainableQuery([makeBillingSeat(), makeBillingSeat()]);
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

test("revoked seat frees available seat count", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 2,
    totalPrice: 10000,
  });
  const revokedSeat = makeBillingSeat({
    subscriptionId: salonSub._id,
    status: "revoked",
    revokedAt: new Date(),
  });

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = (query) =>
    chainableQuery(query.status === "active" ? [] : [revokedSeat]);
  SubscriptionPaymentAttempt.find = () => chainableQuery([]);
  User.find = () => chainableQuery([makeBarberUser()]);

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.equal(result.activeSeats.length, 0);
  assert.equal(result.revokedSeats.length, 1);
  assert.equal(result.availableSeatCount, 2);
});

test("salon billing seat details exclude chair renter seats", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 2,
    totalPrice: 10000,
  });
  const acceptedSeat = makeBillingSeat({
    subscriptionId: salonSub._id,
    name: "Accepted Staff",
  });
  const chairRenterSeat = makeBillingSeat({
    subscriptionId: salonSub._id,
    relationshipType: "chair_renter",
  });
  const revokedChairRenterSeat = makeBillingSeat({
    subscriptionId: salonSub._id,
    relationshipType: "chair_renter",
    status: "revoked",
    revokedAt: new Date(),
  });

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = (query) =>
    chainableQuery(
      query.status === "active"
        ? [acceptedSeat, chairRenterSeat]
        : [revokedChairRenterSeat]
    );
  SubscriptionPaymentAttempt.find = () => chainableQuery([]);
  User.find = () => chainableQuery([]);

  const result = await getSalonSubscriptionDetails({
    salonId,
    requester: { _id: ownerId, role: "barber" },
  });

  assert.equal(result.activeSeats.length, 1);
  assert.equal(result.activeSeats[0].barberId.name, "Accepted Staff");
  assert.equal(result.activeSeats[0].barberId.salons, undefined);
  assert.equal(result.revokedSeats.length, 0);
  assert.equal(result.availableSeatCount, 1);
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
      assert.ok(err.message.includes("not an accepted staff member"));
      return true;
    }
  );
});

test("cannot assign salon billing seat to chair renter", async () => {
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
  SubscriptionSeat.countDocuments = async () => 0;
  SubscriptionSeat.findOne = async () => null;
  User.findById = async () =>
    makeSalonRelationshipUser({ relationshipType: "chair_renter" });

  await assert.rejects(
    () =>
      assignSalonSubscriptionSeat({
        salonId,
        barberId,
        assignedBy: { _id: ownerId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("not an accepted staff member"));
      return true;
    }
  );
});

test("cannot assign salon billing seat to pending staff", async () => {
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
  SubscriptionSeat.countDocuments = async () => 0;
  SubscriptionSeat.findOne = async () => null;
  User.findById = async () =>
    makeSalonRelationshipUser({ relationshipStatus: "pending" });

  await assert.rejects(
    () =>
      assignSalonSubscriptionSeat({
        salonId,
        barberId,
        assignedBy: { _id: ownerId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("not an accepted staff member"));
      return true;
    }
  );
});

test("chair renter active seat does not consume accepted staff seat cap", async () => {
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 1,
    totalPrice: 5000,
    status: "active",
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.find = () =>
    chainableQuery([makeBillingSeat({ relationshipType: "chair_renter" })]);
  SubscriptionSeat.findOne = async () => null;
  User.findById = async () => makeSalonRelationshipUser();
  SubscriptionSeat.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
  });

  const seat = await assignSalonSubscriptionSeat({
    salonId,
    barberId,
    assignedBy: { _id: ownerId, role: "barber" },
  });

  assert.equal(seat.status, "active");
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
  SubscriptionSeat.find = () =>
    chainableQuery([makeBillingSeat(), makeBillingSeat(), makeBillingSeat()]);
  SubscriptionSeat.findOne = async () => null;
  User.findById = async () => makeBarberUser();

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

test("cannot exceed paid seatCount under repeated assignment attempts", async () => {
  const secondBarberId = new mongoose.Types.ObjectId();
  const salonDoc = makeSalonDoc({ ownerId });
  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 1,
    totalPrice: 5000,
    status: "active",
  });
  let activeSeatCount = 0;

  Salon.findById = async () => salonDoc;
  Subscription.findOne = () => chainableQuery(salonSub);
  SubscriptionSeat.countDocuments = async () => activeSeatCount;
  SubscriptionSeat.find = () =>
    chainableQuery(
      Array.from({ length: activeSeatCount }, () => makeBillingSeat())
    );
  SubscriptionSeat.findOne = async () => null;
  SubscriptionSeat.create = async (data) => {
    activeSeatCount += 1;
    return {
      ...data,
      _id: new mongoose.Types.ObjectId(),
    };
  };
  User.findById = async (id) =>
    makeBarberUser({
      _id: id,
      salons: [{ salon: salonId, status: "approved" }],
    });

  const firstSeat = await assignSalonSubscriptionSeat({
    salonId,
    barberId,
    assignedBy: { _id: ownerId, role: "barber" },
  });

  assert.equal(firstSeat.status, "active");

  await assert.rejects(
    () =>
      assignSalonSubscriptionSeat({
        salonId,
        barberId: secondBarberId,
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

  const activeSeat = makeSubscriptionSeat();
  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);
  User.findById = () => chainableQuery(makeBarberUser());

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, true);
});

test("active salon seat does not grant chair renter paid access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const activeSeat = makeSubscriptionSeat();
  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);
  User.findById = () =>
    chainableQuery(makeSalonRelationshipUser({ relationshipType: "chair_renter" }));

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, false);
});

test("active salon seat does not grant pending or rejected staff paid access", async () => {
  const activeSeat = makeSubscriptionSeat();

  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(activeSeat);

  User.findById = () =>
    chainableQuery(makeSalonRelationshipUser({ relationshipStatus: "pending" }));
  const pendingAccess = await barberHasPaidAccess(barberId);
  assert.equal(pendingAccess, false);

  User.findById = () =>
    chainableQuery(makeSalonRelationshipUser({ relationshipStatus: "rejected" }));
  const rejectedAccess = await barberHasPaidAccess(barberId);
  assert.equal(rejectedAccess, false);
});

test("chair renter own active subscription still grants paid access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return makeSubDoc({ status: "active" });
    return null;
  };
  SubscriptionSeat.findOne = () => {
    assert.fail("Salon seat should not be checked after active individual subscription");
  };

  const hasAccess = await barberHasPaidAccess(barberId);
  assert.equal(hasAccess, true);
});

test("expired salon subscription + active seat does not grant access", async () => {
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };

  const activeSeat = makeSubscriptionSeat({
    subscriptionId: makeSubDoc({
      ownerType: "salon",
      ownerId: salonId,
      status: "expired",
    }),
  });

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

test("getDaysRemaining works for active, trialing, and expired dates", () => {
  const now = new Date("2026-06-05T00:00:00.000Z");

  assert.equal(getDaysRemaining("2026-06-15T00:00:00.000Z", now), 10);
  assert.equal(getDaysRemaining("2026-06-06T00:00:00.000Z", now), 1);
  assert.equal(getDaysRemaining("2026-06-01T00:00:00.000Z", now), 0);
});

test("serializeSubscriptionStatus marks expiring soon when <= 7 days", () => {
  const now = new Date("2026-06-05T00:00:00.000Z");
  const subscription = makeSubDoc({
    status: "active",
    seatCount: 4,
    totalPrice: 20000,
    currentPeriodEnd: new Date("2026-06-10T00:00:00.000Z"),
  });

  const result = serializeSubscriptionStatus(subscription, defaultPlanDoc, now);

  assert.equal(result.daysRemaining, 5);
  assert.equal(result.isExpired, false);
  assert.equal(result.isExpiringSoon, true);
  assert.equal(result.renewalRequiredAt.getTime(), subscription.currentPeriodEnd.getTime());
  assert.equal(result.monthlyTotal, 20000);
  assert.equal(result.pricePerSeat, 5000);
  assert.equal(result.seatCount, 4);
});

test("serializeSubscriptionStatus marks expired subscription", () => {
  const now = new Date("2026-06-05T00:00:00.000Z");
  const subscription = makeSubDoc({
    status: "active",
    currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
  });

  const result = serializeSubscriptionStatus(subscription, defaultPlanDoc, now);

  assert.equal(result.daysRemaining, 0);
  assert.equal(result.isExpired, true);
  assert.equal(result.isExpiringSoon, false);
});

test("payment intent for barber calculates default plan amount and does not activate subscription", async () => {
  let subscriptionCreated = false;
  let paymentCreated = false;
  const attemptStub = stubPaymentAttemptCreate();

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Subscription.create = async () => {
    subscriptionCreated = true;
    return {};
  };
  PaymentRecord.create = async () => {
    paymentCreated = true;
    return {};
  };

  const result = await createSubscriptionPaymentIntent({
    requester: { _id: barberId, role: "barber" },
    ownerType: "barber",
    ownerId: barberId,
    seatCount: 1,
  });

  assert.equal(result.requiresManualActivation, true);
  assert.equal(result.status, "pending");
  assert.equal(result.amount, defaultPlanDoc.pricePerSeat);
  assert.equal(result.currency, defaultPlanDoc.currency);
  assert.equal(result.provider, undefined);
  assert.equal(result.paymentAttemptId, undefined);
  assert.equal(result.metadata, undefined);
  assert.equal(result.ownerId, undefined);
  assert.equal(result.paymentAttempt.status, "pending");
  assert.equal(result.paymentAttempt.amount, defaultPlanDoc.pricePerSeat);
  assert.equal(result.paymentAttempt.months, 1);
  assert.equal(result.paymentAttempt.id, String(attemptStub.getCreatedAttempt()._id));
  assert.equal(result.paymentAttempt.action, "renew");
  assertFieldsAbsent(result.paymentAttempt, sensitiveAttemptResponseFields);
  assert.deepEqual(attemptStub.getCreatedAttempt().metadata, {
    ownerType: "barber",
    ownerId: String(barberId),
    seatCount: 1,
    months: 1,
    planCode: defaultPlanDoc.code,
    monthlyTotal: defaultPlanDoc.pricePerSeat,
    action: "renew",
  });
  assert.equal(subscriptionCreated, false);
  assert.equal(paymentCreated, false);
});

test("salon owner can create payment intent for 4 seats", async () => {
  const attemptStub = stubPaymentAttemptCreate();

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => makeSalonDoc({ ownerId: barberId });

  const result = await createSubscriptionPaymentIntent({
    requester: { _id: barberId, role: "barber" },
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 4,
  });

  assert.equal(result.requiresManualActivation, true);
  assert.equal(result.provider, undefined);
  assert.equal(result.ownerType, undefined);
  assert.equal(result.ownerId, undefined);
  assert.equal(result.seatCount, 4);
  assert.equal(result.months, 1);
  assert.equal(result.pricePerSeat, defaultPlanDoc.pricePerSeat);
  assert.equal(result.amount, defaultPlanDoc.pricePerSeat * 4);
  assert.equal(result.monthlyTotal, defaultPlanDoc.pricePerSeat * 4);
  assert.equal(result.currency, defaultPlanDoc.currency);
  assert.equal(result.message, "Manual payment activation is required.");
  assert.equal(result.paymentAttempt.status, "pending");
  assert.equal(result.paymentAttempt.id, String(attemptStub.getCreatedAttempt()._id));
  assert.equal(result.paymentAttempt.action, "renew");
  assert.equal(result.metadata, undefined);
  assertFieldsAbsent(result.paymentAttempt, sensitiveAttemptResponseFields);
  assert.deepEqual(attemptStub.getCreatedAttempt().metadata, {
    ownerType: "salon",
    ownerId: String(salonId),
    seatCount: 4,
    months: 1,
    planCode: defaultPlanDoc.code,
    monthlyTotal: defaultPlanDoc.pricePerSeat * 4,
    action: "renew",
  });
});

test("cancelled salon subscription can still prepare renewal payment", async () => {
  const attemptStub = stubPaymentAttemptCreate();

  SubscriptionPlan.findOne = async () => defaultPlanDoc;
  Salon.findById = async () => makeSalonDoc({ ownerId: barberId });
  Subscription.findOne = () =>
    chainableQuery(
      makeSubDoc({
        ownerType: "salon",
        ownerId: salonId,
        status: "cancelled",
      })
    );

  const result = await createSubscriptionPaymentIntent({
    requester: { _id: barberId, role: "barber" },
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 4,
    months: 1,
    action: "renew",
  });

  assert.equal(result.paymentAttempt.id, String(attemptStub.getCreatedAttempt()._id));
  assert.equal(result.status, "pending");
  assert.equal(result.paymentAttempt.status, "pending");
});

test("payment intent rejects non-integer salon seatCount", async () => {
  await assert.rejects(
    () =>
      createSubscriptionPaymentIntent({
        requester: { _id: barberId, role: "barber" },
        ownerType: "salon",
        ownerId: salonId,
        seatCount: 1.5,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === "seatCount must be at least 1"
  );
});

test("non-owner cannot create salon payment intent", async () => {
  Salon.findById = async () => makeSalonDoc({ ownerId: otherUserId, admins: [] });

  await assert.rejects(
    () =>
      createSubscriptionPaymentIntent({
        requester: { _id: barberId, role: "barber" },
        ownerType: "salon",
        ownerId: salonId,
        seatCount: 1,
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "Only salon owner or admin can prepare payment attempts"
  );
});

test("payment intent supports months and creates pending attempt for total amount", async () => {
  const attemptStub = stubPaymentAttemptCreate();

  SubscriptionPlan.findOne = async () => defaultPlanDoc;

  const result = await createSubscriptionPaymentIntent({
    requester: { _id: barberId, role: "barber" },
    ownerType: "barber",
    ownerId: barberId,
    seatCount: 1,
    months: 3,
  });

  assert.equal(result.paymentAttempt.id, String(attemptStub.getCreatedAttempt()._id));
  assert.equal(result.status, "pending");
  assert.equal(result.months, 3);
  assert.equal(result.amount, defaultPlanDoc.pricePerSeat * 3);
  assert.equal(result.paymentAttemptId, undefined);
  assert.equal(attemptStub.getCreatedAttempt().status, "pending");
  assert.equal(attemptStub.getCreatedAttempt().amount, defaultPlanDoc.pricePerSeat * 3);
});

test("payment intent rejects invalid months", async () => {
  await assert.rejects(
    () =>
      createSubscriptionPaymentIntent({
        requester: { _id: barberId, role: "barber" },
        ownerType: "barber",
        ownerId: barberId,
        months: 0,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === "months must be at least 1"
  );
});

test("client cannot create payment attempt", async () => {
  await assert.rejects(
    () =>
      createSubscriptionPaymentIntent({
        requester: { _id: clientId, role: "client" },
        ownerType: "barber",
        ownerId: clientId,
        seatCount: 1,
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "Only barbers can manage subscription payments"
  );
});

test("dev-confirm activates subscription and creates one paid payment record", async () => {
  const now = new Date("2026-06-05T12:00:00.000Z");
  let attemptSaveCount = 0;
  const attempt = makePaymentAttempt({
    months: 2,
    amount: 10000,
    save() {
      attemptSaveCount++;
      return this;
    },
  });
  const stubs = stubManualConfirmationDependencies();

  SubscriptionPaymentAttempt.findById = async () => attempt;

  const result = await confirmSubscriptionPaymentAttempt({
    paymentAttemptId: attempt._id,
    confirmedBy: { _id: barberId, role: "barber" },
    now,
  });

  assert.equal(result.idempotent, false);
  assert.equal(result.paymentAttempt.status, "paid");
  assert.equal(result.paymentAttempt.paidAt.getTime(), now.getTime());
  assert.equal(result.paymentAttempt.subscriptionId, undefined);
  assertFieldsAbsent(result.paymentAttempt, sensitiveAttemptResponseFields);
  assert.equal(result.subscription.status, "active");
  assert.equal(result.subscription.totalPrice, defaultPlanDoc.pricePerSeat);
  assert.equal(stubs.getSubscriptionCreateCount(), 1);
  assert.equal(stubs.getPaymentRecords().length, 1);
  assert.equal(stubs.getPaymentRecords()[0].amount, defaultPlanDoc.pricePerSeat * 2);
  assert.equal(stubs.getPaymentRecords()[0].status, "paid");
  assert.equal(attemptSaveCount, 1);
});

test("dev-confirm is idempotent and does not double-extend subscription", async () => {
  const attempt = makePaymentAttempt();
  let attemptSaveCount = 0;
  attempt.save = async function save() {
    attemptSaveCount++;
    return this;
  };
  const stubs = stubManualConfirmationDependencies();

  SubscriptionPaymentAttempt.findById = async () => attempt;

  const first = await confirmSubscriptionPaymentAttempt({
    paymentAttemptId: attempt._id,
    confirmedBy: { _id: barberId, role: "barber" },
  });
  const subscription = stubs.getSubscription();

  Subscription.findById = async (id) => {
    assert.equal(String(id), String(subscription._id));
    return subscription;
  };

  const second = await confirmSubscriptionPaymentAttempt({
    paymentAttemptId: attempt._id,
    confirmedBy: { _id: barberId, role: "barber" },
  });

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(stubs.getSubscriptionCreateCount(), 1);
  assert.equal(stubs.getSubscriptionFindCount(), 1);
  assert.equal(stubs.getPaymentRecords().length, 1);
  assert.equal(attemptSaveCount, 1);
});

test("cancel pending payment attempt works and does not activate subscription", async () => {
  let attemptSaveCount = 0;
  let subscriptionCreated = false;
  const attempt = makePaymentAttempt({
    save() {
      attemptSaveCount++;
      return this;
    },
  });

  SubscriptionPaymentAttempt.findById = async () => attempt;
  Subscription.create = async () => {
    subscriptionCreated = true;
    return {};
  };

  const result = await cancelSubscriptionPaymentAttempt({
    paymentAttemptId: attempt._id,
    requester: { _id: barberId, role: "barber" },
  });

  assert.equal(result.status, "cancelled");
  assertFieldsAbsent(result, sensitiveAttemptResponseFields);
  assert.equal(attempt.status, "cancelled");
  assert.equal(attemptSaveCount, 1);
  assert.equal(subscriptionCreated, false);
});

test("cancelled payment attempt cannot be confirmed", async () => {
  const attempt = makePaymentAttempt({ status: "cancelled" });

  SubscriptionPaymentAttempt.findById = async () => attempt;

  await assert.rejects(
    () =>
      confirmSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        confirmedBy: { _id: barberId, role: "barber" },
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === "Only pending payment attempts can be confirmed"
  );
});

test("non-owner cannot read, confirm, or cancel payment attempt", async () => {
  const attempt = makePaymentAttempt();

  SubscriptionPaymentAttempt.findById = async () => attempt;

  await assert.rejects(
    () =>
      getSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        requester: { _id: otherUserId, role: "barber" },
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "You can only view your own payment attempt"
  );

  await assert.rejects(
    () =>
      cancelSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        requester: { _id: otherUserId, role: "barber" },
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "You can only cancel your own payment attempt"
  );

  await assert.rejects(
    () =>
      confirmSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        confirmedBy: { _id: otherUserId, role: "barber" },
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "You can only confirm your own payment attempt"
  );
});

test("salon owner can confirm salon payment attempt", async () => {
  const attempt = makePaymentAttempt({
    ownerType: "salon",
    ownerId: salonId,
    payerId: otherUserId,
    seatCount: 4,
    amount: 20000,
  });
  const stubs = stubManualConfirmationDependencies();

  SubscriptionPaymentAttempt.findById = async () => attempt;
  Salon.findById = async () => makeSalonDoc({ ownerId: barberId });

  const result = await confirmSubscriptionPaymentAttempt({
    paymentAttemptId: attempt._id,
    confirmedBy: { _id: barberId, role: "barber" },
  });

  assert.equal(result.paymentAttempt.status, "paid");
  assert.equal(result.subscription.ownerType, "salon");
  assert.equal(result.subscription.seatCount, 4);
  assert.equal(result.subscription.totalPrice, defaultPlanDoc.pricePerSeat * 4);
  assert.equal(stubs.getPaymentRecords().length, 1);
  assert.equal(stubs.getPaymentRecords()[0].ownerType, "salon");
});

test("current salon admin can view salon payment attempt", async () => {
  const attempt = makePaymentAttempt({
    ownerType: "salon",
    ownerId: salonId,
    payerId: otherUserId,
  });

  SubscriptionPaymentAttempt.findById = async () => attempt;
  Salon.findById = async () => makeSalonDoc({ admins: [adminId] });

  const result = await getSubscriptionPaymentAttempt({
    paymentAttemptId: attempt._id,
    requester: { _id: adminId, role: "barber" },
  });

  assert.equal(result.id, String(attempt._id));
  assert.equal(result.status, "pending");
  assertFieldsAbsent(result, sensitiveAttemptResponseFields);
});

test("removed salon admin cannot access old salon payment attempt as payer", async () => {
  const attempt = makePaymentAttempt({
    ownerType: "salon",
    ownerId: salonId,
    payerId: adminId,
  });

  SubscriptionPaymentAttempt.findById = async () => attempt;
  Salon.findById = async () => makeSalonDoc({ ownerId: otherUserId, admins: [] });

  await assert.rejects(
    () =>
      getSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        requester: { _id: adminId, role: "barber" },
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "Only salon owner or admin can view payment attempts"
  );
});

test("current salon owner cannot access another salon payment attempt", async () => {
  const otherSalonId = new mongoose.Types.ObjectId();
  const attempt = makePaymentAttempt({
    ownerType: "salon",
    ownerId: otherSalonId,
    payerId: otherUserId,
  });

  SubscriptionPaymentAttempt.findById = async () => attempt;
  Salon.findById = async (id) => {
    assert.equal(String(id), String(otherSalonId));
    return makeSalonDoc({ _id: otherSalonId, ownerId: otherUserId, admins: [] });
  };

  await assert.rejects(
    () =>
      getSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        requester: { _id: ownerId, role: "barber" },
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "Only salon owner or admin can view payment attempts"
  );
});

test("client cannot confirm payment attempt", async () => {
  const attempt = makePaymentAttempt({
    ownerId: clientId,
    payerId: clientId,
  });

  SubscriptionPaymentAttempt.findById = async () => attempt;

  await assert.rejects(
    () =>
      confirmSubscriptionPaymentAttempt({
        paymentAttemptId: attempt._id,
        confirmedBy: { _id: clientId, role: "client" },
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "Only barbers can manage subscription payments"
  );
});

test("individual payment history returns own records newest first", async () => {
  const oldPayment = {
    _id: new mongoose.Types.ObjectId(),
    ownerType: "barber",
    ownerId: barberId,
    payerId: barberId,
    subscriptionId: new mongoose.Types.ObjectId(),
    amount: 5000,
    currency: "AMD",
    provider: "manual",
    providerPaymentId: "private-provider-reference",
    paidAt: new Date("2026-05-01T00:00:00.000Z"),
  };
  const newPayment = {
    _id: new mongoose.Types.ObjectId(),
    ownerType: "barber",
    ownerId: barberId,
    payerId: barberId,
    subscriptionId: new mongoose.Types.ObjectId(),
    amount: 5000,
    currency: "AMD",
    provider: "manual",
    providerPaymentId: "private-provider-reference-new",
    paidAt: new Date("2026-06-01T00:00:00.000Z"),
  };
  let paymentQuery = null;

  PaymentRecord.find = (query) => {
    paymentQuery = query;
    return paymentHistoryQuery([oldPayment, newPayment]);
  };

  const result = await getMySubscriptionPaymentHistory({
    requester: { _id: barberId, role: "barber" },
  });

  assert.deepEqual(paymentQuery, {
    $or: [
      { ownerType: "barber", ownerId: barberId },
      { payerId: barberId },
    ],
  });
  assert.deepEqual(
    result.map((payment) => payment.paidAt),
    [newPayment.paidAt, oldPayment.paidAt]
  );
  result.forEach((payment) =>
    assertFieldsAbsent(payment, sensitivePaymentRecordResponseFields)
  );
});

test("client cannot access barber payment history", async () => {
  await assert.rejects(
    () =>
      getMySubscriptionPaymentHistory({
        requester: { _id: clientId, role: "client" },
      }),
    (error) =>
      error.statusCode === 403 &&
      error.message === "Only barbers can view subscription payments"
  );
});

test("salon payment history requires owner or admin", async () => {
  Salon.findById = async () => makeSalonDoc({ ownerId, admins: [] });

  await assert.rejects(
    () =>
      getSalonSubscriptionPaymentHistory({
        salonId,
        requester: { _id: otherUserId, role: "barber" },
      }),
    (error) => error.statusCode === 403
  );
});

test("salon payment history returns records newest first", async () => {
  const calls = {};
  const oldPayment = {
    _id: new mongoose.Types.ObjectId(),
    ownerType: "salon",
    ownerId: salonId,
    payerId: ownerId,
    subscriptionId: new mongoose.Types.ObjectId(),
    amount: 10000,
    currency: "AMD",
    provider: "manual",
    providerPaymentId: "private-provider-reference",
    paidAt: new Date("2026-04-01T00:00:00.000Z"),
  };
  const newPayment = {
    _id: new mongoose.Types.ObjectId(),
    ownerType: "salon",
    ownerId: salonId,
    payerId: ownerId,
    subscriptionId: new mongoose.Types.ObjectId(),
    amount: 20000,
    currency: "AMD",
    provider: "manual",
    providerPaymentId: "private-provider-reference-new",
    paidAt: new Date("2026-06-01T00:00:00.000Z"),
  };
  let paymentQuery = null;

  Salon.findById = async () => makeSalonDoc({ ownerId });
  PaymentRecord.find = (query) => {
    paymentQuery = query;
    return paymentHistoryQuery([oldPayment, newPayment], calls);
  };

  const result = await getSalonSubscriptionPaymentHistory({
    salonId,
    requester: { _id: ownerId, role: "barber" },
    limit: 10,
  });

  assert.deepEqual(paymentQuery, {
    ownerType: "salon",
    ownerId: salonId,
  });
  assert.deepEqual(calls.sort, { paidAt: -1, createdAt: -1 });
  assert.equal(calls.limit, 10);
  assert.deepEqual(
    result.map((payment) => payment.paidAt),
    [newPayment.paidAt, oldPayment.paidAt]
  );
  result.forEach((payment) =>
    assertFieldsAbsent(payment, sensitivePaymentRecordResponseFields)
  );
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

test("direct seatCount update cannot increase paid seats", async () => {
  const salonDoc = makeSalonDoc({ ownerId });

  const salonSub = makeSubDoc({
    ownerType: "salon",
    ownerId: salonId,
    seatCount: 3,
    totalPrice: 15000,
    pricePerSeat: 5000,
    save() {
      return this;
    },
  });

  Salon.findById = async () => salonDoc;
  Subscription.findOne = async () => salonSub;
  SubscriptionSeat.countDocuments = async () => 2;

  await assert.rejects(
    () =>
      updateSalonSubscriptionSeatCount({
        salonId,
        seatCount: 5,
        requester: { _id: ownerId, role: "barber" },
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("requires preparing payment"));
      return true;
    }
  );
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

test("booking creation is blocked for unpaid barber (salon-scoped paid access check)", async () => {
  // When barber has no subscription and no seat, createBooking should return 403
  Subscription.findOne = async (query) => {
    if (query.ownerType === "barber") return null;
    return null;
  };
  SubscriptionSeat.findOne = () => chainableQuery(null);

  const bookingCtrl = await import("../controllers/bookingController.js");
  assert.ok(bookingCtrl.createBooking);
  // The check is within createBooking – verify it uses the salon-scoped helper.
  // This is a structural test to confirm the enforcement was added
  const fs = await import("fs");
  const source = fs.readFileSync("./src/controllers/bookingController.js", "utf-8");
  assert.ok(
    source.includes("barberHasPaidAccessForSalon("),
    "createBooking must call barberHasPaidAccessForSalon"
  );
  assert.ok(source.includes('"BARBER_UNAVAILABLE"'), "createBooking must return BARBER_UNAVAILABLE code");
  assert.ok(source.includes("not currently accepting bookings"), "createBooking must return user-friendly message");
});

test("public barber listings use paid-access filtering", async () => {
  const fs = await import("fs");
  const userSource = fs.readFileSync("./src/controllers/users/userController.js", "utf-8");
  const profileSource = fs.readFileSync("./src/controllers/barbers/barberProfileController.js", "utf-8");

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
  assert.match(source, /router\.post\("\/salon\/:salonId\/seats",\s*protect,\s*paymentLimiter,\s*assignSeat/);
  assert.match(source, /router\.patch\("\/seats\/:seatId\/revoke",\s*protect,\s*paymentLimiter,\s*revokeSeat/);
});

test("barber profile upsert does not require subscription (Phase 1 non-enforcement preserved)", async () => {
  const fs = await import("fs");
  const source = fs.readFileSync("./src/routes/barberRoutes.js", "utf-8");

  // Profile upsert route should NOT have subscription guard
  const upsertMatch = source.match(/router\.put\(\s*"\/profile\/:barberId",/);
  assert.ok(upsertMatch);
  assert.ok(!source.match(/router\.put\(\s*"\/profile\/:barberId",\s*protect,\s*requireBarberSubscription/));
});
