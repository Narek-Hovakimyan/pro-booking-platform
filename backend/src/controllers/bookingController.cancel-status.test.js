import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { updateBooking } from "./bookingController.js";
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
  createMutableBooking,
  createResponse,
  mockBookingFind,
  originalMethods,
  otherClient,
} from "./bookingController.testUtils.js";

const originalConsoleError = console.error;

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Schedule.findOne = originalMethods.scheduleFindOne;
  User.findById = originalMethods.userFindById;
  console.error = originalConsoleError;
});

test("barber accepts and rejects their booking", async () => {
  Notification.create = async (payload) => payload;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  for (const updateBody of [
    { status: "accepted" },
    { status: "rejected", rejectionReason: "Unavailable" },
  ]) {
    const booking = createMutableBooking();
    const res = createResponse();

    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: updateBody,
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, updateBody.status);
    assert.equal(booking.saveCalled, true);
  }
});

test("client cancels but cannot directly reschedule pending booking", async () => {
  Notification.create = async (payload) => payload;
  User.findById = () => ({
    select: async (fields) => (fields === "name" ? { name: "Barber" } : barberWithSalon),
  });
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([]);

  const cancelBooking = createMutableBooking();
  const cancelResponse = createResponse();
  Booking.findById = async () => cancelBooking;

  await updateBooking(
    {
      user: client,
      params: { id: cancelBooking._id },
      body: { status: "cancelled", cancelReason: "Plans changed" },
    },
    cancelResponse
  );

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(cancelResponse.body.status, "cancelled");

  const rescheduleBooking = createMutableBooking({
    bookingDate,
    dayKey: "mon",
    time: "10:00",
  });
  const rescheduleResponse = createResponse();
  Booking.findById = async () => rescheduleBooking;

  await updateBooking(
    {
      user: client,
      params: { id: rescheduleBooking._id },
      body: {
        bookingDate,
        dayKey: "mon",
        time: "11:30",
      },
    },
    rescheduleResponse
  );

  assert.equal(rescheduleResponse.statusCode, 400);
  assert.equal(
    rescheduleResponse.body.message,
    "Bookings must be rescheduled by request."
  );
  assert.equal(rescheduleBooking.bookingDate, bookingDate);
  assert.equal(rescheduleBooking.dayKey, "mon");
  assert.equal(rescheduleBooking.time, "10:00");
  assert.equal(rescheduleBooking.saveCalled, false);
});

test("client cannot directly reschedule accepted or confirmed booking", async () => {
  for (const status of ["accepted", "confirmed"]) {
    const booking = createMutableBooking({
      status,
      bookingDate,
      dayKey: "mon",
      time: "10:00",
    });
    const res = createResponse();

    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: client,
        params: { id: booking._id },
        body: {
          bookingDate: "2099-06-02",
          dayKey: "tue",
          time: "11:30",
        },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body.message,
      "Bookings must be rescheduled by request."
    );
    assert.equal(booking.bookingDate, bookingDate);
    assert.equal(booking.dayKey, "mon");
    assert.equal(booking.time, "10:00");
    assert.equal(booking.saveCalled, false);
  }
});

test("barber direct reschedule behavior is unchanged", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate,
    dayKey: "mon",
    time: "10:00",
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        bookingDate: "2099-06-02",
        dayKey: "tue",
        time: "11:30",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only the booking owner can reschedule");
  assert.equal(booking.saveCalled, false);
});

test("pending direct reschedule is blocked before slot validation", async () => {
  const booking = createMutableBooking({
    _id: "booking-reschedule-1",
    status: "pending",
    time: "10:00",
    duration: 30,
  });
  const res = createResponse();
  let findCalls = 0;

  Booking.findById = async () => booking;
  Booking.find = async () => {
    findCalls++;
    return [];
  };

  await updateBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { bookingDate, dayKey: "mon", time: "11:00" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Bookings must be rescheduled by request.");
  assert.equal(findCalls, 0);
  assert.equal(booking.time, "10:00");
  assert.equal(booking.saveCalled, false);
});

test("unauthorized user cannot update another user's booking", async () => {
  const booking = createMutableBooking();
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: otherClient,
      params: { id: booking._id },
      body: { status: "cancelled", cancelReason: "Trying to cancel" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

test("updateBooking unexpected error returns 500", async () => {
  const res = createResponse();
  console.error = () => {};
  Booking.findById = async () => {
    throw new Error("database unavailable");
  };

  await updateBooking(
    {
      user: client,
      params: { id: "booking-1" },
      body: { status: "cancelled", cancelReason: "Plans changed" },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not update booking");
});

test("assigned barber can cancel manual booking without clientId", async () => {
  const booking = createMutableBooking({
    clientId: null,
    createdBy: "barber",
    status: "accepted",
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "cancelled", cancelReason: "Manual booking cancelled" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(booking.status, "cancelled");
  assert.equal(booking.cancelReason, "Manual booking cancelled");
  assert.equal(booking.cancelledBy, barberId);
  assert.equal(booking.saveCalled, true);
});

test("unrelated barber and client cannot cancel manual booking", async () => {
  const unrelatedBarber = {
    _id: "64b000000000000000000009",
    id: "64b000000000000000000009",
    role: "barber",
  };

  for (const user of [unrelatedBarber, client]) {
    const booking = createMutableBooking({
      clientId: null,
      createdBy: "barber",
      status: "accepted",
    });
    const res = createResponse();

    Booking.findById = async () => booking;

    await updateBooking(
      {
        user,
        params: { id: booking._id },
        body: { status: "cancelled", cancelReason: "Trying to cancel" },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(booking.status, "accepted");
    assert.equal(booking.saveCalled, false);
  }
});
