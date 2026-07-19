import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { approveRegistration } from "./eventRegistrationController.js";
import Event from "../../models/Event.js";
import EventRegistration from "../../models/EventRegistration.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";

const originalMethods = {
  eventFindById: Event.findById,
  registrationCountDocuments: EventRegistration.countDocuments,
  registrationFindOne: EventRegistration.findOne,
  registrationFindOneAndUpdate: EventRegistration.findOneAndUpdate,
  notificationCreate: Notification.create,
  salonFindById: Salon.findById,
};

const organizerId = "64b000000000000000000001";
const attendeeId = "64b000000000000000000002";
const otherUserId = "64b000000000000000000003";
const eventId = "64b000000000000000000004";

afterEach(() => {
  Event.findById = originalMethods.eventFindById;
  EventRegistration.countDocuments = originalMethods.registrationCountDocuments;
  EventRegistration.findOne = originalMethods.registrationFindOne;
  EventRegistration.findOneAndUpdate = originalMethods.registrationFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Salon.findById = originalMethods.salonFindById;
});

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

const createEvent = (overrides = {}) => ({
  _id: eventId,
  title: "Color Workshop",
  organizerId,
  salonId: null,
  maxParticipants: 2,
  ...overrides,
});

const createRegistration = (overrides = {}) => ({
  _id: `registration-${Math.random().toString(36).slice(2, 9)}`,
  eventId,
  userId: attendeeId,
  status: "pending",
  message: "",
  rejectionReason: "",
  attendanceStatus: "pending",
  attended: false,
  checkedInAt: null,
  reminderSentAt: null,
  ...overrides,
});

const matchesQuery = (item, query = {}) =>
  Object.entries(query).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.$in) {
        return value.$in.includes(item[key]);
      }
      return false;
    }

    return String(item[key]) === String(value);
  });

const setupApproveMocks = ({
  event = createEvent(),
  registrations = [],
  notifications = [],
} = {}) => {
  Event.findById = async (id) => (String(id) === String(event._id) ? event : null);
  Salon.findById = async () => null;
  EventRegistration.findOne = async (query) =>
    registrations.find((registration) => matchesQuery(registration, query)) || null;
  EventRegistration.countDocuments = async (query) =>
    registrations.filter((registration) => matchesQuery(registration, query)).length;
  EventRegistration.findOneAndUpdate = async (query, update) => {
    const registration = registrations.find((candidate) =>
      matchesQuery(candidate, query)
    );

    if (!registration) return null;
    if (update.$set) Object.assign(registration, update.$set);
    return registration;
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  return { event, registrations, notifications };
};

test("approveRegistration allows approval when maxParticipants is 0", async () => {
  const registration = createRegistration();
  const res = createResponse();

  setupApproveMocks({
    event: createEvent({ maxParticipants: 0 }),
    registrations: [
      createRegistration({ userId: otherUserId, status: "approved" }),
      registration,
    ],
  });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.registration.status, "approved");
  assert.equal(registration.status, "approved");
});

for (const maxParticipants of [undefined, null, -1]) {
  test(`approveRegistration treats maxParticipants=${String(maxParticipants)} as unlimited`, async () => {
    const registration = createRegistration();
    const res = createResponse();

    setupApproveMocks({
      event: createEvent({ maxParticipants }),
      registrations: [
        createRegistration({ userId: otherUserId, status: "approved" }),
        registration,
      ],
    });

    await approveRegistration(
      {
        params: { id: eventId, registrationId: registration._id },
        user: { _id: organizerId, role: "barber" },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(registration.status, "approved");
  });
}

test("approveRegistration blocks approval when approvedCount reaches positive maxParticipants", async () => {
  const registration = createRegistration();
  const res = createResponse();

  setupApproveMocks({
    event: createEvent({ maxParticipants: 1 }),
    registrations: [
      createRegistration({ userId: otherUserId, status: "approved" }),
      registration,
    ],
  });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Event is full");
  assert.equal(registration.status, "pending");
});

for (const status of ["cancelled", "rejected"]) {
  test(`approveRegistration does not approve ${status} registration`, async () => {
    const registration = createRegistration({ status });
    const res = createResponse();

    setupApproveMocks({ registrations: [registration] });

    await approveRegistration(
      {
        params: { id: eventId, registrationId: registration._id },
        user: { _id: organizerId, role: "barber" },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body.message,
      "Only pending or waitlisted registrations can be approved"
    );
    assert.equal(registration.status, status);
  });
}

test("approveRegistration returns 400 for already approved registration", async () => {
  const registration = createRegistration({ status: "approved" });
  const res = createResponse();

  setupApproveMocks({ registrations: [registration] });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Registration is already approved");
});

test("approveRegistration atomic status guard returns 400 and does not notify when stale", async () => {
  const registration = createRegistration();
  const notifications = [];
  const res = createResponse();
  let capturedQuery = null;

  setupApproveMocks({ registrations: [registration], notifications });
  EventRegistration.findOneAndUpdate = async (query) => {
    capturedQuery = query;
    return null;
  };

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.deepEqual(capturedQuery.status, { $in: ["pending", "waitlisted"] });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Registration is no longer pending or waitlisted");
  assert.equal(registration.status, "pending");
  assert.equal(notifications.length, 0);
});

test("approveRegistration sends notification only after successful approval", async () => {
  const registration = createRegistration();
  const notifications = [];
  const res = createResponse();

  setupApproveMocks({ registrations: [registration], notifications });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_registration_approved");
  assert.deepEqual(notifications[0].data, {
    eventId,
    eventRegistrationId: registration._id,
  });
});

test("approveRegistration rolls back and does not notify when post-update recount exceeds capacity", async () => {
  const registration = createRegistration({
    status: "waitlisted",
    rejectionReason: "old reason",
    attendanceStatus: "no_show",
    attended: true,
    checkedInAt: new Date("2099-01-01T10:00:00.000Z"),
    reminderSentAt: new Date("2099-01-01T09:00:00.000Z"),
  });
  const notifications = [];
  const res = createResponse();
  let countCalls = 0;

  setupApproveMocks({
    event: createEvent({ maxParticipants: 1 }),
    registrations: [registration],
    notifications,
  });
  EventRegistration.countDocuments = async () => {
    countCalls += 1;
    return countCalls === 1 ? 0 : 2;
  };

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Event is full");
  assert.equal(registration.status, "waitlisted");
  assert.equal(registration.rejectionReason, "old reason");
  assert.equal(registration.attendanceStatus, "no_show");
  assert.equal(registration.attended, true);
  assert.equal(notifications.length, 0);
});
