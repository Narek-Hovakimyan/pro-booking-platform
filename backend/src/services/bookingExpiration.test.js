import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Notification from "../models/Notification.js";
import Booking from "../models/Booking.js";
import WaitlistEntry from "../models/WaitlistEntry.js";
import {
  __bookingExpirationTestHooks,
  EXPIRED_REASON,
  expirePendingBookings,
  shouldExpireBooking,
} from "./bookingExpiration.js";

const originalMethods = {
  bookingFind: Booking.find,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  notificationCreate: Notification.create,
  waitlistEntryFind: WaitlistEntry.find,
};

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  WaitlistEntry.find = originalMethods.waitlistEntryFind;
  __bookingExpirationTestHooks.setNotifyMatchingWaitlistEntries(async () => 0);
});

const createBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId: "64b000000000000000000001",
  clientId: "64b000000000000000000002",
  bookingDate: "2026-05-07",
  dayKey: "2026-05-07",
  time: "10:00",
  status: "pending",
  ...overrides,
});

__bookingExpirationTestHooks.setNotifyMatchingWaitlistEntries(async () => 0);

test("past pending booking becomes expired and sends notifications", async () => {
  const booking = createBooking({ time: "09:00" });
  const notifications = [];

  Booking.find = async () => [booking];
  Booking.findOneAndUpdate = async (query, update) => {
    if (query._id === booking._id && query.status === "pending") {
      return { ...booking, ...(update.$set || {}) };
    }
    return null;
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  WaitlistEntry.find = async () => [];

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 1);
  assert.equal(expiredBookings[0].status, "expired");
  assert.equal(expiredBookings[0].expiredReason, EXPIRED_REASON);
  assert.ok(expiredBookings[0].expiredAt instanceof Date);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].type, "booking_expired");
  assert.equal(notifications[1].type, "booking_expired_missed");
});

test("future pending booking stays pending", async () => {
  const booking = createBooking({ time: "11:00" });

  Booking.find = async () => [booking];
  Booking.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => payload;

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 0);
});

test("accepted past booking does not become expired", async () => {
  const booking = createBooking({ status: "accepted", time: "09:00" });

  Booking.find = async () => [booking];
  Booking.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => payload;

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 0);
});

test("shouldExpireBooking expires past time today but not future today", async () => {
  const now = new Date("2026-05-07T10:00:00+04:00");

  assert.equal(
    shouldExpireBooking(createBooking({ time: "09:59" }), now),
    true
  );
  assert.equal(
    shouldExpireBooking(createBooking({ time: "10:01" }), now),
    false
  );
});

test("duplicate expiration does not send duplicate notifications", async () => {
  const booking = createBooking({ time: "09:00" });
  let claimCount = 0;
  const notifications = [];

  let isExpired = false;

  Booking.find = async () => {
    if (isExpired) {
      return [{ ...booking, status: "expired" }];
    }
    return [booking];
  };
  Booking.findOneAndUpdate = async (query, update) => {
    if (query._id === booking._id && query.status === "pending") {
      claimCount++;
      isExpired = true;
      return { ...booking, ...(update.$set || {}) };
    }
    return null;
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  WaitlistEntry.find = async () => [];

  // First run — should expire and send notifications
  const result1 = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );
  assert.equal(result1.length, 1);
  assert.equal(notifications.length, 2);

  // Second run — booking is no longer pending, so shouldExpireBooking returns
  // false (status !== "pending"), and findOneAndUpdate is not reached
  const result2 = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );
  assert.equal(result2.length, 0);
  assert.equal(notifications.length, 2); // No new notifications
  assert.equal(claimCount, 1); // Only one atomic claim succeeded
});

test("booking with no clientId still sends barber notification only", async () => {
  const booking = createBooking({ clientId: null, time: "09:00" });
  const notifications = [];

  Booking.find = async () => [booking];
  Booking.findOneAndUpdate = async (query, update) => {
    if (query._id === booking._id && query.status === "pending") {
      return { ...booking, ...(update.$set || {}) };
    }
    return null;
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  WaitlistEntry.find = async () => [];

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 1);
  // Only one notification — barber "missed" notification
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "booking_expired_missed");
});

test("findOneAndUpdate returning null does not notify for booking expiration", async () => {
  const booking = createBooking({ time: "09:00" });
  const notifications = [];

  Booking.find = async () => [booking];
  // findOneAndUpdate always returns null - simulates losing the atomic claim race
  Booking.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 0);
  assert.equal(notifications.length, 0);
});
