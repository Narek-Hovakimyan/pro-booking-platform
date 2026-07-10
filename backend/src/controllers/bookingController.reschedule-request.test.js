import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  acceptRescheduleRequest,
  createRescheduleRequest,
  rejectRescheduleRequest,
} from "./bookingRescheduleController.js";
import {
  __bookingSideEffectsTestHooks,
} from "../services/booking/bookingSideEffectsService.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Schedule from "../models/Schedule.js";
import User from "../models/User.js";

import {
  barber,
  barberId,
  barberWithSalon,
  bookingDate,
  client,
  clientId,
  createMutableBooking,
  createResponse,
  mockBookingFind,
  originalMethods,
  otherClient,
} from "./bookingController.testUtils.js";

const requestedBookingDate = "2026-07-15";
const requestedTime = "11:30";

const dateKeyFromStoredValue = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const createPendingRescheduleRequest = (overrides = {}) => ({
  status: "pending",
  requestedBookingDate: new Date(`${requestedBookingDate}T00:00:00.000Z`),
  requestedDayKey: "wed",
  requestedTime,
  requestedBy: clientId,
  requestedAt: new Date("2099-06-01T08:00:00.000Z"),
  respondedBy: null,
  respondedAt: null,
  rejectionReason: "",
  originalBookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
  originalDayKey: "mon",
  originalTime: "10:00",
  requestNote: "Please move this",
  ...overrides,
});

const mockRescheduleDependencies = (activeBookings = []) => {
  User.findById = () => ({
    select: async (fields) =>
      fields === "name" ? { name: "Barber" } : barberWithSalon,
  });
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind(activeBookings);
};

const createRequestBody = (overrides = {}) => ({
  bookingDate: requestedBookingDate,
  dayKey: "tue",
  time: requestedTime,
  note: "Please move this",
  ...overrides,
});

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Schedule.findOne = originalMethods.scheduleFindOne;
  User.findById = originalMethods.userFindById;
  __bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries(async () => {});
});

test("client can create reschedule request for own pending booking", async () => {
  const booking = createMutableBooking({ status: "pending" });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await createRescheduleRequest(
    {
      user: client,
      params: { id: booking._id },
      body: createRequestBody(),
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.rescheduleRequest.status, "pending");
  assert.equal(
    dateKeyFromStoredValue(res.body.rescheduleRequest.requestedBookingDate),
    requestedBookingDate
  );
  assert.equal(res.body.rescheduleRequest.requestedTime, requestedTime);
  assert.equal(res.body.rescheduleRequest.requestedBy, clientId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, barberId);
  assert.equal(notifications[0].type, "booking_reschedule_requested");
  assert.deepEqual(notifications[0].data, { bookingId: booking._id });
});

test("client can create reschedule request for own accepted booking", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await createRescheduleRequest(
    {
      user: client,
      params: { id: booking._id },
      body: createRequestBody(),
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.rescheduleRequest.status, "pending");
  assert.equal(
    dateKeyFromStoredValue(res.body.rescheduleRequest.requestedBookingDate),
    requestedBookingDate
  );
  assert.equal(res.body.rescheduleRequest.requestedTime, requestedTime);
  assert.equal(res.body.rescheduleRequest.requestedBy, clientId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, barberId);
  assert.equal(notifications[0].type, "booking_reschedule_requested");
  assert.deepEqual(notifications[0].data, { bookingId: booking._id });
});

test("client can create reschedule request for own legacy confirmed booking", async () => {
  const booking = createMutableBooking({ status: "confirmed" });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => payload;

  await createRescheduleRequest(
    {
      user: client,
      params: { id: booking._id },
      body: createRequestBody(),
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.rescheduleRequest.status, "pending");
  assert.equal(res.body.rescheduleRequest.requestedTime, requestedTime);
});

test("reschedule request does not mutate original booking date/time", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate,
    dayKey: "mon",
    time: "10:00",
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => payload;

  await createRescheduleRequest(
    {
      user: client,
      params: { id: booking._id },
      body: createRequestBody(),
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.bookingDate, bookingDate);
  assert.equal(res.body.dayKey, "mon");
  assert.equal(res.body.time, "10:00");
  assert.equal(
    dateKeyFromStoredValue(res.body.rescheduleRequest.originalBookingDate),
    bookingDate
  );
  assert.equal(res.body.rescheduleRequest.originalTime, "10:00");
});

test("reschedule request validates requested slot against accepted and confirmed bookings", async () => {
  for (const status of ["accepted", "confirmed"]) {
    const booking = createMutableBooking({ status: "accepted" });
    const blockingBooking = createMutableBooking({
      _id: `blocking-booking-${status}`,
      bookingDate: requestedBookingDate,
      time: "11:00",
      duration: 60,
      status,
    });
    const res = createResponse();

    Booking.findById = async () => booking;
    mockRescheduleDependencies([blockingBooking]);

    await createRescheduleRequest(
      {
        user: client,
        params: { id: booking._id },
        body: createRequestBody(),
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "This time is already booked");
    assert.equal(booking.rescheduleRequest, undefined);
  }
});

test("duplicate pending reschedule request is rejected", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await createRescheduleRequest(
    {
      user: client,
      params: { id: booking._id },
      body: createRequestBody(),
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "A reschedule request is already pending");
});

test("client cannot request reschedule for another client's booking", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await createRescheduleRequest(
    {
      user: otherClient,
      params: { id: booking._id },
      body: createRequestBody(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

test("terminal booking cannot request reschedule", async () => {
  for (const status of [
    "completed",
    "cancelled",
    "rejected",
    "expired",
    "no_show",
    "late_cancelled",
  ]) {
    const booking = createMutableBooking({ status });
    const res = createResponse();

    Booking.findById = async () => booking;

    await createRescheduleRequest(
      {
        user: client,
        params: { id: booking._id },
        body: createRequestBody(),
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(booking.saveCalled, false);
  }
});

test("barber can accept pending reschedule request", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => payload;

  await acceptRescheduleRequest(
    {
      user: barber,
      params: { id: booking._id },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.rescheduleRequest.status, "accepted");
  assert.equal(res.body.rescheduleRequest.respondedBy, barberId);
  assert.ok(res.body.rescheduleRequest.respondedAt);
});

test("accept mutates booking date/time and clears reminder timestamps", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate,
    dayKey: "mon",
    time: "10:00",
    reminderSentAt: new Date("2099-06-01T06:00:00.000Z"),
    reminder24hSentAt: new Date("2099-06-01T06:00:00.000Z"),
    reminder2hSentAt: new Date("2099-06-01T06:00:00.000Z"),
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => payload;

  await acceptRescheduleRequest(
    {
      user: barber,
      params: { id: booking._id },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.bookingDate, requestedBookingDate);
  assert.equal(res.body.dayKey, "wed");
  assert.equal(res.body.time, requestedTime);
  assert.equal(res.body.reminderSentAt, null);
  assert.equal(res.body.reminder24hSentAt, null);
  assert.equal(res.body.reminder2hSentAt, null);
});

test("accepted reschedule triggers waitlist notification for old slot", async () => {
  const waitlistCalls = [];
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate,
    dayKey: "mon",
    time: "10:00",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => payload;
  __bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries((payload) => {
    waitlistCalls.push(payload);
    return Promise.resolve(1);
  });

  await acceptRescheduleRequest(
    {
      user: barber,
      params: { id: booking._id },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(waitlistCalls, [
    {
      barberId: booking.barberId,
      salonId: booking.salonId,
      date: bookingDate,
      serviceId: booking.serviceId,
      time: "10:00",
    },
  ]);
});

test("accept revalidates requested slot against accepted and confirmed bookings", async () => {
  for (const status of ["accepted", "confirmed"]) {
    const waitlistCalls = [];
    const booking = createMutableBooking({
      status: "accepted",
      bookingDate,
      time: "10:00",
      rescheduleRequest: createPendingRescheduleRequest(),
    });
    const blockingBooking = createMutableBooking({
      _id: `blocking-booking-${status}`,
      bookingDate: requestedBookingDate,
      time: "11:00",
      duration: 60,
      status,
    });
    const res = createResponse();

    Booking.findById = async () => booking;
    mockRescheduleDependencies([blockingBooking]);
    __bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries((payload) => {
      waitlistCalls.push(payload);
      return Promise.resolve(1);
    });

    await acceptRescheduleRequest(
      {
        user: barber,
        params: { id: booking._id },
        body: {},
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "This time is already booked");
    assert.equal(booking.bookingDate, bookingDate);
    assert.equal(booking.time, "10:00");
    assert.equal(booking.rescheduleRequest.status, "pending");
    assert.deepEqual(waitlistCalls, []);
  }
});

test("accept re-fetches inside lock and rejects stale pending state", async () => {
  const staleBooking = createMutableBooking({
    status: "accepted",
    bookingDate,
    time: "10:00",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const freshBooking = createMutableBooking({
    status: "accepted",
    bookingDate,
    time: "10:00",
    rescheduleRequest: createPendingRescheduleRequest({
      status: "accepted",
      respondedBy: barberId,
      respondedAt: new Date("2099-06-01T09:00:00.000Z"),
    }),
  });
  const res = createResponse();
  let findByIdCalls = 0;
  let slotValidationFinds = 0;

  Booking.findById = async () => {
    findByIdCalls++;
    return findByIdCalls === 1 ? staleBooking : freshBooking;
  };
  mockRescheduleDependencies([]);
  Booking.find = async () => {
    slotValidationFinds++;
    return [];
  };

  await acceptRescheduleRequest(
    {
      user: barber,
      params: { id: staleBooking._id },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "No pending reschedule request");
  assert.equal(findByIdCalls, 2);
  assert.equal(slotValidationFinds, 0);
  assert.equal(staleBooking.rescheduleRequest.status, "pending");
  assert.equal(staleBooking.saveCalled, false);
  assert.equal(freshBooking.saveCalled, false);
});

test("accept notifies client", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await acceptRescheduleRequest(
    {
      user: barber,
      params: { id: booking._id },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, clientId);
  assert.equal(notifications[0].type, "booking_reschedule_accepted");
  assert.deepEqual(notifications[0].data, { bookingId: booking._id });
});

test("barber can reject pending reschedule request", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  Notification.create = async (payload) => payload;

  await rejectRescheduleRequest(
    {
      user: barber,
      params: { id: booking._id },
      body: { reason: "Not available then" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.rescheduleRequest.status, "rejected");
  assert.equal(res.body.rescheduleRequest.rejectionReason, "Not available then");
  assert.equal(res.body.rescheduleRequest.respondedBy, barberId);
  assert.ok(res.body.rescheduleRequest.respondedAt);
});

test("reject keeps original booking date/time and notifies client", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate,
    time: "10:00",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await rejectRescheduleRequest(
    {
      user: barber,
      params: { id: booking._id },
      body: { reason: "Not available then" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.bookingDate, bookingDate);
  assert.equal(res.body.time, "10:00");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, clientId);
  assert.equal(notifications[0].type, "booking_reschedule_rejected");
  assert.deepEqual(notifications[0].data, { bookingId: booking._id });
});

test("reject works when request body is missing", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate,
    time: "10:00",
    rescheduleRequest: createPendingRescheduleRequest(),
  });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await rejectRescheduleRequest(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.bookingDate, bookingDate);
  assert.equal(res.body.time, "10:00");
  assert.equal(res.body.rescheduleRequest.status, "rejected");
  assert.equal(res.body.rescheduleRequest.rejectionReason, "");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "booking_reschedule_rejected");
});

test("client cannot accept or reject reschedule request", async () => {
  for (const action of [acceptRescheduleRequest, rejectRescheduleRequest]) {
    const waitlistCalls = [];
    const booking = createMutableBooking({
      status: "accepted",
      rescheduleRequest: createPendingRescheduleRequest(),
    });
    const res = createResponse();

    Booking.findById = async () => booking;
    __bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries((payload) => {
      waitlistCalls.push(payload);
      return Promise.resolve(1);
    });

    await action(
      {
        user: client,
        params: { id: booking._id },
        body: {},
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(booking.rescheduleRequest.status, "pending");
    assert.deepEqual(waitlistCalls, []);
  }
});

test("unrelated barber cannot accept or reject reschedule request", async () => {
  const otherBarber = {
    _id: "64b000000000000000000099",
    id: "64b000000000000000000099",
    role: "barber",
  };

  for (const action of [acceptRescheduleRequest, rejectRescheduleRequest]) {
    const booking = createMutableBooking({
      status: "accepted",
      rescheduleRequest: createPendingRescheduleRequest(),
    });
    const res = createResponse();

    Booking.findById = async () => booking;

    await action(
      {
        user: otherBarber,
        params: { id: booking._id },
        body: {},
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(booking.rescheduleRequest.status, "pending");
  }
});

test("accept or reject without pending request returns 400", async () => {
  for (const action of [acceptRescheduleRequest, rejectRescheduleRequest]) {
    const booking = createMutableBooking({ status: "accepted" });
    const res = createResponse();

    Booking.findById = async () => booking;

    await action(
      {
        user: barber,
        params: { id: booking._id },
        body: {},
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "No pending reschedule request");
  }
});

test("notification failure is non-fatal for reschedule request flow", async () => {
  const originalConsoleError = console.error;
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockRescheduleDependencies([]);
  Notification.create = async () => {
    throw new Error("notification unavailable");
  };
  console.error = () => {};

  try {
    await createRescheduleRequest(
      {
        user: client,
        params: { id: booking._id },
        body: createRequestBody(),
      },
      res
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.rescheduleRequest.status, "pending");
});
