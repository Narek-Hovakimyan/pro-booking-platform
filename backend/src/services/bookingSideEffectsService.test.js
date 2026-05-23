import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __bookingSideEffectsTestHooks,
  emitBookingUpdated,
  notifyUsersForBookingStatusChange,
  notifyWaitlistForReleasedBookingSlot,
} from "./bookingSideEffectsService.js";
import User from "../models/User.js";

const barberId = "64b000000000000000000001";
const clientId = "64b000000000000000000003";
const originalUserFindById = User.findById;

const createBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId,
  clientId,
  salonId: "64b000000000000000000004",
  serviceId: "64b000000000000000000005",
  bookingDate: "2099-06-01",
  time: "10:00",
  status: "accepted",
  serviceName: "Haircut",
  ...overrides,
});

const createFakeIO = () => {
  const calls = [];

  return {
    calls,
    to(room) {
      return {
        emit(event, payload) {
          calls.push({ room, event, payload });
        },
      };
    },
  };
};

afterEach(() => {
  __bookingSideEffectsTestHooks.resetGetIO();
  __bookingSideEffectsTestHooks.resetNotifyMatchingWaitlistEntries();
  __bookingSideEffectsTestHooks.resetCreateNotification();
  User.findById = originalUserFindById;
  console.error = originalConsoleError;
});

const originalConsoleError = console.error;

test("emits bookingUpdated to barber and client rooms with exact payload", () => {
  const booking = createBooking();
  const io = createFakeIO();

  __bookingSideEffectsTestHooks.setGetIO(() => io);

  emitBookingUpdated(booking, "created");

  assert.deepEqual(io.calls, [
    {
      room: `user:${barberId}`,
      event: "bookingUpdated",
      payload: { booking, action: "created" },
    },
    {
      room: `user:${clientId}`,
      event: "bookingUpdated",
      payload: { booking, action: "created" },
    },
  ]);
});

test("skips client emit when booking has no clientId", () => {
  const booking = createBooking({ clientId: null });
  const io = createFakeIO();

  __bookingSideEffectsTestHooks.setGetIO(() => io);

  emitBookingUpdated(booking);

  assert.deepEqual(io.calls, [
    {
      room: `user:${barberId}`,
      event: "bookingUpdated",
      payload: { booking, action: "updated" },
    },
  ]);
});

test("no-ops when getIO returns null or undefined", () => {
  __bookingSideEffectsTestHooks.setGetIO(() => null);
  assert.doesNotThrow(() => emitBookingUpdated(createBooking()));

  __bookingSideEffectsTestHooks.setGetIO(() => undefined);
  assert.doesNotThrow(() => emitBookingUpdated(createBooking()));
});

test("socket errors do not throw", () => {
  __bookingSideEffectsTestHooks.setGetIO(() => {
    throw new Error("socket unavailable");
  });

  assert.doesNotThrow(() => emitBookingUpdated(createBooking()));

  __bookingSideEffectsTestHooks.setGetIO(() => ({
    to() {
      throw new Error("emit failed");
    },
  }));

  assert.doesNotThrow(() => emitBookingUpdated(createBooking()));
});

test("passes exact released booking slot fields to waitlist notification", () => {
  const booking = createBooking();
  const calls = [];

  __bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries((payload) => {
    calls.push(payload);
    return Promise.resolve(1);
  });

  notifyWaitlistForReleasedBookingSlot(booking);

  assert.deepEqual(calls, [
    {
      barberId: booking.barberId,
      salonId: booking.salonId,
      date: booking.bookingDate,
      serviceId: booking.serviceId,
      time: booking.time,
    },
  ]);
});

test("preserves missing salonId when notifying waitlist", () => {
  const booking = createBooking({ salonId: null });
  const calls = [];

  __bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries((payload) => {
    calls.push(payload);
    return Promise.resolve(0);
  });

  notifyWaitlistForReleasedBookingSlot(booking);

  assert.equal(calls[0].salonId, null);
});

test("waitlist notification errors are caught and logged without throwing", async () => {
  const logs = [];

  console.error = (...args) => {
    logs.push(args);
  };
  __bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries(() =>
    Promise.reject(new Error("waitlist failed"))
  );

  assert.doesNotThrow(() => notifyWaitlistForReleasedBookingSlot(createBooking()));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "Waitlist notification error:");
  assert.equal(logs[0][1], "waitlist failed");
});

test("accepted status change sends same client notification", async () => {
  const notifications = [];
  const booking = createBooking();

  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });
  __bookingSideEffectsTestHooks.setCreateNotification(async (payload) => {
    notifications.push(payload);
    return payload;
  });

  await notifyUsersForBookingStatusChange({
    booking,
    status: "accepted",
    requester: { _id: barberId, role: "barber" },
    isBookingClient: false,
  });

  assert.deepEqual(notifications, [
    {
      userId: clientId,
      type: "booking_accepted",
      message: "Your booking with Barber on 2099-06-01 at 10:00 was accepted",
      data: { bookingId: booking._id },
    },
  ]);
});

test("rejected status change sends same client notification", async () => {
  const notifications = [];
  const booking = createBooking({ rejectionReason: "Unavailable" });

  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });
  __bookingSideEffectsTestHooks.setCreateNotification(async (payload) => {
    notifications.push(payload);
    return payload;
  });

  await notifyUsersForBookingStatusChange({
    booking,
    status: "rejected",
    requester: { _id: barberId, role: "barber" },
    isBookingClient: false,
  });

  assert.deepEqual(notifications, [
    {
      userId: clientId,
      type: "booking_rejected",
      message:
        "Your booking with Barber on 2099-06-01 at 10:00 was rejected. Reason: Unavailable",
      data: { bookingId: booking._id },
    },
  ]);
});

test("cancelled status change sends same barber notification", async () => {
  const notifications = [];
  const booking = createBooking({ cancelReason: "Plans changed" });

  __bookingSideEffectsTestHooks.setCreateNotification(async (payload) => {
    notifications.push(payload);
    return payload;
  });

  await notifyUsersForBookingStatusChange({
    booking,
    status: "cancelled",
    requester: { _id: clientId, role: "client", name: "Client" },
    isBookingClient: true,
  });

  assert.deepEqual(notifications, [
    {
      userId: barberId,
      type: "booking_cancelled",
      message:
        "Client cancelled booking on 2099-06-01 at 10:00. Reason: Plans changed",
      data: { bookingId: booking._id },
    },
  ]);
});

test("unsupported status change sends no user notification", async () => {
  const notifications = [];

  __bookingSideEffectsTestHooks.setCreateNotification(async (payload) => {
    notifications.push(payload);
    return payload;
  });

  await notifyUsersForBookingStatusChange({
    booking: createBooking(),
    status: "completed",
    requester: { _id: barberId, role: "barber" },
    isBookingClient: false,
  });

  assert.deepEqual(notifications, []);
});

test("status change notification failures still reject", async () => {
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });
  __bookingSideEffectsTestHooks.setCreateNotification(async () => {
    throw new Error("Notification failed");
  });

  await assert.rejects(
    notifyUsersForBookingStatusChange({
      booking: createBooking(),
      status: "accepted",
      requester: { _id: barberId, role: "barber" },
      isBookingClient: false,
    }),
    /Notification failed/
  );
});
