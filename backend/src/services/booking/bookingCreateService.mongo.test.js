import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import BookingCreateIdempotencyOperation from "../../models/BookingCreateIdempotencyOperation.js";
import BookingPostCommitDispatch from "../../models/BookingPostCommitDispatch.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import Notification from "../../models/Notification.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import User from "../../models/User.js";
import { deleteService, updateService } from "../../controllers/services/serviceController.js";
import { AccountDeletionError, deleteAccountAtomically } from "../users/accountDeletionService.js";
import { beginAccountDeletionFence } from "../users/accountDeletionFenceService.js";
import { createBookingService } from "./bookingCreateService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
let serial = 0;
const weeklySchedule = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, {
  working: day !== "sun" && day !== "sat", from: day === "sun" || day === "sat" ? "" : "09:00", to: day === "sun" || day === "sat" ? "" : "18:00", breakFrom: "", breakTo: "",
}]));

const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/account_deletion_booking_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await BookingSlotHold.syncIndexes();
  await BookingCreateIdempotencyOperation.syncIndexes();
  await BookingPostCommitDispatch.syncIndexes();
};
const user = async (role) => {
  const id = `${process.pid}${++serial}`;
  return User.create({ name: `${role} ${id}`, phone: `8${String(id).slice(-7).padStart(7, "0")}`, email: `${id}@booking.test`, password: "password123", role, recentAuthAt: new Date(), recentAuthVersion: 0 });
};
const setup = async () => {
  const barber = await user("barber");
  const client = await user("client");
  await BarberProfile.create({ barberId: barber._id, address: "1 Main" });
  await Schedule.create({ barberId: barber._id, weeklySchedule });
  const service = await Service.create({ barberId: barber._id, name: "Cut", price: 100, duration: 30 });
  const plan = await SubscriptionPlan.create({ name: "Plan", code: `plan-${serial}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  await Subscription.create({ ownerType: "barber", ownerId: barber._id, ownerRefModel: "User", payerId: barber._id, planId: plan._id, status: "active", pricePerSeat: 1, totalPrice: 1, currentPeriodStart: new Date(), currentPeriodEnd: new Date("2027-01-01") });
  return { barber, client, service };
};
const createBooking = ({ barber, client, service, time = "10:00", idempotencyKey = null }) => createBookingService({
  body: { barberId: barber._id, clientId: client._id, serviceId: service._id, bookingDate: "2026-12-07", dayKey: "mon", time },
  user: client, referenceImages: [], cleanupReferenceImagesOnError: () => {}, idempotencyKey,
});
const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const createDeferred = () => {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};
const interceptBookingServiceTouch = ({ serviceId, pause }) => {
  const originalUpdateOne = Service.updateOne;
  const reached = createDeferred();
  const release = createDeferred();
  let intercepted = false;

  Service.updateOne = async function interceptUpdateOne(filter, update, options) {
    const isBookingTouch = !intercepted &&
      String(filter?._id) === String(serviceId) &&
      filter?.active === true &&
      update?.$currentDate?.updatedAt === true &&
      options?.session;
    if (!isBookingTouch) return originalUpdateOne.call(this, filter, update, options);

    intercepted = true;
    if (pause === "before") {
      reached.resolve();
      await release.promise;
      return originalUpdateOne.call(this, filter, update, options);
    }
    const result = await originalUpdateOne.call(this, filter, update, options);
    reached.resolve();
    await release.promise;
    return result;
  };

  return {
    reached: reached.promise,
    release: () => release.resolve(),
    restore: () => { Service.updateOne = originalUpdateOne; },
  };
};
afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

test("real production booking commits first and then blocks account deletion", { skip: !enabled }, async () => {
  await connect();
  const fixture = await setup();
  const result = await createBooking(fixture);
  assert.equal(result.status, 201);
  assert.equal(await BookingSlotHold.countDocuments({ bookingId: result.booking._id }), 30);
  await assert.rejects(deleteAccountAtomically({ userId: fixture.client._id }), (error) => error instanceof AccountDeletionError && error.statusCode === 409);
  assert.ok(await User.exists({ _id: fixture.client._id }));
  assert.ok(await Booking.exists({ _id: result.booking._id }));
});

test("real production booking cannot commit after the deletion fence wins", { skip: !enabled }, async () => {
  await connect();
  const fixture = await setup();
  await beginAccountDeletionFence({ userId: fixture.client._id });
  await assert.rejects(createBooking(fixture), (error) => error?.statusCode === 409);
  assert.equal(await Booking.countDocuments({ clientId: fixture.client._id }), 0);
  assert.equal(await BookingSlotHold.countDocuments({ barberId: fixture.barber._id }), 0);
  assert.equal(await Notification.countDocuments({ userId: fixture.barber._id }), 0);
});

test("real Mongo overlapping creates commit one booking and one set of holds", { skip: !enabled }, async () => {
  await connect();
  const fixture = await setup();
  const otherClient = await user("client");

  const results = await Promise.all([
    createBooking(fixture),
    createBooking({ ...fixture, client: otherClient, time: "10:15" }),
  ]);

  assert.deepEqual(results.map(({ status }) => status).sort((left, right) => left - right), [201, 400]);
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 1);
  assert.equal(await BookingSlotHold.countDocuments({ barberId: fixture.barber._id }), 30);
});

test("real Mongo same-key booking creates once and safely replays after a lost response", { skip: !enabled, timeout: 15000 }, async () => {
  await connect();
  const fixture = await setup();
  const idempotencyKey = "booking-create-real-mongo-replay-1";

  const [first, concurrentReplay] = await Promise.all([
    createBooking({ ...fixture, idempotencyKey }),
    createBooking({ ...fixture, idempotencyKey }),
  ]);
  const replay = await createBooking({ ...fixture, idempotencyKey });

  assert.equal(first.status, 201);
  assert.equal(concurrentReplay.status, 201);
  assert.equal(replay.status, 201);
  assert.equal(String(replay.booking._id), String(first.booking._id));
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 1);
  assert.equal(await BookingSlotHold.countDocuments({ bookingId: first.booking._id }), 30);
  assert.equal(await BookingCreateIdempotencyOperation.countDocuments({ actorId: fixture.client._id }), 1);
  assert.equal(await BookingPostCommitDispatch.countDocuments({ bookingId: first.booking._id }), 1);
});

test("real Mongo keyed failure rolls back the operation and a changed request conflicts safely", { skip: !enabled, timeout: 15000 }, async () => {
  await connect();
  const fixture = await setup();
  const idempotencyKey = "booking-create-real-mongo-abort-1";

  const failed = await createBooking({ ...fixture, time: "08:00", idempotencyKey });
  assert.equal(failed.status, 400);
  assert.equal(await BookingCreateIdempotencyOperation.countDocuments({ actorId: fixture.client._id }), 0);
  assert.equal(await BookingPostCommitDispatch.countDocuments({}), 0);

  const created = await createBooking({ ...fixture, idempotencyKey });
  const changed = await createBooking({ ...fixture, time: "11:00", idempotencyKey });
  assert.equal(created.status, 201);
  assert.equal(changed.status, 409);
  assert.equal(changed.body.message, "Idempotency-Key was already used with a different request");
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 1);
  assert.equal(await BookingPostCommitDispatch.countDocuments({}), 1);
});

test("real Mongo deactivation winning before the booking touch leaves no booking or holds", { skip: !enabled, timeout: 15000 }, async () => {
  await connect();
  const fixture = await setup();
  const touch = interceptBookingServiceTouch({ serviceId: fixture.service._id, pause: "before" });

  try {
    const booking = createBooking(fixture);
    await touch.reached;

    const response = createResponse();
    await updateService({
      user: fixture.barber,
      params: { id: String(fixture.service._id) },
      body: { active: false },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.active, false);

    touch.release();
    const result = await booking;
    assert.equal(result.status, 400);
    assert.equal(result.body.message, "Service is not available for this barber");
    assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 0);
    assert.equal(await BookingSlotHold.countDocuments({ barberId: fixture.barber._id }), 0);
    assert.equal(await Notification.countDocuments({ userId: fixture.barber._id }), 0);
    assert.equal((await Service.findById(fixture.service._id)).active, false);
  } finally {
    touch.release();
    touch.restore();
  }
});

test("real Mongo booking winning over a concurrent deactivation snapshots the active service", { skip: !enabled, timeout: 15000 }, async () => {
  await connect();
  const fixture = await setup();
  const touch = interceptBookingServiceTouch({ serviceId: fixture.service._id, pause: "after" });

  try {
    const booking = createBooking(fixture);
    await touch.reached;
    const response = createResponse();
    const deactivate = updateService({
      user: fixture.barber,
      params: { id: String(fixture.service._id) },
      body: { active: false },
    }, response);

    touch.release();
    const result = await booking;
    await deactivate;

    assert.equal(result.status, 201);
    assert.equal(String(result.booking.serviceId), String(fixture.service._id));
    assert.equal(result.booking.serviceName, "Cut");
    assert.equal(result.booking.price, 100);
    assert.equal(result.booking.duration, 30);
    assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 1);
    assert.equal(await BookingSlotHold.countDocuments({ bookingId: result.booking._id }), 30);
    assert.equal(response.statusCode, 200);
    assert.equal((await Service.findById(fixture.service._id)).active, false);
    const stored = await Booking.findById(result.booking._id);
    assert.equal(stored.serviceName, "Cut");
    assert.equal(stored.price, 100);
    assert.equal(stored.duration, 30);
  } finally {
    touch.release();
    touch.restore();
  }
});

test("real Mongo deletion winning before the booking touch leaves no dangling booking state", { skip: !enabled, timeout: 15000 }, async () => {
  await connect();
  const fixture = await setup();
  const touch = interceptBookingServiceTouch({ serviceId: fixture.service._id, pause: "before" });

  try {
    const booking = createBooking(fixture);
    await touch.reached;

    const response = createResponse();
    await deleteService({
      user: fixture.barber,
      params: { id: String(fixture.service._id) },
    }, response);
    assert.equal(response.statusCode, 200);

    touch.release();
    const result = await booking;
    assert.equal(result.status, 400);
    assert.equal(result.body.message, "Service is not available for this barber");
    assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 0);
    assert.equal(await BookingSlotHold.countDocuments({ barberId: fixture.barber._id }), 0);
    assert.equal(await Service.exists({ _id: fixture.service._id }), null);
  } finally {
    touch.release();
    touch.restore();
  }
});
