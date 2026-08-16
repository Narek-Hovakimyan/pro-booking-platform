import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import mongoose from "mongoose";

import {
  approveRegistration,
  registerForEvent,
} from "./eventRegistrationController.js";
import Event from "../../models/Event.js";
import EventRegistration from "../../models/EventRegistration.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";

const originalMethods = {
  eventFindById: Event.findById,
  eventFindOneAndUpdate: Event.findOneAndUpdate,
  registrationCountDocuments: EventRegistration.countDocuments,
  registrationCreate: EventRegistration.create,
  registrationFindOne: EventRegistration.findOne,
  registrationFindOneAndUpdate: EventRegistration.findOneAndUpdate,
  notificationCreate: Notification.create,
  salonFindById: Salon.findById,
  startSession: mongoose.startSession,
};

const organizerId = "64b000000000000000000001";
const attendeeId = "64b000000000000000000002";
const otherUserId = "64b000000000000000000003";
const eventId = "64b000000000000000000004";

afterEach(() => {
  Event.findById = originalMethods.eventFindById;
  Event.findOneAndUpdate = originalMethods.eventFindOneAndUpdate;
  EventRegistration.countDocuments = originalMethods.registrationCountDocuments;
  EventRegistration.create = originalMethods.registrationCreate;
  EventRegistration.findOne = originalMethods.registrationFindOne;
  EventRegistration.findOneAndUpdate = originalMethods.registrationFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Salon.findById = originalMethods.salonFindById;
  mongoose.startSession = originalMethods.startSession;
});

beforeEach(() => {
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      return callback(this);
    },
    async endSession() {},
  });
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
  status: "upcoming",
  maxParticipants: 2,
  approvedRegistrationCount: 0,
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
  Event.findById = async (id) =>
    event && String(id) === String(event._id) ? event : null;
  Event.findOneAndUpdate = async (query, update) => {
    if (!event || String(query._id) !== String(event._id)) return null;
    const max = Number(event.maxParticipants || 0);
    if (
      query.maxParticipants &&
      !(max > 0) ||
      query.approvedRegistrationCount &&
      (event.approvedRegistrationCount == null || event.approvedRegistrationCount < 0) ||
      query.$expr && !(event.approvedRegistrationCount < max)
    ) return null;
    if (update.$inc) {
      event.approvedRegistrationCount += update.$inc.approvedRegistrationCount || 0;
    }
    if (update.$set) Object.assign(event, update.$set);
    return event;
  };
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

  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      const eventCount = event?.approvedRegistrationCount;
      const registrationState = registrations.map((item) => ({
        item,
        values: { ...item },
      }));
      try {
        return await callback(this);
      } catch (error) {
        if (event) event.approvedRegistrationCount = eventCount;
        for (const state of registrationState) {
          Object.assign(state.item, state.values);
        }
        throw error;
      }
    },
    async endSession() {},
  });

  return { event, registrations, notifications };
};

test("registerForEvent returns deterministic event-status guard before registration/count queries", async () => {
  const res = createResponse();
  let findOneCalled = false;
  let countCalled = false;

  Event.findById = async () => createEvent({ status: "cancelled" });
  EventRegistration.findOne = async () => {
    findOneCalled = true;
    throw new Error("registration lookup should not run");
  };
  EventRegistration.countDocuments = async () => {
    countCalled = true;
    throw new Error("approved count should not run");
  };

  await registerForEvent(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Mina" },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Event is not open for registration" });
  assert.equal(findOneCalled, false);
  assert.equal(countCalled, false);
});

test("registerForEvent returns organizer guard before registration/count queries", async () => {
  const res = createResponse();
  let findOneCalled = false;
  let countCalled = false;

  Event.findById = async () => createEvent();
  EventRegistration.findOne = async () => {
    findOneCalled = true;
    throw new Error("registration lookup should not run");
  };
  EventRegistration.countDocuments = async () => {
    countCalled = true;
    throw new Error("approved count should not run");
  };

  await registerForEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, name: "Organizer" },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: "Organizer cannot register for their own event",
  });
  assert.equal(findOneCalled, false);
  assert.equal(countCalled, false);
});

test("registerForEvent returns duplicate guard before approved-count query", async () => {
  const res = createResponse();
  let countCalled = false;

  Event.findById = async () => createEvent();
  EventRegistration.findOne = async () => createRegistration({ status: "pending" });
  EventRegistration.countDocuments = async () => {
    countCalled = true;
    throw new Error("approved count should not run");
  };

  await registerForEvent(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Mina" },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Registration already pending" });
  assert.equal(countCalled, false);
});

test("registerForEvent preserves successful query and side-effect order", async () => {
  const res = createResponse();
  const operations = [];
  const registration = createRegistration({ _id: "registration-success" });

  Event.findById = async () => {
    operations.push("find-event");
    return createEvent();
  };
  EventRegistration.findOne = async () => {
    operations.push("find-registration");
    return null;
  };
  EventRegistration.countDocuments = async () => {
    operations.push("count-approved");
    return 0;
  };
  EventRegistration.create = async (payload) => {
    operations.push("create-registration");
    Object.assign(registration, payload);
    return registration;
  };
  Notification.create = async (payload) => {
    operations.push("notify");
    return payload;
  };

  await registerForEvent(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Mina" },
      body: { message: "Joining" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Registration request sent");
  assert.deepEqual(operations, [
    "find-event",
    "find-registration",
    "count-approved",
    "create-registration",
    "notify",
  ]);
});

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

test("approveRegistration preserves event-not-found behavior", async () => {
  const res = createResponse();

  setupApproveMocks({ event: null, registrations: [] });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: "missing-registration" },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Event not found" });
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

test("approveRegistration returns transition guard before approved-count query", async () => {
  const registration = createRegistration({ status: "rejected" });
  const res = createResponse();
  let countCalled = false;

  setupApproveMocks({ registrations: [registration] });
  EventRegistration.countDocuments = async () => {
    countCalled = true;
    throw new Error("approved count should not run");
  };

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
  assert.equal(countCalled, false);
});

test("approveRegistration preserves successful query, mutation, and notification order", async () => {
  const registration = createRegistration();
  const res = createResponse();
  const operations = [];
  const event = createEvent();

  Event.findById = async () => {
    operations.push("find-event");
    return event;
  };
  Event.findOneAndUpdate = async (query, update) => {
    operations.push("claim-capacity");
    assert.deepEqual(query.$expr, {
      $lt: ["$approvedRegistrationCount", "$maxParticipants"],
    });
    event.approvedRegistrationCount += update.$inc.approvedRegistrationCount;
    return event;
  };
  Salon.findById = async () => null;
  EventRegistration.findOne = async () => {
    operations.push("find-registration");
    return registration;
  };
  EventRegistration.countDocuments = async () => {
    operations.push("count-approved");
    return registration.status === "approved" ? 1 : 0;
  };
  EventRegistration.findOneAndUpdate = async (query, update) => {
    operations.push("approve-registration");
    assert.deepEqual(query.status, { $in: ["pending", "waitlisted"] });
    Object.assign(registration, update.$set);
    return registration;
  };
  Notification.create = async (payload) => {
    operations.push("notify");
    return payload;
  };

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Registration approved");
  assert.deepEqual(operations, [
    "find-event",
    "find-registration",
    "count-approved",
    "claim-capacity",
    "approve-registration",
    "notify",
  ]);
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

test("approveRegistration preserves organizer-or-salon-manager authorization", async () => {
  const registration = createRegistration();
  const res = createResponse();

  setupApproveMocks({
    event: createEvent({ salonId: "64b000000000000000000099" }),
    registrations: [registration],
  });
  Salon.findById = async () => ({
    _id: "64b000000000000000000099",
    ownerId: otherUserId,
    admins: [],
  });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: attendeeId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Not authorized to approve registrations" });
  assert.equal(registration.status, "pending");
});

test("approveRegistration rolls back capacity and does not notify when registration mutation fails", async () => {
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
  const event = createEvent({ maxParticipants: 1 });

  setupApproveMocks({
    event,
    registrations: [registration],
    notifications,
  });
  EventRegistration.findOneAndUpdate = async () => {
    throw new Error("forced registration mutation failure");
  };

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not approve registration");
  assert.equal(registration.status, "waitlisted");
  assert.equal(registration.rejectionReason, "old reason");
  assert.equal(registration.attendanceStatus, "no_show");
  assert.equal(registration.attended, true);
  assert.equal(notifications.length, 0);
});
