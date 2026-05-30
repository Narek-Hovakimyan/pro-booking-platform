import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  cancelEvent,
  checkInRegistration,
  createEvent,
  getEvents,
  getMyEvents,
} from "./eventController.js";
import {
  approveRegistration,
  cancelRegistration,
  getEventRegistrations,
  getMyRegistrations,
  registerForEvent,
  rejectRegistration,
  waitlistRegistration,
} from "./eventRegistrationController.js";
import Event from "../models/Event.js";
import EventCertificate from "../models/EventCertificate.js";
import EventRegistration from "../models/EventRegistration.js";
import EventReview from "../models/EventReview.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import User from "../models/User.js";

const originalMethods = {
  eventCreate: Event.create,
  eventFind: Event.find,
  eventFindById: Event.findById,
  certificateFind: EventCertificate.find,
  certificateAggregate: EventCertificate.aggregate,
  eventReviewAggregate: EventReview.aggregate,
  eventReviewFind: EventReview.find,
  registrationAggregate: EventRegistration.aggregate,
  registrationCountDocuments: EventRegistration.countDocuments,
  registrationCreate: EventRegistration.create,
  registrationFind: EventRegistration.find,
  registrationFindOne: EventRegistration.findOne,
  notificationCreate: Notification.create,
  salonFindById: Salon.findById,
  salonFindOne: Salon.findOne,
  joinRequestFind: SalonJoinRequest.find,
  joinRequestFindOne: SalonJoinRequest.findOne,
  userFindById: User.findById,
};

const organizerId = "64b000000000000000000001";
const attendeeId = "64b000000000000000000002";
const otherUserId = "64b000000000000000000003";
const eventId = "64b000000000000000000004";
const salonAId = "64b000000000000000000005";
const salonBId = "64b000000000000000000006";

afterEach(() => {
  Event.create = originalMethods.eventCreate;
  Event.find = originalMethods.eventFind;
  Event.findById = originalMethods.eventFindById;
  EventCertificate.find = originalMethods.certificateFind;
  EventCertificate.aggregate = originalMethods.certificateAggregate;
  EventReview.aggregate = originalMethods.eventReviewAggregate;
  EventReview.find = originalMethods.eventReviewFind;
  EventRegistration.aggregate = originalMethods.registrationAggregate;
  EventRegistration.countDocuments = originalMethods.registrationCountDocuments;
  EventRegistration.create = originalMethods.registrationCreate;
  EventRegistration.find = originalMethods.registrationFind;
  EventRegistration.findOne = originalMethods.registrationFindOne;
  Notification.create = originalMethods.notificationCreate;
  Salon.findById = originalMethods.salonFindById;
  Salon.findOne = originalMethods.salonFindOne;
  SalonJoinRequest.find = originalMethods.joinRequestFind;
  SalonJoinRequest.findOne = originalMethods.joinRequestFindOne;
  User.findById = originalMethods.userFindById;
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

const withSilencedConsoleError = async (task) => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await task();
  } finally {
    console.error = originalConsoleError;
  }
};

const createQuery = (value) => ({
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

const createRegistration = (overrides = {}) => ({
  _id: `registration-${Math.random().toString(36).slice(2, 9)}`,
  eventId,
  userId: attendeeId,
  status: "pending",
  message: "",
  rejectionReason: "",
  attendanceStatus: "pending",
  createdAt: new Date("2099-01-01T10:00:00Z"),
  updatedAt: new Date("2099-01-01T10:00:00Z"),
  async save() {
    this.updatedAt = new Date();
    return this;
  },
  ...overrides,
});

const baseEvent = {
  _id: eventId,
  title: "Color Workshop",
  instructor: "Educator",
  date: "2099-07-01",
  time: "11:00",
  duration: 90,
  price: 0,
  maxParticipants: 2,
  location: "Yerevan",
  status: "upcoming",
  organizerId,
  salonId: null,
  visibility: "public",
  type: "training",
};

const matchesQuery = (item, query = {}) =>
  Object.entries(query).every(([key, value]) => {
    if (key === "$or") {
      return value.some((condition) => matchesQuery(item, condition));
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.$in) {
        return value.$in.includes(item[key]);
      }

      return false;
    }

    return String(item[key]) === String(value);
  });

const createControllerMocks = ({
  event = { ...baseEvent },
  registrations = [],
  certificates = [],
} = {}) => {
  Event.findById = (id) =>
    createQuery(String(id) === String(event._id) ? { ...event } : null);
  Event.find = () => createQuery([{ ...event }]);
  EventReview.aggregate = async () => [];
  EventRegistration.findOne = async (query) =>
    registrations.find((registration) => matchesQuery(registration, query)) || null;
  EventRegistration.create = async (payload) => {
    const registration = createRegistration(payload);
    registrations.push(registration);
    return registration;
  };
  EventRegistration.countDocuments = async (query) =>
    registrations.filter((registration) => matchesQuery(registration, query)).length;
  EventRegistration.aggregate = async () => {
    const approvedCount = registrations.filter(
      (registration) =>
        String(registration.eventId) === String(event._id) &&
        registration.status === "approved"
    ).length;

    return approvedCount > 0 ? [{ _id: event._id, count: approvedCount }] : [];
  };
  EventRegistration.find = () => createQuery([...registrations]);
  EventCertificate.find = () => createQuery(certificates);
  EventReview.find = () => ({
    lean: async () => [],
  });
  Notification.create = async (payload) => payload;
  Salon.findById = async () => null;

  return { event, registrations };
};

test("user registers for event with pending status", async () => {
  const res = createResponse();
  const notifications = [];
  const { registrations } = createControllerMocks();
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await registerForEvent(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Guest", role: "client" },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.registration.status, "pending");
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].status, "pending");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_registration_request");
  assert.deepEqual(notifications[0].data, {
    eventId,
    eventRegistrationId: registrations[0]._id,
  });
});

test("approved salon member can create event with second salonId", async () => {
  const res = createResponse();
  let createdPayload;

  Salon.findById = async (id) => ({
    _id: id,
    name: id === salonBId ? "Second Salon" : "First Salon",
    ownerId: otherUserId,
    admins: [],
  });
  User.findById = () => ({
    select: async () => ({
      _id: organizerId,
      salon: null,
      salonStatus: "none",
      salons: [
        { salon: salonAId, status: "approved" },
        { salon: salonBId, status: "approved" },
      ],
    }),
  });
  SalonJoinRequest.findOne = async () => null;
  SalonJoinRequest.find = () => ({
    distinct: async () => [],
  });
  Event.create = async (payload) => {
    createdPayload = payload;
    return { _id: "created-event", ...payload };
  };
  Event.findById = (id) =>
    createQuery({
      _id: id,
      ...createdPayload,
      salonId: { _id: salonBId, name: "Second Salon" },
      organizerId: { _id: organizerId, name: "Organizer" },
    });

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Advanced Color",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "90",
        location: "Second Salon",
        salonId: salonBId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(String(createdPayload.salonId), salonBId);
  assert.equal(res.body.salonId.name, "Second Salon");
});

test("approved salon member can create off-site event without salonId", async () => {
  const res = createResponse();
  let createdPayload;

  Salon.findOne = () => ({
    select: async () => null,
  });
  User.findById = () => ({
    select: async () => ({
      _id: organizerId,
      salon: null,
      salonStatus: "none",
      salons: [{ salon: salonAId, status: "approved" }],
    }),
  });
  SalonJoinRequest.find = () => ({
    distinct: async () => [],
  });
  Event.create = async (payload) => {
    createdPayload = payload;
    return { _id: "created-event", ...payload };
  };
  Event.findById = (id) =>
    createQuery({
      _id: id,
      ...createdPayload,
      organizerId: { _id: organizerId, name: "Organizer" },
    });

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Off-site Masterclass",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "90",
        location: "Conference Hall",
        locationType: "other",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.salonId, null);
  assert.equal(createdPayload.location, "Conference Hall");
});

test("createEvent unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Salon.findById = async () => ({
    _id: salonAId,
    ownerId: organizerId,
    admins: [],
  });
  Event.create = async () => {
    throw new Error("raw event database failure");
  };

  await withSilencedConsoleError(async () => {
    await createEvent(
      {
        user: { _id: organizerId, role: "barber" },
        body: {
          title: "Advanced Color",
          instructor: "Educator",
          date: "2099-08-01",
          time: "10:00",
          duration: "90",
          location: "Second Salon",
          salonId: salonAId,
        },
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create event");
});

test("registerForEvent unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Event.findById = async () => {
    throw new Error("raw registration db failure");
  };

  await withSilencedConsoleError(async () => {
    await registerForEvent(
      {
        user: { _id: attendeeId, name: "Attendee" },
        params: { id: eventId },
        body: {},
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not register for event");
});

test("duplicate pending registration is blocked", async () => {
  const res = createResponse();
  createControllerMocks({
    registrations: [
      createRegistration({ userId: attendeeId, status: "pending" }),
    ],
  });

  await registerForEvent(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Guest", role: "client" },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Registration already pending");
});

test("full event moves new registration to waitlisted", async () => {
  const res = createResponse();
  createControllerMocks({
    event: { ...baseEvent, maxParticipants: 1 },
    registrations: [
      createRegistration({ userId: otherUserId, status: "approved" }),
    ],
  });

  await registerForEvent(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Guest", role: "client" },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.registration.status, "waitlisted");
});

test("organizer approves registration", async () => {
  const res = createResponse();
  const notifications = [];
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });
  Notification.create = async (payload) => {
    notifications.push(payload);
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
  assert.equal(res.body.registration.status, "approved");
  assert.equal(registration.status, "approved");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_registration_approved");
  assert.deepEqual(notifications[0].data, {
    eventId,
    eventRegistrationId: registration._id,
  });
});

test("organizer rejects registration with reason", async () => {
  const res = createResponse();
  const notifications = [];
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await rejectRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
      body: { rejectionReason: "Limited seats" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.registration.status, "rejected");
  assert.equal(res.body.registration.rejectionReason, "Limited seats");
  assert.equal(registration.rejectionReason, "Limited seats");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_registration_rejected");
  assert.deepEqual(notifications[0].data, {
    eventId,
    eventRegistrationId: registration._id,
  });
});

test("non-organizer cannot approve or reject registrations", async () => {
  const approveRes = createResponse();
  const rejectRes = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: otherUserId, role: "barber" },
    },
    approveRes
  );

  await rejectRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: otherUserId, role: "barber" },
      body: { rejectionReason: "No access" },
    },
    rejectRes
  );

  assert.equal(approveRes.statusCode, 403);
  assert.equal(rejectRes.statusCode, 403);
});

test("organizer can fetch registrations", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });

  await getEventRegistrations(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "pending");
});

test("non-organizer gets 403 for registrations", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });

  await getEventRegistrations(
    {
      params: { id: eventId },
      user: { _id: otherUserId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("pending registration does not count as approved participant", async () => {
  const res = createResponse();
  createControllerMocks({
    registrations: [
      createRegistration({ userId: attendeeId, status: "pending" }),
    ],
  });

  await getEvents({ query: { status: "upcoming" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].registrationCount, 0);
});

test("waitlisted registration does not count as participant", async () => {
  const res = createResponse();
  createControllerMocks({
    registrations: [
      createRegistration({ userId: attendeeId, status: "waitlisted" }),
    ],
  });

  await getEvents({ query: { status: "upcoming" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].registrationCount, 0);
});

test("approved registration counts as participant", async () => {
  const res = createResponse();
  createControllerMocks({
    registrations: [
      createRegistration({ userId: attendeeId, status: "approved" }),
    ],
  });

  await getEvents({ query: { status: "upcoming" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].registrationCount, 1);
});

test("organizer can approve waitlisted registration when capacity allows", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "waitlisted" });
  createControllerMocks({ registrations: [registration] });

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

test("organizer can move registration to waitlist", async () => {
  const res = createResponse();
  const notifications = [];
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await waitlistRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(registration.status, "waitlisted");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_registration_waitlisted");
  assert.deepEqual(notifications[0].data, {
    eventId,
    eventRegistrationId: registration._id,
  });
});

test("organizer can mark approved participant attended", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "approved" });
  createControllerMocks({ registrations: [registration] });

  await checkInRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(registration.attended, true);
});

test("non-organizer cannot check in participant", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "approved" });
  createControllerMocks({ registrations: [registration] });

  await checkInRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: otherUserId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("non-approved registration cannot be checked in", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });

  await checkInRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("user can cancel own pending registration", async () => {
  const res = createResponse();
  const notifications = [];
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await cancelRegistration(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Guest", role: "client" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(registration.status, "cancelled");
  assert.equal(res.body.message, "Registration cancelled");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_unregistration");
  assert.deepEqual(notifications[0].data, {
    eventId,
    eventRegistrationId: registration._id,
  });
});

test("user can cancel own waitlisted registration", async () => {
  const res = createResponse();
  const registration = createRegistration({
    userId: attendeeId,
    status: "waitlisted",
  });
  createControllerMocks({ registrations: [registration] });

  await cancelRegistration(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Guest", role: "client" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(registration.status, "cancelled");
});

test("user cannot cancel own approved registration", async () => {
  const res = createResponse();
  const registration = createRegistration({
    userId: attendeeId,
    status: "approved",
  });
  createControllerMocks({ registrations: [registration] });

  await cancelRegistration(
    {
      params: { id: eventId },
      user: { _id: attendeeId, name: "Guest", role: "client" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    "Approved registration cannot be cancelled by participant"
  );
  assert.equal(registration.status, "approved");
});

test("organizer cancellation notification includes event metadata", async () => {
  const res = createResponse();
  const event = {
    ...baseEvent,
    async save() {
      return this;
    },
  };
  const notifications = [];
  const registration = createRegistration({ status: "approved" });

  Event.findById = async (id) => (String(id) === String(eventId) ? event : null);
  EventRegistration.find = () => createQuery([registration]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await cancelEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(event.status, "cancelled");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_cancelled");
  assert.deepEqual(notifications[0].data, { eventId });
});

test("my registrations include issued certificate data", async () => {
  const res = createResponse();
  const registration = createRegistration({
    _id: "64b000000000000000000099",
    eventId: { ...baseEvent, _id: eventId },
    userId: attendeeId,
    status: "approved",
    attended: true,
    certificateIssuedAt: new Date("2020-01-02T10:00:00Z"),
  });
  createControllerMocks({
    registrations: [registration],
    certificates: [
      {
        registrationId: registration._id,
        certificateId: "CERT-2026-ABC123",
        status: "issued",
        issuedAt: new Date("2020-01-02T10:00:00Z"),
        certificateType: "auto",
      },
    ],
  });

  await getMyRegistrations(
    {
      user: { _id: attendeeId, role: "client" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].certificate.certificateId, "CERT-2026-ABC123");
  assert.equal(res.body[0].certificate.status, "issued");
});

test("private events do not show publicly", async () => {
  const res = createResponse();
  createControllerMocks({
    event: { ...baseEvent, visibility: "private" },
  });

  Event.find = () => createQuery([]);

  await getEvents({ query: { status: "upcoming" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 0);
});

test("future event appears in public Events page", async () => {
  const res = createResponse();
  const futureEvent = {
    ...baseEvent,
    date: "2099-12-25",
    time: "10:00",
  };
  createControllerMocks({ event: futureEvent });

  await getEvents({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "Color Workshop");
});

test("past event does not appear in public Events page", async () => {
  const res = createResponse();
  const pastEvent = {
    ...baseEvent,
    date: "2020-01-01",
    time: "10:00",
  };
  createControllerMocks({ event: pastEvent });

  await getEvents({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 0);
});

test("organizer sees past event in getMyEvents", async () => {
  const res = createResponse();
  const pastEvent = {
    ...baseEvent,
    date: "2020-01-01",
    time: "10:00",
  };

  Event.find = () => createQuery([{ ...pastEvent }]);
  EventCertificate.aggregate = async () => [];
  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];
  EventRegistration.find = () => createQuery([]);
  EventCertificate.find = () => createQuery([]);
  EventReview.find = () => ({
    lean: async () => [],
  });
  Notification.create = async (payload) => payload;
  Salon.findById = async () => null;

  await getMyEvents(
    { user: { _id: organizerId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "Color Workshop");
  assert.equal(res.body[0].date, "2020-01-01");
});

test("past event certificates still work", async () => {
  const res = createResponse();
  const registration = createRegistration({
    eventId: { ...baseEvent, _id: eventId, date: "2020-01-01", time: "10:00" },
    userId: attendeeId,
    status: "approved",
    attended: true,
    certificateIssuedAt: new Date("2020-01-02T10:00:00Z"),
  });
  createControllerMocks({
    registrations: [registration],
    certificates: [
      {
        registrationId: registration._id,
        certificateId: "CERT-2026-PAST001",
        status: "issued",
        issuedAt: new Date("2020-01-02T10:00:00Z"),
        certificateType: "auto",
      },
    ],
  });

  await getMyRegistrations(
    { user: { _id: attendeeId, role: "client" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].certificate.certificateId, "CERT-2026-PAST001");
  assert.equal(res.body[0].certificate.status, "issued");
});

test("getEvents aggregation receives only upcoming event IDs, not past", async () => {
  const res = createResponse();
  const upcomingEvent = {
    ...baseEvent,
    _id: "64b000000000000000000010",
    date: "2099-12-25",
  };
  const pastEvent = {
    ...baseEvent,
    _id: "64b000000000000000000011",
    date: "2020-01-01",
  };

  Event.find = () => createQuery([{ ...upcomingEvent }, { ...pastEvent }]);

  let capturedEventIds = null;
  let aggregateCallCount = 0;
  EventRegistration.aggregate = async (pipeline) => {
    aggregateCallCount++;
    const matchStage = pipeline.find((s) => s.$match);
    if (matchStage) {
      capturedEventIds = matchStage.$match.eventId?.$in;
    }
    return [];
  };
  EventReview.aggregate = async () => [];
  EventReview.find = () => ({ lean: async () => [] });
  Notification.create = async (payload) => payload;
  Salon.findById = async () => null;
  EventRegistration.find = () => createQuery([]);
  EventCertificate.find = () => createQuery([]);

  await getEvents({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1, "only upcoming event returned");
  assert.equal(
    String(res.body[0]._id),
    "64b000000000000000000010",
    "upcoming event is returned"
  );
  assert.equal(aggregateCallCount, 1, "aggregation called once");
  assert.ok(capturedEventIds, "aggregation was called with eventIds");
  assert.equal(
    capturedEventIds.length,
    1,
    "only one event ID in aggregation (past excluded)"
  );
  assert.equal(
    String(capturedEventIds[0]),
    "64b000000000000000000010",
    "only upcoming event ID passed to aggregation"
  );
});

test("past event data is preserved (no deletion)", async () => {

  // Verify the same past event style data exists and hasn't been mutated
  const res = createResponse();
  const pastEvent = {
    ...baseEvent,
    date: "2020-01-01",
    time: "10:00",
  };

  Event.find = () => createQuery([{ ...pastEvent }]);
  EventCertificate.aggregate = async () => [];
  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];
  EventRegistration.find = () => createQuery([]);
  EventCertificate.find = () => createQuery([]);
  EventReview.find = () => ({
    lean: async () => [],
  });
  Notification.create = async (payload) => payload;
  Salon.findById = async () => null;

  // Organizer's getMyEvents returns full past event data unchanged
  await getMyEvents(
    { user: { _id: organizerId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "Color Workshop");
  assert.equal(res.body[0].date, "2020-01-01");
  assert.equal(res.body[0].time, "10:00");
  assert.equal(res.body[0].location, "Yerevan");
  assert.equal(res.body[0].instructor, "Educator");
  assert.equal(res.body[0].duration, 90);
  assert.equal(res.body[0].maxParticipants, 2);
  assert.equal(res.body[0].type, "training");
  assert.equal(res.body[0].visibility, "public");
});

// ── ReDoS prevention: event search ──

test("search with regex metacharacters treats them as literal text", async () => {
  const res = createResponse();
  let capturedQuery;

  Event.find = (query) => {
    capturedQuery = query;
    return createQuery([]);
  };
  EventReview.aggregate = async () => [];
  EventRegistration.aggregate = async () => [];
  EventReview.find = () => ({ lean: async () => [] });

  await getEvents(
    { query: { search: ".*+" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.ok(capturedQuery.$or, "search filter was applied");
  // The escaped term should not match literally ".*+" as a regex pattern
  const regexPattern = capturedQuery.$or[0].title.$regex;
  assert.equal(regexPattern, "\\.\\*\\+", "regex metacharacters are escaped");
});

test("search longer than 100 chars returns 400", async () => {
  const res = createResponse();
  const longSearch = "a".repeat(101);

  await getEvents(
    { query: { search: longSearch } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Search term is too long");
});

test("empty/whitespace search does not add search filter and still succeeds", async () => {
  const res = createResponse();
  let capturedQuery;

  Event.find = (query) => {
    capturedQuery = query;
    return createQuery([]);
  };
  EventReview.aggregate = async () => [];
  EventRegistration.aggregate = async () => [];
  EventReview.find = () => ({ lean: async () => [] });

  await getEvents(
    { query: { search: "   " } },
    res
  );

  assert.equal(res.statusCode, 200);
  // After trimming, search term is empty — no $or added
  assert.equal(capturedQuery.$or, undefined, "no $or filter for whitespace-only search");
});

test("malicious pattern (a+)+aaaaaaaaab does not cause ReDoS — passed as escaped literal", async () => {
  const res = createResponse();
  let capturedQuery;

  Event.find = (query) => {
    capturedQuery = query;
    return createQuery([]);
  };
  EventReview.aggregate = async () => [];
  EventRegistration.aggregate = async () => [];
  EventReview.find = () => ({ lean: async () => [] });

  await getEvents(
    { query: { search: "(a+)+aaaaaaaaab" } },
    res
  );

  assert.equal(res.statusCode, 200);
  const regexPattern = capturedQuery.$or[0].title.$regex;
  assert.ok(regexPattern.includes("\\("), "parentheses are escaped");
  assert.ok(regexPattern.includes("\\)"), "parentheses are escaped");
  assert.ok(regexPattern.includes("\\+"), "plus signs are escaped");
});
