import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  cancelEvent,
  checkInRegistration,
  createEvent,
  getEventById,
  getEvents,
  getMyEvents,
  issueCertificates,
  updateAttendance,
  updateEvent,
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
  registrationFindOneAndUpdate: EventRegistration.findOneAndUpdate,
  registrationFindByIdAndUpdate: EventRegistration.findByIdAndUpdate,
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
  EventRegistration.findOneAndUpdate = originalMethods.registrationFindOneAndUpdate;
  EventRegistration.findByIdAndUpdate = originalMethods.registrationFindByIdAndUpdate;
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
  EventRegistration.find = (query = {}) =>
    createQuery(
      registrations.filter((registration) => matchesQuery(registration, query))
    );
  EventCertificate.find = () => createQuery(certificates);
  EventReview.find = () => createQuery([]);
  EventRegistration.findOneAndUpdate = async (query, update) => {
    const reg = registrations.find((r) => {
      if (String(r._id) !== String(query._id)) return false;
      if (String(r.eventId) !== String(query.eventId)) return false;
      if (query.status?.$in && !query.status.$in.includes(r.status)) return false;
      return true;
    });
    if (!reg) return null;
    if (update.$set) {
      Object.assign(reg, update.$set);
    }
    return reg;
  };
  EventRegistration.findByIdAndUpdate = async (id, update) => {
    const reg = registrations.find((r) => String(r._id) === String(id));
    if (!reg) return null;
    if (update.$set) {
      Object.assign(reg, update.$set);
    }
    return reg;
  };
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

test("approved salon member cannot create off-site event without salonId (not owner/admin)", async () => {
  const res = createResponse();

  Salon.findOne = () => ({
    select: async () => null,
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

  assert.equal(res.statusCode, 403);
  assert.ok(res.body.message.includes("Only salon owners"));
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

// ── Error leak prevention ──

test("getEvents unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Event.find = () => {
    throw new Error("secret events db path");
  };

  await withSilencedConsoleError(async () => {
    await getEvents({ query: {} }, res);
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch events");
});

test("getMyEvents unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Event.find = () => {
    throw new Error("secret my events db path");
  };

  await withSilencedConsoleError(async () => {
    await getMyEvents({ user: { _id: organizerId, role: "barber" } }, res);
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch your events");
});

test("getEventById unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Event.findById = () => {
    throw new Error("secret event detail path");
  };

  await withSilencedConsoleError(async () => {
    await getEventById({ params: { id: eventId }, user: { _id: organizerId } }, res);
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch event");
});

test("public event detail remains accessible without auth and hides participant names", async () => {
  const res = createResponse();
  createControllerMocks({
    registrations: [
      createRegistration({
        userId: {
          _id: attendeeId,
          name: "Attendee",
          email: "attendee@example.com",
          phone: "+374000000",
          platformRole: "internal",
        },
        status: "approved",
      }),
    ],
  });

  await getEventById({ params: { id: eventId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body._id, eventId);
  assert.equal(res.body.registrationCount, 1);
  assert.equal("registeredBarbers" in res.body, false);
});

test("private event detail returns 404 without auth", async () => {
  const res = createResponse();
  createControllerMocks({
    event: { ...baseEvent, visibility: "private" },
  });

  await getEventById({ params: { id: eventId } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Event not found");
});

test("private event detail returns 404 for unrelated authenticated user", async () => {
  const res = createResponse();
  createControllerMocks({
    event: { ...baseEvent, visibility: "private" },
  });

  await getEventById(
    { params: { id: eventId }, user: { _id: otherUserId, role: "client" } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Event not found");
});

for (const status of ["pending", "waitlisted", "rejected"]) {
  test(`private event detail returns 404 for ${status} participant`, async () => {
    const res = createResponse();
    createControllerMocks({
      event: { ...baseEvent, visibility: "private" },
      registrations: [createRegistration({ userId: attendeeId, status })],
    });

    await getEventById(
      { params: { id: eventId }, user: { _id: attendeeId, role: "client" } },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, "Event not found");
  });
}

test("private event detail returns approved participant view without participant list", async () => {
  const res = createResponse();
  createControllerMocks({
    event: { ...baseEvent, visibility: "private" },
    registrations: [createRegistration({ userId: attendeeId, status: "approved" })],
  });

  await getEventById(
    { params: { id: eventId }, user: { _id: attendeeId, role: "client" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body._id, eventId);
  assert.equal(res.body.registrationCount, 1);
  assert.equal("registeredBarbers" in res.body, false);
});

test("private event detail returns manager participant names without private fields", async () => {
  const res = createResponse();
  createControllerMocks({
    event: { ...baseEvent, visibility: "private" },
    registrations: [
      createRegistration({
        userId: {
          _id: attendeeId,
          name: "Attendee",
          email: "attendee@example.com",
          phone: "+374000000",
          platformRole: "internal",
        },
        status: "approved",
      }),
    ],
  });

  await getEventById(
    { params: { id: eventId }, user: { _id: organizerId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.registeredBarbers.length, 1);
  assert.deepEqual(Object.keys(res.body.registeredBarbers[0]).sort(), [
    "_id",
    "name",
    "registeredAt",
  ]);
  assert.equal(res.body.registeredBarbers[0].name, "Attendee");
});

test("updateAttendance unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Event.findById = () => {
    throw new Error("secret attendance path");
  };

  await withSilencedConsoleError(async () => {
    await updateAttendance(
      { params: { id: eventId }, user: { _id: organizerId, role: "barber" }, body: { registrations: [] } },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not update attendance");
});

test("issueCertificates unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Event.findById = () => {
    throw new Error("secret certificate path");
  };

  await withSilencedConsoleError(async () => {
    await issueCertificates(
      { params: { id: eventId }, user: { _id: organizerId, role: "barber" } },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not issue certificates");
});

test("getMyRegistrations unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  EventRegistration.find = () => {
    throw new Error("secret registrations path");
  };

  await withSilencedConsoleError(async () => {
    await getMyRegistrations({ user: { _id: attendeeId } }, res);
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch registrations");
});

test("getEventRegistrations unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Event.findById = () => {
    throw new Error("secret event regs path");
  };

  await withSilencedConsoleError(async () => {
    await getEventRegistrations(
      { params: { id: eventId }, user: { _id: organizerId, role: "barber" } },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch registrations");
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

test("getMyEvents aggregates stats for a past event", async () => {
  const res = createResponse();
  const pastEventId = "64b000000000000000000099";
  const pastEvent = {
    ...baseEvent,
    _id: pastEventId,
    date: "2020-01-01",
    time: "10:00",
  };

  Event.find = () => createQuery([{ ...pastEvent }]);

  let aggregateCallCount = 0;
  EventRegistration.aggregate = async (pipeline) => {
    aggregateCallCount++;
    if (aggregateCallCount === 1) {
      // approved registrations
      return [{ _id: pastEventId, count: 3 }];
    }
    // attended registrations
    return [{ _id: pastEventId, count: 2 }];
  };
  EventCertificate.aggregate = async () => [{ _id: pastEventId, count: 2 }];
  EventReview.aggregate = async () => [
    { _id: pastEventId, averageRating: 4.5, reviewsCount: 2 },
  ];
  EventRegistration.find = () => createQuery([]);
  EventCertificate.find = () => createQuery([]);
  EventReview.find = () => ({ lean: async () => [] });
  Notification.create = async (payload) => payload;
  Salon.findById = async () => null;

  await getMyEvents(
    { user: { _id: organizerId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].registrationCount, 3);
  assert.equal(res.body[0].attendedCount, 2);
  assert.equal(res.body[0].certificatesCount, 2);
  assert.equal(res.body[0].reviewsCount, 2);
  assert.equal(res.body[0].averageRating, 4.5);
});

test("getMyEvents aggregates stats for upcoming events as before", async () => {
  const res = createResponse();
  const upcomingEventId = "64b000000000000000000010";
  const upcomingEvent = {
    ...baseEvent,
    _id: upcomingEventId,
    date: "2099-12-25",
  };

  Event.find = () => createQuery([{ ...upcomingEvent }]);

  let aggregateCallCount = 0;
  EventRegistration.aggregate = async (pipeline) => {
    aggregateCallCount++;
    if (aggregateCallCount === 1) {
      // approved registrations
      return [{ _id: upcomingEventId, count: 5 }];
    }
    // attended registrations
    return [{ _id: upcomingEventId, count: 4 }];
  };
  EventCertificate.aggregate = async () => [{ _id: upcomingEventId, count: 3 }];
  EventReview.aggregate = async () => [
    { _id: upcomingEventId, averageRating: 4.2, reviewsCount: 3 },
  ];
  EventRegistration.find = () => createQuery([]);
  EventCertificate.find = () => createQuery([]);
  EventReview.find = () => ({ lean: async () => [] });
  Notification.create = async (payload) => payload;
  Salon.findById = async () => null;

  await getMyEvents(
    { user: { _id: organizerId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].registrationCount, 5);
  assert.equal(res.body[0].attendedCount, 4);
  assert.equal(res.body[0].certificatesCount, 3);
  assert.equal(res.body[0].reviewsCount, 3);
  assert.equal(res.body[0].averageRating, 4.2);
});

test("getMyEvents returns [] when organizer has no events", async () => {
  const res = createResponse();

  Event.find = () => createQuery([]);
  EventRegistration.aggregate = async () => [];
  EventCertificate.aggregate = async () => [];
  EventReview.aggregate = async () => [];
  EventRegistration.find = () => createQuery([]);
  EventCertificate.find = () => createQuery([]);
  EventReview.find = () => ({ lean: async () => [] });
  Notification.create = async (payload) => payload;
  Salon.findById = async () => null;

  await getMyEvents(
    { user: { _id: organizerId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
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

// ── Event create/update validation ──

const createEventMocksForOwner = () => {
  Salon.findById = async (id) => ({
    _id: id,
    name: "Test Salon",
    ownerId: organizerId,
    admins: [],
  });
  User.findById = () => ({
    select: async () => ({
      _id: organizerId,
      salon: null,
      salonStatus: "none",
      salons: [{ salon: salonAId, status: "approved" }],
    }),
  });
  SalonJoinRequest.findOne = async () => null;
  SalonJoinRequest.find = () => ({ distinct: async () => [] });
  Event.create = async (payload) => ({ _id: "created-event", ...payload });
  Event.findById = (id) =>
    createQuery({
      _id: id,
      title: "Test Event",
      instructor: "Educator",
      date: "2099-08-01",
      time: "10:00",
      duration: 90,
      price: 0,
      maxParticipants: 20,
      location: "Yerevan",
      salonId: { _id: salonAId, name: "Test Salon" },
      organizerId: { _id: organizerId, name: "Organizer" },
    });
};

test("createEvent rejects past date/time", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Past Event",
        instructor: "Educator",
        date: "2020-01-01",
        time: "10:00",
        duration: "60",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Event date/time must be in the future");
});

test("createEvent rejects invalid date/time", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Bad Date",
        instructor: "Educator",
        date: "not-a-date",
        time: "10:00",
        duration: "60",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid date or time");
});

test("createEvent rejects impossible date/time", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Impossible Date",
        instructor: "Educator",
        date: "2099-02-31",
        time: "10:00",
        duration: "60",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid date or time");
});

test("createEvent accepts future date/time", async () => {
  const res = createResponse();
  let createdPayload;
  createEventMocksForOwner();
  const origCreate = Event.create;
  Event.create = async (payload) => {
    createdPayload = payload;
    return { _id: "created-event", ...payload };
  };

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Future Event",
        instructor: "Educator",
        date: "2099-12-25",
        time: "10:00",
        duration: "90",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.date, "2099-12-25");
  assert.equal(createdPayload.price, 0);
  assert.equal(createdPayload.maxParticipants, 20);
  Event.create = origCreate;
});

test("createEvent rejects duration 0", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Zero Duration",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "0",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Duration must be a positive number");
});

test("createEvent rejects negative duration", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Neg Duration",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "-30",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Duration must be a positive number");
});

test("createEvent rejects negative price", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Neg Price",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "60",
        price: "-10",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Price must be a non-negative number");
});

test("createEvent rejects negative maxParticipants", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Neg Max",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "60",
        maxParticipants: "-5",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "maxParticipants must be a non-negative integer");
});

test("createEvent rejects non-integer maxParticipants", async () => {
  const res = createResponse();
  createEventMocksForOwner();

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Float Max",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "60",
        maxParticipants: "2.5",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "maxParticipants must be a non-negative integer");
});

test("createEvent allows maxParticipants 0", async () => {
  const res = createResponse();
  let createdPayload;
  createEventMocksForOwner();
  const origCreate = Event.create;
  Event.create = async (payload) => {
    createdPayload = payload;
    return { _id: "created-event", ...payload };
  };

  await createEvent(
    {
      user: { _id: organizerId, role: "barber" },
      body: {
        title: "Unlimited",
        instructor: "Educator",
        date: "2099-08-01",
        time: "10:00",
        duration: "60",
        maxParticipants: "0",
        location: "Yerevan",
        salonId: salonAId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.maxParticipants, 0);
  Event.create = origCreate;
});

test("updateEvent rejects provided invalid duration", async () => {
  const res = createResponse();
  const event = { ...baseEvent, async save() { return this; } };

  Event.findById = async (id) => (String(id) === String(eventId) ? event : null);
  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];

  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
      body: { duration: "0" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Duration must be a positive number");
});

test("updateEvent rejects provided invalid price", async () => {
  const res = createResponse();
  const event = { ...baseEvent, async save() { return this; } };

  Event.findById = async (id) => (String(id) === String(eventId) ? event : null);
  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];

  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
      body: { price: "-5" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Price must be a non-negative number");
});

test("updateEvent rejects provided invalid maxParticipants", async () => {
  const res = createResponse();
  const event = { ...baseEvent, async save() { return this; } };

  Event.findById = async (id) => (String(id) === String(eventId) ? event : null);
  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];

  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
      body: { maxParticipants: "-1" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "maxParticipants must be a non-negative integer");
});

test("updateEvent rejects provided non-integer maxParticipants", async () => {
  const res = createResponse();
  const event = { ...baseEvent, async save() { return this; } };

  Event.findById = async (id) => (String(id) === String(eventId) ? event : null);
  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];

  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
      body: { maxParticipants: "1.5" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "maxParticipants must be a non-negative integer");
});

test("updateEvent rejects changing date/time into the past", async () => {
  const res = createResponse();
  const event = {
    ...baseEvent,
    date: "2099-07-01",
    time: "11:00",
    async save() { return this; },
  };

  Event.findById = async (id) => (String(id) === String(eventId) ? event : null);
  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];

  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
      body: { date: "2020-01-01" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Event date/time must be in the future");
});

test("updateEvent accepts valid numeric updates", async () => {
  const res = createResponse();
  const event = {
    ...baseEvent,
    async save() {
      return this;
    },
  };

  Salon.findById = async () => null;
  let callCount = 0;
  Event.findById = (id) => {
    callCount++;
    if (callCount === 1) {
      // First call — updateEvent finds the existing event (plain object, await ok)
      return event;
    }
    // Second call — after save, populate the response (thenable with .populate)
    return createQuery({
      _id: id,
      ...event,
      salonId: { _id: null, name: undefined },
      organizerId: { _id: organizerId, name: "Organizer" },
    });
  };

  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];

  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
      body: {
        duration: "120",
        price: "50",
        maxParticipants: "10",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(event.duration, 120);
  assert.equal(event.price, 50);
  assert.equal(event.maxParticipants, 10);
});

test("updateEvent does not reject legacy past event when date/time is unchanged", async () => {
  const res = createResponse();
  const event = {
    ...baseEvent,
    date: "2020-01-01",
    time: "10:00",
    duration: 90,
    price: 25,
    maxParticipants: 8,
    async save() {
      return this;
    },
  };

  let callCount = 0;
  Event.findById = (id) => {
    callCount++;
    if (callCount === 1) return event;
    return createQuery({
      _id: id,
      ...event,
      organizerId: { _id: organizerId, name: "Organizer" },
    });
  };

  EventRegistration.aggregate = async () => [];
  EventReview.aggregate = async () => [];

  await updateEvent(
    {
      params: { id: eventId },
      user: { _id: organizerId, role: "barber" },
      body: { title: "Updated legacy event" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(event.title, "Updated legacy event");
  assert.equal(event.price, 25);
  assert.equal(event.maxParticipants, 8);
});

// ── Approve registration capacity / atomicity ──

test("approveRegistration allows approval when maxParticipants is 0 (unlimited)", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({
    event: { ...baseEvent, maxParticipants: 0 },
    registrations: [registration],
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

test("approveRegistration allows approval when maxParticipants is undefined (unlimited)", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({
    event: { ...baseEvent, maxParticipants: undefined },
    registrations: [registration],
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
});

test("approveRegistration blocks approval when approvedCount >= maxParticipants and maxParticipants > 0", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({
    event: { ...baseEvent, maxParticipants: 1 },
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
  assert.equal(registration.status, "pending", "registration was not modified");
});

test("approveRegistration does not approve cancelled registration", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "cancelled" });
  createControllerMocks({ registrations: [registration] });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Only pending or waitlisted registrations can be approved");
});

test("approveRegistration does not approve rejected registration", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "rejected" });
  createControllerMocks({ registrations: [registration] });

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Only pending or waitlisted registrations can be approved");
});

test("approveRegistration returns 400 if registration was already approved", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "approved" });
  createControllerMocks({ registrations: [registration] });

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

test("approveRegistration uses atomic status guard: stale status returns 400 and no notification", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // Make findOneAndUpdate return null — as if another request changed the status
  EventRegistration.findOneAndUpdate = async () => null;

  await approveRegistration(
    {
      params: { id: eventId, registrationId: registration._id },
      user: { _id: organizerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Registration is no longer pending or waitlisted");
  assert.equal(registration.status, "pending", "registration was not modified by our request");
  assert.equal(notifications.length, 0, "no notification was sent");
});

test("approveRegistration sends notification only after successful approval", async () => {
  const res = createResponse();
  const registration = createRegistration({ userId: attendeeId, status: "pending" });
  createControllerMocks({ registrations: [registration] });
  const notifications = [];
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
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_registration_approved");
  assert.deepEqual(notifications[0].data, {
    eventId,
    eventRegistrationId: registration._id,
  });
});
