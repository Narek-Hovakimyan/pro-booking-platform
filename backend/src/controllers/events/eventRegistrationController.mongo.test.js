import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Event from "../../models/Event.js";
import EventRegistration from "../../models/EventRegistration.js";
import Notification from "../../models/Notification.js";
import {
  approveRegistration,
  waitlistRegistration,
} from "./eventRegistrationController.js";
import { updateEvent } from "./eventController.js";

const enabled =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" &&
  Boolean(process.env.MONGO_URI);

const originalRegistrationFindOneAndUpdate = EventRegistration.findOneAndUpdate;
const originalNotificationCreate = Notification.create;

const connect = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required for real Mongo tests");
  const isolatedUri = new URL(uri);
  isolatedUri.pathname = `/aud004_events_${process.pid}`;
  await mongoose.connect(isolatedUri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Event.deleteMany({}),
    EventRegistration.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  await Promise.all([Event.createIndexes(), EventRegistration.createIndexes()]);
};

afterEach(async () => {
  EventRegistration.findOneAndUpdate = originalRegistrationFindOneAndUpdate;
  Notification.create = originalNotificationCreate;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
});

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const approveRequest = (eventId, registrationId, organizerId) => ({
  params: { id: eventId, registrationId },
  user: { _id: organizerId, role: "barber" },
});

const createFixture = async ({
  maxParticipants = 1,
  approvedRegistrationCount = 0,
  registrationStatuses = ["pending"],
} = {}) => {
  const organizerId = new mongoose.Types.ObjectId();
  const event = await Event.create({
    title: "Capacity Race",
    instructor: "Organizer",
    date: "2099-08-01",
    time: "12:00",
    duration: 60,
    price: 0,
    maxParticipants,
    approvedRegistrationCount,
    location: "Yerevan",
    organizerId,
    status: "upcoming",
  });
  const registrations = await EventRegistration.create(
    registrationStatuses.map((status) => ({
      eventId: event._id,
      userId: new mongoose.Types.ObjectId(),
      status,
    }))
  );
  return { event, registrations, organizerId };
};

test("real Mongo approval race admits exactly one final participant", { skip: !enabled }, async () => {
  await connect();
  const { event, registrations, organizerId } = await createFixture({
    maxParticipants: 1,
    registrationStatuses: ["pending", "pending"],
  });

  const results = await Promise.all(
    registrations.map(async (registration) => {
      const res = response();
      await approveRegistration(
        approveRequest(event._id, registration._id, organizerId),
        res
      );
      return res;
    })
  );

  assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 400]);
  const storedEvent = await Event.findById(event._id).lean();
  const approved = await EventRegistration.countDocuments({
    eventId: event._id,
    status: "approved",
  });
  assert.equal(storedEvent.approvedRegistrationCount, 1);
  assert.equal(approved, 1);
  assert.equal(
    await EventRegistration.countDocuments({ eventId: event._id, status: "pending" }),
    1
  );
});

test("real Mongo approved-to-waitlisted releases capacity only once", { skip: !enabled }, async () => {
  await connect();
  const { event, registrations, organizerId } = await createFixture({
    maxParticipants: 1,
    approvedRegistrationCount: 1,
    registrationStatuses: ["approved"],
  });
  const first = response();
  await waitlistRegistration(
    {
      params: { id: event._id, registrationId: registrations[0]._id },
      user: { _id: organizerId, role: "barber" },
    },
    first
  );
  const replay = response();
  await waitlistRegistration(
    {
      params: { id: event._id, registrationId: registrations[0]._id },
      user: { _id: organizerId, role: "barber" },
    },
    replay
  );
  const storedEvent = await Event.findById(event._id).lean();
  const storedRegistration = await EventRegistration.findById(registrations[0]._id).lean();
  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 200);
  assert.equal(storedEvent.approvedRegistrationCount, 0);
  assert.equal(storedRegistration.status, "waitlisted");
});

test("real Mongo capacity mutations fail closed for legacy counters and preserve unlimited events", { skip: !enabled }, async () => {
  await connect();
  const legacy = await createFixture({ maxParticipants: 1, approvedRegistrationCount: null });
  const legacyResponse = response();
  await approveRegistration(
    approveRequest(legacy.event._id, legacy.registrations[0]._id, legacy.organizerId),
    legacyResponse
  );
  assert.equal(legacyResponse.statusCode, 503);
  assert.equal((await EventRegistration.findById(legacy.registrations[0]._id)).status, "pending");

  const unlimited = await createFixture({ maxParticipants: 0, approvedRegistrationCount: null });
  const unlimitedResponse = response();
  await approveRegistration(
    approveRequest(unlimited.event._id, unlimited.registrations[0]._id, unlimited.organizerId),
    unlimitedResponse
  );
  assert.equal(unlimitedResponse.statusCode, 200);
  assert.equal((await EventRegistration.findById(unlimited.registrations[0]._id)).status, "approved");
  assert.equal((await Event.findById(unlimited.event._id)).approvedRegistrationCount, null);
});

test("real Mongo finite max reduction is guarded by the authoritative count", { skip: !enabled }, async () => {
  await connect();
  const { event, organizerId } = await createFixture({
    maxParticipants: 3,
    approvedRegistrationCount: 2,
    registrationStatuses: ["approved", "approved"],
  });
  const res = response();
  await updateEvent(
    {
      params: { id: event._id },
      user: { _id: organizerId, role: "barber" },
      body: { maxParticipants: 1 },
    },
    res
  );
  assert.equal(res.statusCode, 400);
  assert.equal((await Event.findById(event._id)).maxParticipants, 3);
});

test("real Mongo approval rolls back the claimed counter when registration mutation fails", { skip: !enabled }, async () => {
  await connect();
  const { event, registrations, organizerId } = await createFixture();
  EventRegistration.findOneAndUpdate = async () => {
    throw new Error("forced registration mutation failure");
  };
  const res = response();
  await approveRegistration(
    approveRequest(event._id, registrations[0]._id, organizerId),
    res
  );
  assert.equal(res.statusCode, 500);
  assert.equal((await Event.findById(event._id)).approvedRegistrationCount, 0);
  assert.equal((await EventRegistration.findById(registrations[0]._id)).status, "pending");
});
