import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../models/Salon.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import PaymentRecord from "../models/PaymentRecord.js";
import { getPlatformDashboardSummary } from "./platformDashboardService.js";

const oid = (hex) => new mongoose.Types.ObjectId(hex);

const salonId = oid("64b000000000000000100001");
const salonOwnerId = oid("64b000000000000000100002");
const barberId = oid("64b000000000000000100003");
const secondSalonId = oid("64b000000000000000100004");

const originals = {};

const saveOriginal = (obj, key) => {
  const storageKey = `${obj.modelName || obj.name}__${key}`;
  if (originals[storageKey] === undefined) {
    originals[storageKey] = obj[key];
  }
};

const restoreOriginals = () => {
  const modelMap = { Salon, User, Subscription, PaymentRecord };
  for (const [key, value] of Object.entries(originals)) {
    const [modelName, method] = key.split("__");
    if (modelMap[modelName] && value !== undefined) {
      modelMap[modelName][method] = value;
    }
    delete originals[key];
  }
};

const projectDoc = (doc, fields) => {
  if (!fields) return doc;
  const fieldNames = String(fields).split(/\s+/).filter(Boolean);
  const projected = {};
  if (doc?._id !== undefined) projected._id = doc._id;
  for (const field of fieldNames) {
    if (field.startsWith("-") || doc?.[field] === undefined) continue;
    projected[field] = doc[field];
  }
  return projected;
};

const qc = (result, selectedFields = null) => ({
  select: (fields) => qc(result, fields),
  sort: () => qc(result, selectedFields),
  limit: () => qc(result, selectedFields),
  lean: async () =>
    Array.isArray(result)
      ? result.map((item) => projectDoc(item, selectedFields))
      : projectDoc(result, selectedFields),
});

const mockMethod = (Model, method, impl) => {
  saveOriginal(Model, method);
  Model[method] = impl;
};

afterEach(() => {
  restoreOriginals();
});

const subscriptions = [
  {
    _id: oid("64b000000000000000200001"),
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
    seatCount: 2,
    totalPrice: 200,
    provider: "manual",
    currentPeriodStart: new Date("2025-06-01"),
    currentPeriodEnd: new Date("2025-07-01"),
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2025-06-01"),
  },
  {
    _id: oid("64b000000000000000200002"),
    ownerType: "barber",
    ownerId: barberId,
    status: "active",
    seatCount: 1,
    totalPrice: 100,
    provider: "manual",
    currentPeriodStart: new Date("2025-06-01"),
    currentPeriodEnd: new Date("2025-07-01"),
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2025-06-01"),
  },
  {
    _id: oid("64b000000000000000200003"),
    ownerType: "salon",
    ownerId: secondSalonId,
    status: "trialing",
    seatCount: 1,
    totalPrice: 0,
    provider: "manual",
    trialEndsAt: new Date("2025-07-01"),
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2025-06-01"),
  },
  {
    _id: oid("64b000000000000000200004"),
    ownerType: "barber",
    ownerId: oid("64b000000000000000100005"),
    status: "expired",
    seatCount: 1,
    totalPrice: 100,
    provider: "manual",
    currentPeriodEnd: new Date("2025-05-01"),
    createdAt: new Date("2025-05-01"),
    updatedAt: new Date("2025-05-01"),
  },
  {
    _id: oid("64b000000000000000200005"),
    ownerType: "salon",
    ownerId: secondSalonId,
    status: "past_due",
    seatCount: 1,
    totalPrice: 100,
    provider: "manual",
    currentPeriodEnd: new Date("2025-07-01"),
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2025-06-01"),
  },
];

const salonPayment = {
  _id: oid("64b000000000000000300001"),
  subscriptionId: oid("64b000000000000000200001"),
  payerId: salonOwnerId,
  ownerType: "salon",
  ownerId: salonId,
  amount: 300,
  currency: "AMD",
  status: "paid",
  provider: "manual",
  providerPaymentId: "secret-provider-ref",
  periodStart: new Date("2025-06-01"),
  periodEnd: new Date("2025-07-01"),
  paidAt: new Date("2025-06-10"),
  createdAt: new Date("2025-06-10"),
  metadata: { raw: true },
};

const individualPayment = {
  _id: oid("64b000000000000000300002"),
  subscriptionId: oid("64b000000000000000200002"),
  payerId: barberId,
  ownerType: "barber",
  ownerId: barberId,
  amount: 100,
  currency: "AMD",
  status: "paid",
  provider: "manual",
  providerPaymentId: "secret-provider-ref",
  periodStart: new Date("2025-06-01"),
  periodEnd: new Date("2025-07-01"),
  paidAt: new Date("2025-06-11"),
  createdAt: new Date("2025-06-11"),
};

const mockDashboardModels = ({
  revenueRecords = [salonPayment, individualPayment],
  recentRecords = [individualPayment, salonPayment],
} = {}) => {
  const captured = {};

  mockMethod(Salon, "countDocuments", async () => 2);
  mockMethod(User, "countDocuments", async (filter) => {
    captured.userCountFilter = filter;
    return 2;
  });
  mockMethod(Subscription, "find", (filter) => {
    captured.subscriptionFilter = filter;
    return qc(subscriptions);
  });
  mockMethod(PaymentRecord, "find", (filter) => {
    if (filter.paidAt) {
      captured.revenueFilter = filter;
      return qc(revenueRecords);
    }

    captured.recentFilter = filter;
    return qc(recentRecords);
  });
  mockMethod(Salon, "find", () =>
    qc([
      { _id: salonId, name: "Salon One", ownerId: salonOwnerId, city: "Yerevan" },
      { _id: secondSalonId, name: "Salon Two", ownerId: salonOwnerId, city: "Gyumri" },
    ])
  );
  mockMethod(User, "find", () =>
    qc([
      {
        _id: salonOwnerId,
        name: "Salon Owner",
        email: "owner@example.com",
        password: "hash",
        platformRole: "superuser",
      },
      {
        _id: barberId,
        name: "Individual Barber",
        email: "barber@example.com",
        password: "hash",
        platformRole: "superuser",
      },
    ])
  );

  return captured;
};

test("platform dashboard summary separates salon and individual subscriptions", async () => {
  const captured = mockDashboardModels();

  const result = await getPlatformDashboardSummary({
    now: new Date("2025-06-15T12:00:00Z"),
  });

  assert.deepEqual(captured.userCountFilter, { role: "barber" });
  assert.deepEqual(captured.subscriptionFilter.ownerType.$in, ["salon", "barber"]);
  assert.equal(result.overview.totalSalons, 2);
  assert.equal(result.overview.totalBarbers, 2);
  assert.equal(result.overview.salonSubscriptionsTotal, 3);
  assert.equal(result.overview.individualSubscriptionsTotal, 2);
  assert.equal(result.overview.activeSalonSubscriptions, 1);
  assert.equal(result.overview.activeIndividualSubscriptions, 1);
  assert.equal(result.overview.trialSubscriptions, 1);
  assert.equal(result.overview.expiredSubscriptions, 1);
  assert.equal(result.overview.pastDueSubscriptions, 1);
});

test("platform dashboard revenue uses current-month paid payment records only", async () => {
  const captured = mockDashboardModels();

  const result = await getPlatformDashboardSummary({
    now: new Date("2025-06-15T12:00:00Z"),
  });

  assert.deepEqual(captured.revenueFilter.ownerType.$in, ["salon", "barber"]);
  assert.equal(captured.revenueFilter.status, "paid");
  assert.equal(captured.revenueFilter.paidAt.$gte.toISOString(), "2025-06-01T00:00:00.000Z");
  assert.equal(captured.revenueFilter.paidAt.$lt.toISOString(), "2025-07-01T00:00:00.000Z");
  assert.equal(result.revenueThisMonth.salon.amount, 300);
  assert.equal(result.revenueThisMonth.individual.amount, 100);
  assert.equal(result.revenueThisMonth.total.amount, 400);
  assert.equal(result.revenueThisMonth.total.currency, "AMD");
});

test("platform dashboard revenue reports mixed currencies without summing", async () => {
  mockDashboardModels({
    revenueRecords: [
      salonPayment,
      {
        ...individualPayment,
        _id: oid("64b000000000000000300003"),
        amount: 25,
        currency: "USD",
      },
    ],
    recentRecords: [],
  });

  const result = await getPlatformDashboardSummary({
    now: new Date("2025-06-15T12:00:00Z"),
  });

  assert.equal(result.revenueThisMonth.salon.amount, 300);
  assert.equal(result.revenueThisMonth.salon.currency, "AMD");
  assert.equal(result.revenueThisMonth.individual.amount, 25);
  assert.equal(result.revenueThisMonth.individual.currency, "USD");
  assert.equal(result.revenueThisMonth.total.amount, null);
  assert.equal(result.revenueThisMonth.total.currency, "MIXED");
  assert.deepEqual(result.revenueThisMonth.total.byCurrency, [
    { amount: 300, currency: "AMD" },
    { amount: 25, currency: "USD" },
  ]);
});

test("platform dashboard recent payments and alerts are sanitized", async () => {
  mockDashboardModels();

  const result = await getPlatformDashboardSummary({
    now: new Date("2025-06-15T12:00:00Z"),
  });

  assert.equal(result.recentPayments.length, 2);
  assert.equal(result.recentPayments[0].source, "payment_record");
  assert.equal(result.recentPayments[0].ownerType, "individual");
  assert.equal(result.recentPayments[0].ownerName, "Individual Barber");
  assert.equal(result.alerts.expired.length, 1);
  assert.equal(result.alerts.pastDue.length, 1);
  assert.equal(result.alerts.pastDue[0].ownerType, "salon");

  const serialized = JSON.stringify(result);
  for (const hiddenField of [
    "_id",
    "ownerId",
    "payerId",
    "subscriptionId",
    "providerPaymentId",
    "providerIntentId",
    "checkoutUrl",
    "metadata",
    "processedWebhookEventIds",
    "password",
    "platformRole",
  ]) {
    assert.equal(serialized.includes(hiddenField), false, `${hiddenField} should be hidden`);
  }
});
