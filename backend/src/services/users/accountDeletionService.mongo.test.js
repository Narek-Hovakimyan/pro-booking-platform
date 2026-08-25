import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import AccountDeletionRecord from "../../models/AccountDeletionRecord.js";
import Booking from "../../models/Booking.js";
import PaymentEvent from "../../models/PaymentEvent.js";
import Salon from "../../models/Salon.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import { AccountDeletionError, accountDeletionModels, deleteAccountAtomically } from "./accountDeletionService.js";
import { extendManualSubscription } from "../subscription/subscriptionManualMutations.js";
import { beginAccountDeletionFence } from "./accountDeletionFenceService.js";
import { createSalon } from "../../controllers/salons/salonController.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
let serial = 0;
const key = () => `${process.pid}${++serial}`;
const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/account_deletion_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
};
const makeUser = async (role = "client") => {
  const id = key();
  return User.create({ name: `${role} ${id}`, phone: `9${String(id).slice(-7).padStart(7, "0")}`, email: `${id}@delete.test`, password: "password123", role, recentAuthAt: new Date(), recentAuthVersion: 0 });
};
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const unknownSession = { async withTransaction() { throw Object.assign(new Error("unknown"), { errorLabels: ["UnknownTransactionCommitResult"] }); }, async endSession() {} };
afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

test("real Mongo rejects deletion without an authoritative recent-auth marker", { skip: !enabled }, async () => {
  await connect();
  const user = await User.create({ name: "Delete test", phone: "90000000", email: "delete@example.test", password: "password123" });
  await assert.rejects(deleteAccountAtomically({ userId: user._id }), (error) => error instanceof AccountDeletionError && error.statusCode === 403);
  assert.ok(await User.exists({ _id: user._id }));
});

test("real Mongo deletes a client while retaining immutable payment event payload", { skip: !enabled }, async () => {
  await connect();
  const client = await makeUser();
  const event = await PaymentEvent.create({ provider: "test", providerEventId: `event-${key()}`, rawPayload: { immutable: true } });
  await deleteAccountAtomically({ userId: client._id });
  assert.equal(await User.exists({ _id: client._id }), null);
  assert.deepEqual((await PaymentEvent.findById(event._id).select("+rawPayload")).rawPayload, { immutable: true });
  assert.equal((await AccountDeletionRecord.findOne({ userId: client._id })).state, "deleted");
});

test("real Mongo deletes a barber, scrubs history, and retry is idempotent", { skip: !enabled }, async () => {
  await connect();
  const barber = await makeUser("barber");
  const client = await makeUser();
  const booking = await Booking.create({ barberId: barber._id, clientId: client._id, serviceId: new mongoose.Types.ObjectId(), dayKey: "2026-01-01", time: "09:00", duration: 30, price: 1, status: "completed", note: "private" });
  await deleteAccountAtomically({ userId: barber._id });
  assert.equal(await User.exists({ _id: barber._id }), null);
  assert.equal((await Booking.findById(booking._id)).note, "");
  assert.equal((await deleteAccountAtomically({ userId: barber._id })).deleted, true);
});

test("real Mongo revokes only the deleting barber's active seat", { skip: !enabled }, async () => {
  await connect();
  const deletingBarber = await makeUser("barber");
  const assignedBarber = await makeUser("barber");
  const subscriptionId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const ownSeat = await SubscriptionSeat.create({
    subscriptionId, salonId, barberId: deletingBarber._id, assignedBy: assignedBarber._id,
  });
  const assignedSeat = await SubscriptionSeat.create({
    subscriptionId: new mongoose.Types.ObjectId(), salonId, barberId: assignedBarber._id, assignedBy: deletingBarber._id,
  });

  await deleteAccountAtomically({ userId: deletingBarber._id });

  assert.equal((await SubscriptionSeat.findById(ownSeat._id)).status, "revoked");
  assert.equal((await SubscriptionSeat.findById(assignedSeat._id)).status, "active");
  assert.equal(await SubscriptionSeat.countDocuments({ barberId: assignedBarber._id, status: "active" }), 1);
});

test("real Mongo blocks pending and requires_action payment attempts without deleting", { skip: !enabled }, async () => {
  for (const status of ["pending", "requires_action"]) {
    await connect();
    const payer = await makeUser("barber");
    await SubscriptionPaymentAttempt.create({ ownerType: "barber", ownerId: payer._id, payerId: payer._id, amount: 1, status });
    await assert.rejects(deleteAccountAtomically({ userId: payer._id }), (error) => error instanceof AccountDeletionError && error.statusCode === 409);
    assert.ok(await User.exists({ _id: payer._id }));
  }
});

test("real Mongo deletion loses when an active booking or salon ownership committed first", { skip: !enabled }, async () => {
  await connect();
  const client = await makeUser();
  const barber = await makeUser("barber");
  await Booking.create({ barberId: barber._id, clientId: client._id, serviceId: new mongoose.Types.ObjectId(), dayKey: "2026-01-01", time: "09:00", duration: 30, price: 1, status: "pending" });
  await assert.rejects(deleteAccountAtomically({ userId: client._id }), (error) => error instanceof AccountDeletionError && error.statusCode === 409);
  await connect();
  const owner = await makeUser("barber");
  await Salon.create({ name: "Owned", ownerId: owner._id });
  await assert.rejects(deleteAccountAtomically({ userId: owner._id }), (error) => error instanceof AccountDeletionError && error.statusCode === 409);
});

test("real Mongo concurrent deletion leaves one committed tombstone", { skip: !enabled }, async () => {
  await connect();
  const client = await makeUser();
  const results = await Promise.allSettled([deleteAccountAtomically({ userId: client._id }), deleteAccountAtomically({ userId: client._id })]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  assert.equal(await User.exists({ _id: client._id }), null);
  assert.equal((await AccountDeletionRecord.findOne({ userId: client._id })).state, "deleted");
});

test("real Mongo injected mid-deletion failure rolls every privacy and authority mutation back", { skip: !enabled }, async () => {
  await connect();
  const client = await makeUser();
  const barber = await makeUser("barber");
  const booking = await Booking.create({ barberId: barber._id, clientId: client._id, serviceId: new mongoose.Types.ObjectId(), dayKey: "2026-01-01", time: "09:00", duration: 30, price: 1, status: "completed", clientName: "Private", note: "private" });
  const seat = await SubscriptionSeat.create({
    subscriptionId: new mongoose.Types.ObjectId(),
    salonId: new mongoose.Types.ObjectId(),
    barberId: client._id,
    assignedBy: barber._id,
  });
  const models = { ...accountDeletionModels, Notification: { deleteMany: async () => { throw new Error("injected"); } } };
  await assert.rejects(deleteAccountAtomically({ userId: client._id, models }), /injected/);
  assert.ok(await User.exists({ _id: client._id }));
  assert.equal((await Booking.findById(booking._id)).clientName, "Private");
  assert.equal((await Booking.findById(booking._id)).note, "private");
  assert.equal((await SubscriptionSeat.findById(seat._id)).status, "active");
  assert.equal((await AccountDeletionRecord.findOne({ userId: client._id })).state, "active");
});

test("real Mongo unknown commit requires the exact final tombstone", { skip: !enabled }, async () => {
  await connect();
  const userId = new mongoose.Types.ObjectId();
  const models = { ...accountDeletionModels, User: { findById: () => ({ lean: async () => null }) } };
  await AccountDeletionRecord.create({ userId, state: "deleted", deletionId: "exact" });
  const options = { userId, models, startSession: async () => unknownSession, beginFence: async () => ({ deletionId: "exact" }) };
  assert.equal((await deleteAccountAtomically(options)).deleted, true);
  for (const [state, deletionId] of [["deleting", "exact"], ["deleted", "other"]]) {
    await AccountDeletionRecord.updateOne({ userId }, { $set: { state, deletionId } });
    await assert.rejects(deleteAccountAtomically(options), (error) => error instanceof AccountDeletionError && error.statusCode === 503);
  }
  await AccountDeletionRecord.deleteMany({});
  await assert.rejects(deleteAccountAtomically(options), (error) => error instanceof AccountDeletionError && error.statusCode === 503);
});

test("real production subscription mutation loses to deletion and committed subscription blocks deletion", { skip: !enabled }, async () => {
  await connect();
  const barber = await makeUser("barber");
  const fence = await beginAccountDeletionFence({ userId: barber._id });
  await assert.rejects(extendManualSubscription({ ownerType: "barber", ownerId: barber._id, payerId: barber._id }), (error) => error?.statusCode === 409);
  assert.equal(await SubscriptionPaymentAttempt.countDocuments({ payerId: barber._id }), 0);
  await AccountDeletionRecord.updateOne({ _id: fence.record._id }, { $set: { state: "active", deletionId: "" } });
  await extendManualSubscription({ ownerType: "barber", ownerId: barber._id, payerId: barber._id });
  await assert.rejects(deleteAccountAtomically({ userId: barber._id }), (error) => error instanceof AccountDeletionError && error.statusCode === 409);
});

test("real production salon creation loses to deletion and committed ownership blocks deletion", { skip: !enabled }, async () => {
  await connect();
  const barber = await makeUser("barber");
  await beginAccountDeletionFence({ userId: barber._id });
  const denied = response();
  await createSalon({ user: barber, body: { name: "Denied" } }, denied);
  assert.equal(denied.statusCode, 400);
  assert.equal(await Salon.countDocuments({ ownerId: barber._id }), 0);
  await connect();
  const owner = await makeUser("barber");
  const created = response();
  await createSalon({ user: owner, body: { name: "Owned" } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(await Salon.countDocuments({ ownerId: owner._id }), 1);
  await assert.rejects(deleteAccountAtomically({ userId: owner._id }), (error) => error instanceof AccountDeletionError && error.statusCode === 409);
});
