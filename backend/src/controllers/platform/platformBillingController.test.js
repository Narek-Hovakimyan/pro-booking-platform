import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import {
  activateSubscription,
  assignSeat,
  cancelSubscription,
  confirmPayment,
  getSalonPaymentsHandler,
  revokeSeat,
  updateSeatCount,
} from "./platformBillingController.js";

const originalMethods = {
  mongooseReadyState: mongoose.connection.readyState,
  mongooseStartSession: mongoose.startSession,
  salonFindById: Salon.findById,
  userFind: User.find,
  userFindById: User.findById,
  subscriptionFindOne: Subscription.findOne,
  subscriptionFindOneAndUpdate: Subscription.findOneAndUpdate,
  subscriptionFindById: Subscription.findById,
  subscriptionCreate: Subscription.create,
  subscriptionDeleteOne: Subscription.deleteOne,
  subscriptionPlanFindOne: SubscriptionPlan.findOne,
  subscriptionPlanCreate: SubscriptionPlan.create,
  subscriptionSeatFind: SubscriptionSeat.find,
  subscriptionSeatFindOne: SubscriptionSeat.findOne,
  subscriptionSeatCreate: SubscriptionSeat.create,
  subscriptionSeatCountDocuments: SubscriptionSeat.countDocuments,
  subscriptionSeatDeleteOne: SubscriptionSeat.deleteOne,
  paymentAttemptFindById: SubscriptionPaymentAttempt.findById,
  paymentAttemptFindOne: SubscriptionPaymentAttempt.findOne,
  paymentAttemptCountDocuments: SubscriptionPaymentAttempt.countDocuments,
  platformAuditCreate: PlatformAuditLog.create,
  paymentRecordCreate: PaymentRecord.create,
  paymentRecordFindOneAndUpdate: PaymentRecord.findOneAndUpdate,
};

afterEach(() => {
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    writable: true,
    value: originalMethods.mongooseReadyState,
  });
  mongoose.startSession = originalMethods.mongooseStartSession;
  Salon.findById = originalMethods.salonFindById;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
  Subscription.findOne = originalMethods.subscriptionFindOne;
  Subscription.findOneAndUpdate = originalMethods.subscriptionFindOneAndUpdate;
  Subscription.findById = originalMethods.subscriptionFindById;
  Subscription.create = originalMethods.subscriptionCreate;
  Subscription.deleteOne = originalMethods.subscriptionDeleteOne;
  SubscriptionPlan.findOne = originalMethods.subscriptionPlanFindOne;
  SubscriptionPlan.create = originalMethods.subscriptionPlanCreate;
  SubscriptionSeat.find = originalMethods.subscriptionSeatFind;
  SubscriptionSeat.findOne = originalMethods.subscriptionSeatFindOne;
  SubscriptionSeat.create = originalMethods.subscriptionSeatCreate;
  SubscriptionSeat.countDocuments = originalMethods.subscriptionSeatCountDocuments;
  SubscriptionSeat.deleteOne = originalMethods.subscriptionSeatDeleteOne;
  SubscriptionPaymentAttempt.findById = originalMethods.paymentAttemptFindById;
  SubscriptionPaymentAttempt.findOne = originalMethods.paymentAttemptFindOne;
  SubscriptionPaymentAttempt.countDocuments = originalMethods.paymentAttemptCountDocuments;
  PlatformAuditLog.create = originalMethods.platformAuditCreate;
  PaymentRecord.create = originalMethods.paymentRecordCreate;
  PaymentRecord.findOneAndUpdate = originalMethods.paymentRecordFindOneAndUpdate;
});

const oid = (suffix) => new mongoose.Types.ObjectId(`64b0000000000000000${suffix}`);
const salonId = oid("10001");
const ownerId = oid("10002");
const actor = { _id: oid("10003"), role: "platform_admin", email: "ops@example.com" };
const barberId = oid("10004");
const requestIp = "203.0.113.44";

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const query = (value) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  lean: async () => value,
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const saveable = (value) => ({
  ...value,
  async save() {
    return this;
  },
});

const installCommonReadMocks = (subscription) => {
  Salon.findById = () =>
    query({
      _id: salonId,
      ownerId,
      name: "North Studio",
      city: "Yerevan",
      address: "1 Main",
      phone: "+374000000",
      imageUrl: "",
    });
  User.findById = () =>
    query({
      _id: ownerId,
      role: "barber",
      name: "Owner",
      email: "owner@example.com",
      salons: [],
    });
  User.find = () => query([]);
  Subscription.findOne = () => query(subscription);
  SubscriptionSeat.find = () => query([]);
  SubscriptionSeat.countDocuments = async () => 0;
  SubscriptionPaymentAttempt.findOne = () => query(null);
};

test("updateSeatCount preserves authenticated actor, note, body values, and request IP", async () => {
  const subscription = saveable({
    _id: oid("20001"),
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
    seatCount: 3,
    activeSeatCount: 0,
  });
  let auditPayload;
  installCommonReadMocks(subscription);
  PlatformAuditLog.create = async (payload) => {
    auditPayload = Array.isArray(payload) ? payload[0] : payload;
    return payload;
  };

  const res = createResponse();
  await updateSeatCount(
    {
      params: { salonId: salonId.toString() },
      body: { seatCount: "7", note: "  verified seat change  " },
      user: actor,
      ip: requestIp,
    },
    res,
    assert.fail
  );

  assert.equal(subscription.seatCount, 7);
  assert.equal(auditPayload.actorId, actor._id);
  assert.equal(auditPayload.note, "verified seat change");
  assert.equal(auditPayload.requestIp, requestIp);
  assert.deepEqual(auditPayload.newValue, { seatCount: 7 });
  assert.equal(res.statusCode, 200);
});

test("activateSubscription preserves authenticated actor, body values, note, and request IP", async () => {
  const subscription = saveable({
    _id: oid("21001"),
    __v: 0,
    ownerType: "salon",
    ownerId: salonId,
    status: "cancelled",
    seatCount: 1,
    pricePerSeat: 4000,
    totalPrice: 4000,
    currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
    lastPaymentAt: null,
    trialEndsAt: null,
    cancelledAt: new Date("2026-02-02T00:00:00.000Z"),
    payerId: ownerId,
    planId: oid("21002"),
    provider: "manual",
  });
  let auditPayload;
  let persistedSubscription;
  installCommonReadMocks(subscription);
  Subscription.findOneAndUpdate = async (_filter, update) => {
    persistedSubscription = saveable({
      ...subscription,
      ...update.$set,
      __v: subscription.__v + 1,
    });
    return persistedSubscription;
  };
  SubscriptionPlan.findOne = async () => ({
    _id: oid("21003"),
    pricePerSeat: 5000,
    currency: "AMD",
  });
  PlatformAuditLog.create = async (payload) => {
    auditPayload = payload;
    return payload;
  };

  const res = createResponse();
  await activateSubscription(
    {
      params: { salonId: salonId.toString() },
      body: { seatCount: "4", months: "2", note: "  manual renewal approved  " },
      user: actor,
      ip: requestIp,
    },
    res,
    assert.fail
  );

  assert.equal(persistedSubscription.status, "active");
  assert.equal(persistedSubscription.seatCount, 4);
  assert.equal(persistedSubscription.pricePerSeat, 5000);
  assert.equal(persistedSubscription.totalPrice, 20000);
  assert.equal(persistedSubscription.provider, "manual");
  assert.equal(auditPayload.actorId, actor._id);
  assert.equal(auditPayload.note, "manual renewal approved");
  assert.equal(auditPayload.requestIp, requestIp);
  assert.deepEqual(auditPayload.oldValue, {
    status: "cancelled",
    seatCount: 1,
    currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
  });
  assert.equal(auditPayload.newValue.status, "active");
  assert.equal(auditPayload.newValue.seatCount, 4);
  assert.equal(res.statusCode, 200);
});

test("assignSeat preserves authenticated actor, barberId, note, and socket request IP", async () => {
  const subscription = saveable({
    _id: oid("30001"),
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
    seatCount: 2,
  });
  let createdSeat;
  let auditPayload;
  installCommonReadMocks(subscription);
  User.findById = () =>
    query({
      _id: barberId,
      role: "barber",
      salons: [
        {
          salon: salonId,
          status: "approved",
          relationshipType: "staff",
          worksAsSpecialist: true,
        },
      ],
    });
  User.find = () =>
    query([
      {
        _id: barberId,
        role: "barber",
        salons: [
          {
            salon: salonId,
            status: "approved",
            relationshipType: "staff",
            worksAsSpecialist: true,
          },
        ],
      },
    ]);
  SubscriptionSeat.findOne = () => query(null);
  SubscriptionSeat.create = async (payload) => {
    createdSeat = payload;
    return { _id: oid("30002"), ...payload };
  };
  PlatformAuditLog.create = async (payload) => {
    auditPayload = Array.isArray(payload) ? payload[0] : payload;
    return payload;
  };

  const res = createResponse();
  await assignSeat(
    {
      params: { salonId: salonId.toString() },
      body: { barberId: barberId.toString(), note: "assign approved staff" },
      user: actor,
      socket: { remoteAddress: requestIp },
    },
    res,
    assert.fail
  );

  assert.equal(createdSeat.assignedBy, actor._id);
  assert.equal(createdSeat.barberId, barberId.toString());
  assert.equal(auditPayload.actorId, actor._id);
  assert.equal(auditPayload.targetUserId, barberId.toString());
  assert.equal(auditPayload.note, "assign approved staff");
  assert.equal(auditPayload.requestIp, requestIp);
});

test("revokeSeat preserves authenticated actor, barberId, note, and request IP", async () => {
  const subscription = saveable({
    _id: oid("31001"),
    ownerType: "salon",
    ownerId: salonId,
    status: "active",
    seatCount: 2,
  });
  const seat = saveable({
    _id: oid("31002"),
    subscriptionId: subscription._id,
    barberId: barberId.toString(),
    status: "active",
    revokedAt: null,
  });
  let auditPayload;
  installCommonReadMocks(subscription);
  SubscriptionSeat.findOne = () => query(seat);
  PlatformAuditLog.create = async (payload) => {
    auditPayload = payload;
    return payload;
  };

  const res = createResponse();
  await revokeSeat(
    {
      params: { salonId: salonId.toString() },
      body: { barberId: barberId.toString(), note: "  duplicate assignment cleanup  " },
      user: actor,
      ip: requestIp,
    },
    res,
    assert.fail
  );

  assert.equal(seat.status, "revoked");
  assert.ok(seat.revokedAt instanceof Date);
  assert.equal(auditPayload.actorId, actor._id);
  assert.equal(auditPayload.targetUserId, barberId.toString());
  assert.equal(auditPayload.note, "duplicate assignment cleanup");
  assert.equal(auditPayload.requestIp, requestIp);
  assert.deepEqual(auditPayload.oldValue, {
    seatId: seat._id,
    barberId: barberId.toString(),
    status: "active",
  });
  assert.deepEqual(auditPayload.newValue, {
    seatId: seat._id,
    barberId: barberId.toString(),
    status: "revoked",
  });
  assert.equal(res.statusCode, 200);
});

test("cancelSubscription delegates service errors to next", async () => {
  Salon.findById = () =>
    query({
      _id: salonId,
      ownerId,
      name: "North Studio",
    });
  Subscription.findOne = () => query(null);

  let nextError;
  await cancelSubscription(
    {
      params: { salonId: salonId.toString() },
      body: { note: "cancel requested" },
      user: actor,
      ip: requestIp,
    },
    createResponse(),
    (received) => {
      nextError = received;
    }
  );

  assert.equal(nextError.message, "Salon does not have a subscription");
});

test("confirmPayment preserves authenticated actor, note, and request IP", async () => {
  const paymentAttempt = saveable({
    _id: oid("41001"),
    ownerType: "salon",
    ownerId: salonId,
    purpose: "subscription",
    status: "pending",
    provider: "manual",
    payerId: ownerId,
    amount: 5000,
    currency: "AMD",
    seatCount: 1,
    months: 1,
    paidAt: null,
    confirmedAt: null,
    subscriptionId: null,
  });
  let auditPayload;
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    writable: true,
    value: 1,
  });
  mongoose.startSession = async () => ({
    async withTransaction(work) {
      await work();
    },
    async endSession() {},
  });
  SubscriptionPaymentAttempt.findById = async () => paymentAttempt;
  let canonicalSubscription = null;
  const plan = { _id: oid("41002"), pricePerSeat: 5000, currency: "AMD" };
  Subscription.findOne = async () => canonicalSubscription;
  Subscription.create = async (payload) => {
    const values = Array.isArray(payload) ? payload[0] : payload;
    canonicalSubscription = saveable({ ...values, _id: oid("41003"), planId: plan._id });
    return Array.isArray(payload) ? [canonicalSubscription] : canonicalSubscription;
  };
  SubscriptionPlan.findOne = async () => plan;
  let paymentRecord = null;
  PaymentRecord.create = async (payload) => {
    const values = Array.isArray(payload) ? payload[0] : payload;
    paymentRecord = { ...values };
    return Array.isArray(payload) ? [paymentRecord] : paymentRecord;
  };
  PaymentRecord.findOneAndUpdate = async (_filter, update) => {
    Object.assign(paymentRecord, update.$set);
    return paymentRecord;
  };
  PlatformAuditLog.create = async (payload) => {
    auditPayload = payload[0];
    return payload;
  };

  const res = createResponse();
  await confirmPayment(
    {
      params: { paymentId: paymentAttempt._id.toString() },
      body: { note: "  bank transfer verified  " },
      user: actor,
      socket: { remoteAddress: requestIp },
    },
    res,
    assert.fail
  );

  assert.equal(paymentAttempt.status, "paid");
  assert.ok(paymentAttempt.paidAt instanceof Date);
  assert.ok(paymentAttempt.confirmedAt instanceof Date);
  assert.equal(auditPayload.actorId, actor._id);
  assert.equal(auditPayload.note, "bank transfer verified");
  assert.equal(auditPayload.requestIp, requestIp);
  assert.deepEqual(auditPayload.oldValue, {
    status: "pending",
    paidAt: null,
    confirmedAt: null,
  });
  assert.equal(auditPayload.newValue.status, "paid");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.confirmed, true);
  assert.equal(res.body.paymentAttempt.id.toString(), paymentAttempt._id.toString());
});

test("getSalonPaymentsHandler returns 404 before downstream payment reads when salon precheck fails", async () => {
  let paymentReadCount = 0;
  Salon.findById = () => query(null);
  SubscriptionPaymentAttempt.countDocuments = async () => {
    paymentReadCount += 1;
    throw new Error("payment service should not be invoked");
  };

  const res = createResponse();
  await getSalonPaymentsHandler(
    {
      params: { salonId: salonId.toString() },
      query: {},
    },
    res,
    assert.fail
  );

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Salon not found" });
  assert.equal(paymentReadCount, 0);
});
