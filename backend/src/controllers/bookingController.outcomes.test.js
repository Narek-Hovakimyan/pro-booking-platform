import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { __bookingTestHooks } from "./bookingController.js";
import {
  markLateCancel,
  markNoShow,
} from "./bookingOutcomeController.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Schedule from "../models/Schedule.js";

import {
  barber,
  barberId,
  bookingDate,
  client,
  clientId,
  createMutableBooking,
  createResponse,
  mockBookingFind,
  mockBookingStatusClaim,
  originalMethods,
  pastBookingDate,
} from "./bookingController.testUtils.js";

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Schedule.findOne = originalMethods.scheduleFindOne;
});

// --- No-show tests ---

test("barber can mark own accepted past booking as no-show", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
    noShowMarkedBy: null,
  });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  mockBookingStatusClaim(booking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "no_show");
  assert.ok(res.body.noShowMarkedAt);
  assert.equal(String(res.body.noShowMarkedBy), barberId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "booking_no_show");
  assert.equal(notifications[0].userId, clientId);
  assert.deepEqual(notifications[0].data, { bookingId: booking._id });
});

test("barber can mark own accepted past booking as late-cancelled", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    lateCancelledAt: null,
    lateCancelledBy: null,
  });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  mockBookingStatusClaim(booking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await markLateCancel(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "late_cancelled");
  assert.ok(res.body.lateCancelledAt);
  assert.equal(String(res.body.lateCancelledBy), barberId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "booking_late_cancelled");
  assert.equal(notifications[0].userId, clientId);
  assert.deepEqual(notifications[0].data, { bookingId: booking._id });
});

test("client cannot mark no-show", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: client,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("client cannot mark late-cancel", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    lateCancelledAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markLateCancel(
    {
      user: client,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("unrelated barber cannot mark no-show", async () => {
  const otherBarber = { _id: "64b000000000000000000099", id: "64b000000000000000000099", role: "barber" };
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: otherBarber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("unrelated barber cannot mark late-cancel", async () => {
  const otherBarber = { _id: "64b000000000000000000099", id: "64b000000000000000000099", role: "barber" };
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    lateCancelledAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markLateCancel(
    {
      user: otherBarber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("pending booking cannot be marked no-show", async () => {
  const booking = createMutableBooking({
    status: "pending",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("rejected booking cannot be marked no-show", async () => {
  const booking = createMutableBooking({
    status: "rejected",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("cancelled booking cannot be marked no-show", async () => {
  const booking = createMutableBooking({
    status: "cancelled",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("completed booking cannot be marked no-show", async () => {
  const booking = createMutableBooking({
    status: "completed",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("expired booking cannot be marked no-show", async () => {
  const booking = createMutableBooking({
    status: "expired",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("duplicate no-show mark is blocked", async () => {
  const booking = createMutableBooking({
    status: "no_show",
    bookingDate: pastBookingDate,
    noShowMarkedAt: new Date("2020-01-15T12:00:00"),
    noShowMarkedBy: barberId,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("duplicate late-cancel mark is blocked", async () => {
  const booking = createMutableBooking({
    status: "late_cancelled",
    bookingDate: pastBookingDate,
    lateCancelledAt: new Date("2020-01-15T12:00:00"),
    lateCancelledBy: barberId,
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await markLateCancel(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("no-show notification is skipped safely when booking has no client", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    clientId: null,
    noShowMarkedAt: null,
    noShowMarkedBy: null,
  });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  mockBookingStatusClaim(booking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await markNoShow(
    {
      user: barber,
      params: { id: booking._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "no_show");
  assert.equal(notifications.length, 0);
});

test("concurrent no-show marks create only one notification", async () => {
  const storedBooking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
    noShowMarkedBy: null,
  });
  const notifications = [];
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });
  const firstResponse = createResponse();
  const secondResponse = createResponse();

  Booking.findById = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return createMutableBooking({ ...storedBooking, status: "accepted" });
  };
  mockBookingStatusClaim(storedBooking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await Promise.all([
    markNoShow({ user: barber, params: { id: storedBooking._id } }, firstResponse),
    markNoShow({ user: barber, params: { id: storedBooking._id } }, secondResponse),
  ]);

  const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();
  assert.deepEqual(statusCodes, [200, 400]);
  assert.equal(storedBooking.status, "no_show");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "booking_no_show");
});

test("concurrent late-cancel marks create only one notification", async () => {
  const storedBooking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    lateCancelledAt: null,
    lateCancelledBy: null,
  });
  const notifications = [];
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });
  const firstResponse = createResponse();
  const secondResponse = createResponse();

  Booking.findById = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return createMutableBooking({ ...storedBooking, status: "accepted" });
  };
  mockBookingStatusClaim(storedBooking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await Promise.all([
    markLateCancel({ user: barber, params: { id: storedBooking._id } }, firstResponse),
    markLateCancel({ user: barber, params: { id: storedBooking._id } }, secondResponse),
  ]);

  const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();
  assert.deepEqual(statusCodes, [200, 400]);
  assert.equal(storedBooking.status, "late_cancelled");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "booking_late_cancelled");
});

test("concurrent no-show and late-cancel cannot both be applied", async () => {
  const storedBooking = createMutableBooking({
    status: "accepted",
    bookingDate: pastBookingDate,
    noShowMarkedAt: null,
    lateCancelledAt: null,
  });
  const notifications = [];
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });
  const noShowResponse = createResponse();
  const lateCancelResponse = createResponse();

  Booking.findById = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return createMutableBooking({ ...storedBooking, status: "accepted" });
  };
  mockBookingStatusClaim(storedBooking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await Promise.all([
    markNoShow({ user: barber, params: { id: storedBooking._id } }, noShowResponse),
    markLateCancel({ user: barber, params: { id: storedBooking._id } }, lateCancelResponse),
  ]);

  const statusCodes = [noShowResponse.statusCode, lateCancelResponse.statusCode].sort();
  assert.deepEqual(statusCodes, [200, 400]);
  assert.equal(["no_show", "late_cancelled"].includes(storedBooking.status), true);
  assert.equal(notifications.length, 1);
});

test("no-show status does not block availability", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    createMutableBooking({
      _id: "booking-no-show",
      time: "10:00",
      duration: 60,
      status: "no_show",
    }),
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});

test("late-cancelled status does not block availability", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    createMutableBooking({
      _id: "booking-late-cancelled",
      time: "10:00",
      duration: 60,
      status: "late_cancelled",
    }),
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});
