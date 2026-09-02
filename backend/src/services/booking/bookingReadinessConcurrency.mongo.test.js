import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import { createBookingService } from "./bookingCreateService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const weeklySchedule = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, {
  working: !["sun", "sat"].includes(day), from: !["sun", "sat"].includes(day) ? "09:00" : "", to: !["sun", "sat"].includes(day) ? "18:00" : "", breakFrom: "", breakTo: "",
}]));

let database;
let serial = 0;
let commandClient;
let commandStarted;
let commandFailed;
const commands = [];
const failures = [];
const failureWaiters = new Set();
const startedCommands = new Map();

const commandSessionKey = (command) => {
  const id = command?.lsid?.id;
  return id?.buffer?.toString("hex") || id?.toString?.() || "";
};

const transactional = (command) => Boolean(
  command?.lsid && command?.txnNumber != null && command?.autocommit === false
);

const connect = async (t) => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/booking_readiness_race_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000, monitorCommands: true });
  database = mongoose.connection.db;
  const hello = await database.admin().command({ hello: 1 });
  if (!hello.setName) {
    t.skip("requires a MongoDB replica set");
    return false;
  }
  commandClient = mongoose.connection.getClient();
  commandStarted = (event) => {
    const entry = { event, at: Date.now() };
    commands.push(entry);
    startedCommands.set(event.requestId, entry);
  };
  commandFailed = (event) => {
    const entry = { event, command: startedCommands.get(event.requestId)?.event.command, at: Date.now() };
    failures.push(entry);
    for (const waiter of [...failureWaiters]) {
      if (waiter.match(entry)) {
        failureWaiters.delete(waiter);
        clearTimeout(waiter.timeout);
        waiter.resolve(entry);
      }
    }
  };
  commandClient.on("commandStarted", commandStarted);
  commandClient.on("commandFailed", commandFailed);
  await database.dropDatabase();
  await BookingSlotHold.syncIndexes();
  return true;
};

const waitForFailure = (match, timeoutMs = 10000) => new Promise((resolve, reject) => {
  const existing = failures.find(match);
  if (existing) {
    resolve(existing);
    return;
  }
  const waiter = { match, resolve, timeout: setTimeout(() => {
    failureWaiters.delete(waiter);
    reject(new Error("timed out waiting for the real transaction write conflict"));
  }, timeoutMs) };
  failureWaiters.add(waiter);
});

const user = async (role, specialistOnboarding = undefined) => {
  const suffix = `${process.pid}${++serial}`;
  return User.create({
    name: `${role} ${suffix}`,
    phone: `8${String(suffix).slice(-7).padStart(7, "0")}`,
    email: `${suffix}@booking-readiness.test`,
    password: "password123",
    role,
    specialistOnboarding,
    recentAuthAt: new Date(),
    recentAuthVersion: 0,
  });
};

const plan = async () => SubscriptionPlan.create({
  name: `Plan ${serial}`,
  code: `booking-readiness-${process.pid}-${serial}`,
  pricePerSeat: 1,
  currency: "AMD",
  interval: "month",
});

const createSubscription = ({ ownerType, ownerId, payerId, planId, ownerRefModel }) => Subscription.create({
  ownerType,
  ownerId,
  ownerRefModel,
  payerId,
  planId,
  status: "active",
  pricePerSeat: 1,
  totalPrice: 1,
  currentPeriodStart: new Date(),
  currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
});

const setupDirect = async () => {
  const barber = await user("barber", {
    version: 1, status: "completed", currentStep: null, workplace: "independent", completedAt: new Date(),
  });
  const client = await user("client");
  const profile = await BarberProfile.create({ barberId: barber._id, address: "1 Main St" });
  const schedule = await Schedule.create({ barberId: barber._id, weeklySchedule });
  const service = await Service.create({ barberId: barber._id, name: "Cut", price: 100, duration: 30 });
  const subscription = await createSubscription({
    ownerType: "barber", ownerId: barber._id, payerId: barber._id, planId: (await plan())._id, ownerRefModel: "User",
  });
  return { barber, client, profile, schedule, service, subscription };
};

const setupSalonSeat = async () => {
  const barber = await user("barber", {
    version: 1, status: "completed", currentStep: null, workplace: "salon", completedAt: new Date(),
  });
  const client = await user("client");
  const salon = await Salon.create({ name: "Race Salon", ownerId: barber._id });
  await User.updateOne({ _id: barber._id }, {
    $set: { salons: [{ salon: salon._id, status: "approved", relationshipType: "staff", relationshipStatus: "accepted", worksAsSpecialist: true }] },
  });
  await Schedule.create({ barberId: barber._id, salonId: salon._id, weeklySchedule });
  const service = await Service.create({ barberId: barber._id, name: "Cut", price: 100, duration: 30 });
  const parentSubscription = await createSubscription({
    ownerType: "salon", ownerId: salon._id, payerId: barber._id, planId: (await plan())._id, ownerRefModel: "Salon",
  });
  const seat = await SubscriptionSeat.create({
    subscriptionId: parentSubscription._id,
    salonId: salon._id,
    barberId: barber._id,
    assignedBy: barber._id,
    status: "active",
  });
  return { barber, client, salon, service, parentSubscription, seat };
};

const createBooking = ({ barber, client, service, salon = null }) => createBookingService({
  body: {
    barberId: barber._id,
    clientId: client._id,
    serviceId: service._id,
    salonId: salon?._id,
    bookingDate: "2026-12-07",
    dayKey: "mon",
    time: "10:00",
  },
  user: client,
  referenceImages: [],
  cleanupReferenceImagesOnError: () => {},
});

const beginConflictingMutation = async ({ collection, filter, update, writes = [] }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const mutations = writes.length ? writes : [{ collection, filter, update }];
    for (const mutation of mutations) {
      const result = await (mutation.model || mutation.collection).updateOne(mutation.filter, mutation.update, { session });
      assert.equal(result.matchedCount, 1, "the competing transaction must lock its readiness dependency");
    }
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    await session.endSession();
    throw error;
  }
  let committed = false;
  return {
    async commit() {
      await session.commitTransaction();
      committed = true;
      return Date.now();
    },
    async cleanup() {
      if (!committed) await session.abortTransaction().catch(() => {});
      await session.endSession();
    },
  };
};

const readsAfter = ({ collection, after }) => commands.filter(({ event, at }) =>
  at >= after && event.commandName === "find" && event.command.find === collection && transactional(event.command)
);

const assertRealRetry = ({ failure, conflictingCollection, requiredReadCollections, committedAt }) => {
  assert.equal(failure.event.commandName, "update");
  assert.equal(failure.command?.update, conflictingCollection);
  assert.ok(transactional(failure.command), "the conflicting update must be in the booking transaction");
  assert.equal(failure.event.failure?.code, 112, "MongoDB must return a genuine WriteConflict");
  assert.ok(
    failure.event.failure?.hasErrorLabel?.("TransientTransactionError") ||
      failure.event.failure?.errorLabels?.includes?.("TransientTransactionError"),
    "the driver must receive TransientTransactionError"
  );
  const transactionStarts = commands.filter(({ event }) => transactional(event.command) && event.command.startTransaction === true);
  assert.ok(transactionStarts.length >= 2, "withTransaction must re-run the callback body");
  const retryStart = transactionStarts.find(({ at }) => at >= committedAt);
  assert.ok(retryStart, "the competing mutation must commit before retry readiness");
  for (const collection of requiredReadCollections) {
    const reads = readsAfter({ collection, after: retryStart.at });
    assert.ok(reads.length >= 1, `${collection} must be re-read in the retry transaction`);
    assert.equal(commandSessionKey(reads[0].event.command), commandSessionKey(retryStart.event.command));
  }
};

const runReadinessRace = async ({ fixture, salon = null, collection, filter, update, writes, assertOriginal, requiredReadCollections }) => {
  const blocker = await beginConflictingMutation({ collection, filter, update, writes });
  const failedWrite = waitForFailure(({ event, command }) =>
    event.commandName === "update" && command?.update === collection.collectionName &&
      transactional(command) && event.failure?.code === 112
  );
  try {
    const bookingPromise = createBooking({ ...fixture, salon });
    const failure = await failedWrite;
    await assertOriginal();
    const committedAt = await blocker.commit();
    const result = await bookingPromise;
    assertRealRetry({ failure, conflictingCollection: collection.collectionName, requiredReadCollections, committedAt });
    return result;
  } finally {
    await blocker.cleanup();
  }
};

afterEach(async () => {
  try {
    if (commandClient) {
      commandClient.removeListener("commandStarted", commandStarted);
      commandClient.removeListener("commandFailed", commandFailed);
    }
    if (mongoose.connection.readyState && database) await database.dropDatabase();
  } finally {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    database = undefined;
    commandClient = undefined;
    commandStarted = undefined;
    commandFailed = undefined;
    commands.length = 0;
    failures.length = 0;
    startedCommands.clear();
    for (const waiter of failureWaiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("MongoDB test cleaned up before the conflict was observed"));
    }
    failureWaiters.clear();
  }
});

test("real valid deposit booking commits without a false readiness rejection", { skip: !enabled }, async (t) => {
  if (!(await connect(t))) return;
  const fixture = await setupDirect();
  await BarberProfile.updateOne({ _id: fixture.profile._id }, {
    $set: {
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 40,
        minimumBookingPrice: null,
        noShowPolicyText: "Baseline policy",
      },
    },
  });
  const result = await createBooking(fixture);
  assert.equal(result.status, 201);
  const booking = await Booking.findOne({ barberId: fixture.barber._id }).lean();
  assert.equal(booking.depositRequired, true);
  assert.equal(booking.depositAmount, 40);
  assert.equal(booking.depositPolicyText, "Baseline policy");
});

test("real profile readiness touch retries and rejects an address removed during booking", { skip: !enabled }, async (t) => {
  if (!(await connect(t))) return;
  const fixture = await setupDirect();
  const result = await runReadinessRace({
    fixture,
    collection: BarberProfile.collection,
    filter: { _id: fixture.profile._id },
    update: { $set: { address: "" } },
    assertOriginal: async () => assert.equal((await BarberProfile.findById(fixture.profile._id).lean()).address, "1 Main St"),
    requiredReadCollections: [BarberProfile.collection.name],
  });
  assert.equal(result.status, 403);
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 0);
  assert.equal((await BarberProfile.findById(fixture.profile._id)).address, "");
});

test("real deposit-profile read retries and commits the current deposit policy", { skip: !enabled }, async (t) => {
  if (!(await connect(t))) return;
  const fixture = await setupDirect();
  const result = await runReadinessRace({
    fixture,
    collection: Service.collection,
    filter: { _id: fixture.service._id },
    update: { $currentDate: { updatedAt: true } },
    writes: [
      { collection: Service.collection, filter: { _id: fixture.service._id }, update: { $currentDate: { updatedAt: true } } },
      { model: BarberProfile, filter: { _id: fixture.profile._id }, update: { $set: { depositSettings: { enabled: true, mode: "fixed", value: 40, minimumBookingPrice: null, noShowPolicyText: "Updated during retry" } } } },
    ],
    assertOriginal: async () => assert.equal((await BarberProfile.findById(fixture.profile._id).lean()).depositSettings.enabled, false),
    requiredReadCollections: [BarberProfile.collection.name, Service.collection.name],
  });
  assert.equal(result.status, 201);
  const booking = await Booking.findOne({ barberId: fixture.barber._id }).lean();
  assert.equal(booking.depositRequired, true);
  assert.equal(booking.depositAmount, 40);
  assert.equal(booking.depositPolicyText, "Updated during retry");
});

test("real individual-subscription touch retries and rejects paid-access loss", { skip: !enabled }, async (t) => {
  if (!(await connect(t))) return;
  const fixture = await setupDirect();
  const result = await runReadinessRace({
    fixture,
    collection: Subscription.collection,
    filter: { _id: fixture.subscription._id },
    update: { $set: { status: "expired" } },
    assertOriginal: async () => assert.equal((await Subscription.findById(fixture.subscription._id).lean()).status, "active"),
    requiredReadCollections: [Subscription.collection.name],
  });
  assert.equal(result.status, 403);
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 0);
});

test("real seat and populated parent reads retry and reject parent invalidation", { skip: !enabled }, async (t) => {
  if (!(await connect(t))) return;
  const fixture = await setupSalonSeat();
  const result = await runReadinessRace({
    fixture,
    salon: fixture.salon,
    collection: Subscription.collection,
    filter: { _id: fixture.parentSubscription._id },
    update: { $set: { status: "expired" } },
    assertOriginal: async () => assert.equal((await Subscription.findById(fixture.parentSubscription._id).lean()).status, "active"),
    requiredReadCollections: [SubscriptionSeat.collection.name, Subscription.collection.name],
  });
  assert.equal(result.status, 403);
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 0);
});

test("real seat touch retries and rejects seat revocation", { skip: !enabled }, async (t) => {
  if (!(await connect(t))) return;
  const fixture = await setupSalonSeat();
  const result = await runReadinessRace({
    fixture,
    salon: fixture.salon,
    collection: SubscriptionSeat.collection,
    filter: { _id: fixture.seat._id },
    update: { $set: { status: "revoked" } },
    assertOriginal: async () => assert.equal((await SubscriptionSeat.findById(fixture.seat._id).lean()).status, "active"),
    requiredReadCollections: [SubscriptionSeat.collection.name, Subscription.collection.name],
  });
  assert.equal(result.status, 403);
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 0);
});
