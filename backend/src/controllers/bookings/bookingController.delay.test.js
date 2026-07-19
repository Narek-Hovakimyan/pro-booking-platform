import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { delayBooking } from "./bookingController.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Schedule from "../../models/Schedule.js";
import User from "../../models/User.js";

import {
  barberId,
  barberWithSalon,
  bookingDate,
  client,
  clientId,
  createMutableBooking,
  createResponse,
  mockBookingFind,
  mockDelayDependencies,
  mockDelayStatusClaim,
  originalMethods,
  otherClient,
  salonId,
  serviceId,
} from "./bookingController.testUtils.js";

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Schedule.findOne = originalMethods.scheduleFindOne;
  User.findById = originalMethods.userFindById;
});

// --- Booking delay tests ---

test("accepted booking can delay 10 minutes if slot is free", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    reminderSentAt: new Date("2099-05-31T10:00:00"),
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([], booking);
  Notification.create = async (payload) => payload;

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.time, "10:10");
  assert.equal(res.body.bookingDate, bookingDate);
  assert.equal(res.body.reminderSentAt, null);
  assert.equal(res.body.delayMinutesTotal, 10);
  assert.ok(res.body.delayedAt);
  assert.equal(booking.time, "10:10");
});

test("accepted booking can delay 20 minutes if slot is free", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([], booking);
  Notification.create = async (payload) => payload;

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 20 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.time, "10:20");
  assert.equal(res.body.delayMinutesTotal, 20);
  assert.ok(res.body.delayedAt);
});

test("booking delay is blocked if the next booking overlaps", async () => {
  const booking = createMutableBooking({
    _id: "booking-delay",
    status: "accepted",
    duration: 60,
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([
    createMutableBooking({
      _id: "booking-next",
      time: "10:30",
      duration: 30,
      status: "accepted",
    }),
  ], booking);

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "This time is already booked");
  assert.equal(booking.time, "10:00");
});

test("booking delay is blocked if a break overlaps", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    duration: 30,
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  User.findById = () => ({
    select: async () => barberWithSalon,
  });
  Schedule.findOne = async () => ({
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: true,
      breakStart: "10:30",
      breakEnd: "10:40",
    },
  });
  Booking.find = mockBookingFind([]);
  mockDelayStatusClaim(booking);

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Not enough time for selected service");
});

test("booking delay is blocked if schedule end is exceeded", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    duration: 30,
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  User.findById = () => ({
    select: async () => barberWithSalon,
  });
  Schedule.findOne = async () => ({
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "09:00",
      endTime: "10:30",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);
  mockDelayStatusClaim(booking);

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Not enough time for selected service");
});

test("pending booking cannot be delayed", async () => {
  const booking = createMutableBooking({ status: "pending" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Only accepted bookings can be delayed");
});

test("inactive booking statuses cannot be delayed", async () => {
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

    await delayBooking(
      {
        user: client,
        params: { id: booking._id },
        body: { delayMinutes: 10 },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Only accepted bookings can be delayed");
    assert.equal(booking.saveCalled, false);
  }
});

test("another client cannot delay a booking", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await delayBooking(
    {
      user: otherClient,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

test("booking delay rejects values other than 10 or 20", async () => {
  for (const delayMinutes of [0, 5, 15, 30, "10", "10 minutes"]) {
    const booking = createMutableBooking({ status: "accepted" });
    const res = createResponse();

    Booking.findById = async () => booking;

    await delayBooking(
      {
        user: client,
        params: { id: booking._id },
        body: { delayMinutes },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "delayMinutes must be 10 or 20");
    assert.equal(booking.saveCalled, false);
  }
});

test("booking delay preserves salon, service, duration, client, and date", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    salonId,
    serviceId,
    duration: 45,
    clientId,
    bookingDate,
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([], booking);
  Notification.create = async (payload) => payload;

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 20 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(String(res.body.salonId), salonId);
  assert.equal(String(res.body.serviceId), serviceId);
  assert.equal(res.body.duration, 45);
  assert.equal(String(res.body.clientId), clientId);
  assert.equal(res.body.bookingDate, bookingDate);
  assert.equal(res.body.time, "10:20");
});

test("booking delay creates barber and client notifications", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const notifications = [];
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([], booking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(notifications.length, 2);
  assert.deepEqual(
    notifications.map((notification) => String(notification.userId)).sort(),
    [barberId, clientId].sort()
  );
  assert.equal(notifications[0].type, "booking_delayed");
  assert.equal(
    notifications.every(
      (notification) => notification.data?.bookingId === booking._id
    ),
    true
  );
  assert.equal(
    notifications.some((notification) =>
      notification.message === "Client is running late. Booking moved to 10:10."
    ),
    true
  );
  assert.equal(
    notifications.some((notification) =>
      notification.message === "Your booking was delayed to 10:10."
    ),
    true
  );
});

test("booking delay does not roll back when notification creation fails", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([], booking);
  Notification.create = async () => {
    throw new Error("Notification failed");
  };

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.time, "10:10");
  assert.equal(booking.time, "10:10");
});

test("booking delay resets reminderSentAt consistently with reschedule", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    reminderSentAt: new Date("2099-05-31T10:00:00"),
  });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([], booking);
  Notification.create = async (payload) => payload;

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reminderSentAt, null);
});

test("booking delay does not change bookingDate", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;
  mockDelayDependencies([], booking);
  Notification.create = async (payload) => payload;

  await delayBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { delayMinutes: 20 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.bookingDate, bookingDate);
});

test("concurrent delay requests only apply one stale-time update", async () => {
  const storedBooking = createMutableBooking({
    status: "accepted",
    time: "10:00",
  });
  const notifications = [];
  const firstResponse = createResponse();
  const secondResponse = createResponse();
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });

  Booking.findById = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return createMutableBooking({ ...storedBooking, time: "10:00" });
  };
  mockDelayDependencies([], storedBooking);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await Promise.all([
    delayBooking(
      { user: client, params: { id: storedBooking._id }, body: { delayMinutes: 10 } },
      firstResponse
    ),
    delayBooking(
      { user: client, params: { id: storedBooking._id }, body: { delayMinutes: 10 } },
      secondResponse
    ),
  ]);

  const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();
  assert.deepEqual(statusCodes, [200, 400]);
  assert.equal(storedBooking.time, "10:10");
  assert.equal(notifications.length, 2);
});

test("booking delay handles invalid booking time and date with 400", async () => {
  const invalidTimeBooking = createMutableBooking({
    status: "accepted",
    time: "not-a-time",
  });
  const invalidTimeResponse = createResponse();

  Booking.findById = async () => invalidTimeBooking;

  await delayBooking(
    {
      user: client,
      params: { id: invalidTimeBooking._id },
      body: { delayMinutes: 10 },
    },
    invalidTimeResponse
  );

  assert.equal(invalidTimeResponse.statusCode, 400);
  assert.equal(invalidTimeResponse.body.message, "Booking time is invalid");

  const invalidDateBooking = createMutableBooking({
    status: "accepted",
    bookingDate: "not-a-date",
  });
  const invalidDateResponse = createResponse();

  Booking.findById = async () => invalidDateBooking;

  await delayBooking(
    {
      user: client,
      params: { id: invalidDateBooking._id },
      body: { delayMinutes: 10 },
    },
    invalidDateResponse
  );

  assert.equal(invalidDateResponse.statusCode, 400);
  assert.equal(invalidDateResponse.body.message, "bookingDate must be YYYY-MM-DD");
});

// ── Policy: one delay per booking ──────────────────────────────────────

test("booking with delayMinutesTotal > 0 cannot be delayed again", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    delayMinutesTotal: 10,
    delayedAt: new Date(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await delayBooking(
    { user: client, params: { id: booking._id }, body: { delayMinutes: 10 } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "This booking has already been delayed.");
});

test("booking with delayedAt set cannot be delayed again", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    delayMinutesTotal: 0,
    delayedAt: new Date(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await delayBooking(
    { user: client, params: { id: booking._id }, body: { delayMinutes: 20 } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "This booking has already been delayed.");
});

// ── Policy: max 20 minute total delay ──────────────────────────────────

test("booking delay rejects values that would exceed 20 minute total cap (already delayed 10)", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    delayMinutesTotal: 10,
    delayedAt: new Date(),
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await delayBooking(
    { user: client, params: { id: booking._id }, body: { delayMinutes: 20 } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "This booking has already been delayed.");
});

// ── Policy: grace window after appointment start ───────────────────────

test("booking delay is blocked when outside grace window (past appointment + 5 min)", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate: "2020-01-15",
    time: "10:00",
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await delayBooking(
    { user: client, params: { id: booking._id }, body: { delayMinutes: 10 } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "This booking can no longer be delayed.");
});

// ── Policy: concurrency guard on findOneAndUpdate ($or condition) ─────

test("second concurrent delay attempt fails when first already applied delayMinutesTotal", async () => {
  const storedBooking = createMutableBooking({
    status: "accepted",
    time: "10:00",
  });
  let firstDone = false;
  const res1 = createResponse();
  const res2 = createResponse();

  // findById reads the booking each time; first succeeds, second sees it already has delay
  Booking.findById = async () => {
    if (firstDone) {
      return createMutableBooking({
        ...storedBooking,
        _id: storedBooking._id,
        status: "accepted",
        time: "10:00",
        delayMinutesTotal: 10,
        delayedAt: new Date(),
      });
    }
    return storedBooking;
  };
  mockDelayDependencies([], storedBooking);
  Notification.create = async (payload) => payload;

  await delayBooking(
    { user: client, params: { id: storedBooking._id }, body: { delayMinutes: 10 } },
    res1
  );
  firstDone = true;

  await delayBooking(
    { user: client, params: { id: storedBooking._id }, body: { delayMinutes: 10 } },
    res2
  );

  assert.equal(res1.statusCode, 200);
  assert.equal(res2.statusCode, 400);
  assert.equal(res2.body.message, "This booking has already been delayed.");
});
