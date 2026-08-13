import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import Subscription from "../src/models/Subscription.js";
import SubscriptionSeat from "../src/models/SubscriptionSeat.js";
import User from "../src/models/User.js";
import Salon from "../src/models/Salon.js";
import {
  buildActiveSeatBackfillPlan,
  runActiveSeatCountBackfill,
} from "./backfill-subscription-active-seat-count.js";

const id = () => new mongoose.Types.ObjectId();

const originals = {
  subscriptionFind: Subscription.find,
  subscriptionBulkWrite: Subscription.bulkWrite,
  seatFind: SubscriptionSeat.find,
  userFind: User.find,
  salonFind: Salon.find,
  startSession: mongoose.startSession,
};

const stubPlanReads = ({ subscriptions, seats, users, salons }) => {
  Subscription.find = () => ({ lean: async () => subscriptions });
  SubscriptionSeat.find = () => ({ lean: async () => seats });
  User.find = () => ({ select: () => ({ lean: async () => users }) });
  Salon.find = () => ({ select: () => ({ lean: async () => salons }) });
};

test.afterEach(() => {
  Subscription.find = originals.subscriptionFind;
  Subscription.bulkWrite = originals.subscriptionBulkWrite;
  SubscriptionSeat.find = originals.seatFind;
  User.find = originals.userFind;
  Salon.find = originals.salonFind;
  mongoose.startSession = originals.startSession;
});

test("active-seat backfill is deterministic and counts only valid active seats", () => {
  const salonId = id();
  const subscriptionId = id();
  const barberId = id();
  const input = {
    subscriptions: [{ _id: subscriptionId, ownerType: "salon", ownerId: salonId, seatCount: 2 }],
    salons: [{ _id: salonId }],
    users: [{ _id: barberId, role: "barber" }],
    seats: [
      { _id: id(), subscriptionId, salonId, barberId, assignedBy: barberId, status: "active" },
      { _id: id(), subscriptionId, salonId, barberId, assignedBy: barberId, status: "revoked" },
    ],
  };
  const first = buildActiveSeatBackfillPlan(input);
  const second = buildActiveSeatBackfillPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.anomalies.length, 0);
  assert.equal(first.updates[0].activeSeatCount, 1);
});

test("active-seat backfill rejects duplicate, orphan, and over-capacity records", () => {
  const salonId = id();
  const subscriptionId = id();
  const barberId = id();
  const result = buildActiveSeatBackfillPlan({
    subscriptions: [{ _id: subscriptionId, ownerType: "salon", ownerId: salonId, seatCount: 1 }],
    salons: [{ _id: salonId }],
    users: [{ _id: barberId, role: "barber" }],
    seats: [
      { _id: id(), subscriptionId, salonId, barberId, assignedBy: barberId, status: "active" },
      { _id: id(), subscriptionId, salonId, barberId, assignedBy: barberId, status: "active" },
      { _id: id(), subscriptionId: id(), salonId, barberId, assignedBy: barberId, status: "active" },
      { _id: id(), subscriptionId: id(), barberId, assignedBy: barberId, status: "revoked" },
    ],
  });
  assert.ok(result.anomalies.some((entry) => entry.reason === "duplicate active seat"));
  assert.ok(result.anomalies.some((entry) => entry.reason === "invalid seat reference or status"));
});

test("backfill dry run is non-mutating and write is idempotent", async () => {
  const salonId = id();
  const subscriptionId = id();
  const barberId = id();
  const subscriptions = [{ _id: subscriptionId, ownerType: "salon", ownerId: salonId, seatCount: 1, activeSeatCount: 0 }];
  stubPlanReads({
    subscriptions,
    salons: [{ _id: salonId }],
    seats: [{ _id: id(), subscriptionId, salonId, barberId, assignedBy: barberId, status: "active" }],
    users: [{ _id: barberId, role: "barber" }],
  });
  let writes = 0;
  const transactions = [];
  mongoose.startSession = async () => ({
    withTransaction: async (operation) => {
      transactions.push(true);
      await operation();
    },
    endSession: async () => {},
  });
  Subscription.bulkWrite = async (operations, options) => {
    writes += 1;
    assert.equal(options.session !== undefined, true);
    subscriptions[0].activeSeatCount = 1;
    return { modifiedCount: writes === 1 ? 1 : 0 };
  };

  assert.equal((await runActiveSeatCountBackfill()).modifiedCount, 0);
  assert.equal(writes, 0);
  await assert.rejects(
    () => runActiveSeatCountBackfill({ write: true }),
    { code: "ACTIVE_SEAT_BACKFILL_MAINTENANCE_REQUIRED" }
  );
  assert.equal((await runActiveSeatCountBackfill({ write: true, maintenanceQuiesced: true })).modifiedCount, 1);
  assert.equal((await runActiveSeatCountBackfill({ write: true, maintenanceQuiesced: true })).modifiedCount, 0);
  assert.equal(transactions.length, 2);
});

test("backfill fails before write when preflight finds anomalies", async () => {
  stubPlanReads({ subscriptions: [], salons: [], seats: [{ _id: id(), subscriptionId: id(), barberId: id(), assignedBy: id(), status: "revoked" }], users: [] });
  Subscription.bulkWrite = async () => assert.fail("must not write anomalous data");
  mongoose.startSession = async () => ({
    withTransaction: async (operation) => operation(),
    endSession: async () => {},
  });
  await assert.rejects(
    () => runActiveSeatCountBackfill({ write: true, maintenanceQuiesced: true }),
    { code: "ACTIVE_SEAT_BACKFILL_ANOMALIES" }
  );
});

test("backfill rejects salon subscriptions and revoked seats with missing Salon references before writes", async () => {
  const missingSalonId = id();
  const subscriptionId = id();
  const barberId = id();
  const plan = buildActiveSeatBackfillPlan({
    subscriptions: [{ _id: subscriptionId, ownerType: "salon", ownerId: missingSalonId, seatCount: 1 }],
    salons: [],
    users: [{ _id: barberId, role: "barber" }],
    seats: [{ _id: id(), subscriptionId, salonId: missingSalonId, barberId, assignedBy: barberId, status: "revoked" }],
  });
  assert.ok(plan.anomalies.some((entry) => entry.reason === "missing salon owner"));
  assert.ok(plan.anomalies.some((entry) => entry.reason === "invalid seat reference or status"));

  stubPlanReads({
    subscriptions: [{ _id: subscriptionId, ownerType: "salon", ownerId: missingSalonId, seatCount: 1 }],
    salons: [],
    users: [{ _id: barberId, role: "barber" }],
    seats: [{ _id: id(), subscriptionId, salonId: missingSalonId, barberId, assignedBy: barberId, status: "revoked" }],
  });
  mongoose.startSession = async () => ({
    withTransaction: async (operation) => operation(),
    endSession: async () => {},
  });
  Subscription.bulkWrite = async () => assert.fail("missing Salon must abort before writes");
  await assert.rejects(
    () => runActiveSeatCountBackfill({ write: true, maintenanceQuiesced: true }),
    { code: "ACTIVE_SEAT_BACKFILL_ANOMALIES" }
  );
});
