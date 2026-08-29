import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import Notification from "../../models/Notification.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import User from "../../models/User.js";
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
const createBooking = ({ barber, client, service, time = "10:00" }) => createBookingService({
  body: { barberId: barber._id, clientId: client._id, serviceId: service._id, bookingDate: "2026-12-07", dayKey: "mon", time },
  user: client, referenceImages: [], cleanupReferenceImagesOnError: () => {},
});
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

  assert.deepEqual(results.map(({ status }) => status).sort(), [400, 201]);
  assert.equal(await Booking.countDocuments({ barberId: fixture.barber._id }), 1);
  assert.equal(await BookingSlotHold.countDocuments({ barberId: fixture.barber._id }), 30);
});
