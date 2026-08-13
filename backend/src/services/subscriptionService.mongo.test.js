import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import {
  assignActiveSeat,
  revokeActiveSeat,
  updateSubscriptionSeatCount,
} from "./subscription/seatCapacityMutations.js";
import { extendManualSubscription } from "./subscription/subscriptionManualMutations.js";
import { assertSeatCountCanContainActiveSeats } from "./subscription/seatCapacityMutations.js";
import { mutateCanonicalSubscription } from "./subscription/subscriptionManualMutations.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";

const enabled =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" &&
  Boolean(process.env.MONGO_URI);
const originalSeatCreate = SubscriptionSeat.create;
const originalSubscriptionFindOneAndUpdate = Subscription.findOneAndUpdate;

const connect = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI");
  const isolatedUri = new URL(mongoUri);
  isolatedUri.pathname = `/aud010_seat_${process.pid}`;
  await mongoose.connect(isolatedUri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Subscription.deleteMany({}), SubscriptionSeat.deleteMany({}), SubscriptionPlan.deleteMany({})]);
  await Promise.all([Subscription.createIndexes(), SubscriptionSeat.createIndexes()]);
};

afterEach(async () => {
  SubscriptionSeat.create = originalSeatCreate;
  Subscription.findOneAndUpdate = originalSubscriptionFindOneAndUpdate;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
});

const createSubscription = async ({ seatCount = 1, activeSeatCount = 0 } = {}) =>
  Subscription.create({
    ownerType: "salon",
    ownerId: new mongoose.Types.ObjectId(),
    ownerRefModel: "Salon",
    payerId: new mongoose.Types.ObjectId(),
    planId: new mongoose.Types.ObjectId(),
    status: "active",
    seatCount,
    activeSeatCount,
    pricePerSeat: 5000,
    totalPrice: 5000 * seatCount,
  });

const assertCounterMatchesActiveSeats = async (subscriptionId) => {
  const [subscription, activeSeats] = await Promise.all([
    Subscription.findById(subscriptionId).lean(),
    SubscriptionSeat.countDocuments({ subscriptionId, status: "active" }),
  ]);
  assert.equal(subscription.activeSeatCount, activeSeats);
  assert.ok(subscription.activeSeatCount >= 0);
  assert.ok(subscription.activeSeatCount <= subscription.seatCount);
  return subscription;
};

test("real Mongo last-seat race creates one seat and one authoritative claim", { skip: !enabled }, async () => {
  await connect();
  const subscription = await createSubscription();
  const salonId = subscription.ownerId;
  const attempts = await Promise.allSettled([
    assignActiveSeat({ subscriptionId: subscription._id, salonId, barberId: new mongoose.Types.ObjectId(), assignedBy: subscription.payerId }),
    assignActiveSeat({ subscriptionId: subscription._id, salonId, barberId: new mongoose.Types.ObjectId(), assignedBy: subscription.payerId }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  const current = await assertCounterMatchesActiveSeats(subscription._id);
  assert.equal(current.activeSeatCount, 1);

  const seat = await SubscriptionSeat.findOne({ subscriptionId: subscription._id, status: "active" });
  await revokeActiveSeat({ seatId: seat._id, subscriptionId: subscription._id });
  const revoked = await assertCounterMatchesActiveSeats(subscription._id);
  assert.equal(revoked.activeSeatCount, 0);

  await assert.rejects(
    () => assignActiveSeat({
      subscriptionId: subscription._id,
      salonId,
      barberId: new mongoose.Types.ObjectId(),
      assignedBy: null,
    })
  );
  const afterFailure = await assertCounterMatchesActiveSeats(subscription._id);
  assert.equal(afterFailure.activeSeatCount, 0);
});

test("real Mongo same-barber replay and revoked-seat reactivation increment once", { skip: !enabled }, async () => {
  await connect();
  const subscription = await createSubscription();
  const salonId = subscription.ownerId;
  const barberId = new mongoose.Types.ObjectId();
  const requests = await Promise.allSettled([
    assignActiveSeat({ subscriptionId: subscription._id, salonId, barberId, assignedBy: subscription.payerId }),
    assignActiveSeat({ subscriptionId: subscription._id, salonId, barberId, assignedBy: subscription.payerId }),
  ]);
  assert.equal(requests.filter((request) => request.status === "fulfilled").length, 2);
  await assertCounterMatchesActiveSeats(subscription._id);

  const activeSeat = await SubscriptionSeat.findOne({ subscriptionId: subscription._id, barberId, status: "active" });
  await revokeActiveSeat({ seatId: activeSeat._id, subscriptionId: subscription._id });
  await revokeActiveSeat({ seatId: activeSeat._id, subscriptionId: subscription._id });
  assert.equal((await assertCounterMatchesActiveSeats(subscription._id)).activeSeatCount, 0);

  const reactivations = await Promise.allSettled([
    assignActiveSeat({ subscriptionId: subscription._id, salonId, barberId, assignedBy: subscription.payerId }),
    assignActiveSeat({ subscriptionId: subscription._id, salonId, barberId, assignedBy: subscription.payerId }),
  ]);
  assert.equal(reactivations.filter((request) => request.status === "fulfilled").length, 2);
  assert.equal((await assertCounterMatchesActiveSeats(subscription._id)).activeSeatCount, 1);
});

test("real Mongo assignment racing a seat-count reduction preserves the invariant", { skip: !enabled }, async () => {
  await connect();
  const subscription = await createSubscription({ seatCount: 2 });
  const race = await Promise.allSettled([
    assignActiveSeat({
      subscriptionId: subscription._id,
      salonId: subscription.ownerId,
      barberId: new mongoose.Types.ObjectId(),
      assignedBy: subscription.payerId,
    }),
    updateSubscriptionSeatCount({ subscriptionId: subscription._id, seatCount: 1 }),
  ]);
  assert.equal(race.filter((result) => result.status === "rejected").length, 0);
  const current = await assertCounterMatchesActiveSeats(subscription._id);
  assert.equal(current.seatCount, 1);
  assert.equal(current.activeSeatCount, 1);
});

test("real Mongo transaction retry rolls back a claimed seat before replaying it", { skip: !enabled }, async () => {
  await connect();
  const subscription = await createSubscription();
  let failOnce = true;
  SubscriptionSeat.create = async function transientCreate(...args) {
    if (failOnce) {
      failOnce = false;
      throw new mongoose.mongo.MongoServerError({
        message: "forced transient seat write",
        errorLabels: ["TransientTransactionError"],
      });
    }
    return originalSeatCreate.apply(this, args);
  };

  await assignActiveSeat({
    subscriptionId: subscription._id,
    salonId: subscription.ownerId,
    barberId: new mongoose.Types.ObjectId(),
    assignedBy: subscription.payerId,
  });

  assert.equal(failOnce, false);
  assert.equal((await assertCounterMatchesActiveSeats(subscription._id)).activeSeatCount, 1);
});

const waitForVersionedMutation = () => {
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  let release;
  const releasePromise = new Promise((resolve) => { release = resolve; });
  let intercepted = false;
  Subscription.findOneAndUpdate = function delayedVersionedMutation(filter, ...args) {
    if (!intercepted && Number.isInteger(filter?.__v)) {
      intercepted = true;
      entered();
      return releasePromise.then(() => originalSubscriptionFindOneAndUpdate.call(this, filter, ...args));
    }
    return originalSubscriptionFindOneAndUpdate.call(this, filter, ...args);
  };
  return { enteredPromise, release };
};

test("real Mongo manual reduction rechecks current capacity when a seat claim leaves __v unchanged", { skip: !enabled }, async () => {
  await connect();
  const subscription = await createSubscription({ seatCount: 2, activeSeatCount: 1 });
  await SubscriptionPlan.create({ name: "Barber Monthly", code: "barber_monthly", pricePerSeat: 5000, currency: "AMD", interval: "month", features: [], isActive: true });
  await SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: subscription.ownerId, barberId: new mongoose.Types.ObjectId(), assignedBy: subscription.payerId, status: "active" });
  const { enteredPromise, release } = waitForVersionedMutation();
  const reduction = extendManualSubscription({
    ownerType: "salon", ownerId: subscription.ownerId, payerId: subscription.payerId, seatCount: 1, months: 1,
  });
  await enteredPromise;
  await assignActiveSeat({ subscriptionId: subscription._id, salonId: subscription.ownerId, barberId: new mongoose.Types.ObjectId(), assignedBy: subscription.payerId });
  release();
  await assert.rejects(reduction, (error) => error.statusCode === 400);
  const current = await assertCounterMatchesActiveSeats(subscription._id);
  assert.equal(current.seatCount, 2);
  assert.equal(current.activeSeatCount, 2);
});

test("real Mongo platform-equivalent reduction retries from authoritative capacity and allows a non-conflicting increase", { skip: !enabled }, async () => {
  await connect();
  const subscription = await createSubscription({ seatCount: 2, activeSeatCount: 1 });
  await SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: subscription.ownerId, barberId: new mongoose.Types.ObjectId(), assignedBy: subscription.payerId, status: "active" });
  const { enteredPromise, release } = waitForVersionedMutation();
  const reduction = mutateCanonicalSubscription({
    ownerType: "salon",
    ownerId: subscription.ownerId,
    updatePayload: (current) => {
      assertSeatCountCanContainActiveSeats(current, 1);
      return { seatCount: 1 };
    },
    createPayload: () => assert.fail("subscription already exists"),
  });
  await enteredPromise;
  await assignActiveSeat({ subscriptionId: subscription._id, salonId: subscription.ownerId, barberId: new mongoose.Types.ObjectId(), assignedBy: subscription.payerId });
  release();
  await assert.rejects(reduction, (error) => error.statusCode === 400);
  const afterRace = await assertCounterMatchesActiveSeats(subscription._id);
  assert.equal(afterRace.seatCount, 2);
  const increased = await updateSubscriptionSeatCount({ subscriptionId: subscription._id, seatCount: 3 });
  assert.equal(increased.seatCount, 3);
  assert.equal((await assertCounterMatchesActiveSeats(subscription._id)).activeSeatCount, 2);
});
