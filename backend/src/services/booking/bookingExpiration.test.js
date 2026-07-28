import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Notification from "../../models/Notification.js";
import Booking from "../../models/Booking.js";
import WaitlistEntry from "../../models/WaitlistEntry.js";
import {
  __bookingExpirationTestHooks,
  EXPIRED_REASON,
  expirePendingBookings,
  shouldExpireBooking,
} from "./bookingExpiration.js";

const originalMethods = {
  bookingFind: Booking.find,
  bookingFindOne: Booking.findOne,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  notificationCreate: Notification.create,
  waitlistEntryFind: WaitlistEntry.find,
};

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
  Booking.findOne = originalMethods.bookingFindOne;
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
  Booking.findOne = async () => booking;
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
  assert.deepEqual(notifications[0].data, { bookingId: booking._id });
  assert.equal(notifications[1].type, "booking_expired_missed");
  assert.deepEqual(notifications[1].data, { bookingId: booking._id });
});

test("future pending booking stays pending", async () => {
  const booking = createBooking({ time: "11:00" });

  Booking.find = async () => [booking];
  Booking.findOne = async () => booking;
  Booking.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => payload;

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 0);
});

test("expirePendingBookings queries only date-eligible pending candidates", async () => {
  let capturedQuery;
  let capturedLimit;

  Booking.find = (query) => {
    capturedQuery = query;
    return {
      limit(limit) {
        capturedLimit = limit;
        return [];
      },
    };
  };
  Booking.findOne = async () => null;
  Booking.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => payload;

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 0);
  assert.equal(capturedQuery.status, "pending");
  assert.ok(Array.isArray(capturedQuery.$or));
  assert.notDeepEqual(capturedQuery, { status: "pending" });
  assert.ok(
    capturedQuery.$or.some((condition) => condition.bookingDate?.$lte === "2026-05-07")
  );
  assert.ok(
    capturedQuery.$or.some((condition) => condition.dayKey?.$lte === "2026-05-07")
  );
  assert.equal(capturedLimit, 1000);
});

test("accepted past booking does not become expired", async () => {
  const booking = createBooking({ status: "accepted", time: "09:00" });

  Booking.find = async () => [booking];
  Booking.findOne = async () => booking;
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
  Booking.findOne = async () => (isExpired ? { ...booking, status: "expired" } : booking);
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
  Booking.findOne = async () => booking;
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
  Booking.findOne = async () => booking;
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

test("booking expiration re-reads in transaction, uses session, and preserves deterministic notification keys", async () => {
  const booking = createBooking({ time: "09:00" });
  const session = { id: "expiration-session" };
  let fencedCalls = 0;
  const notificationOptions = [];
  let findOneCalls = 0;

  Booking.find = async () => [booking];
  Booking.findOne = async (query, projection, options) => {
    findOneCalls += 1;
    assert.equal(query._id, booking._id);
    assert.equal(options.session, session);
    return { ...booking };
  };
  Booking.findOneAndUpdate = async (query, update, options) => {
    assert.equal(options.session, session);
    assert.equal(query.bookingDate, booking.bookingDate);
    assert.equal(query.dayKey, booking.dayKey);
    assert.equal(query.time, booking.time);
    return { ...booking, ...(update.$set || {}) };
  };
  Notification.create = async (payload, options) => {
    notificationOptions.push({ payload, options });
    return payload;
  };

  await expirePendingBookings({
    now: new Date("2026-05-07T10:00:00+04:00"),
    leaseContext: {
      withFencedWrite: async (write) => {
        fencedCalls += 1;
        return write({ session, afterCommit() {} });
      },
    },
  });

  assert.equal(fencedCalls, 1);
  assert.equal(findOneCalls, 1);
  assert.equal(notificationOptions.length, 2);
  assert.equal(notificationOptions[0].options.session, session);
  assert.match(notificationOptions[0].payload.internalHash || "", /^[a-f0-9]{64}$/);
});

test("transactional re-read skips future reschedule without writes or notifications", async () => {
  const booking = createBooking({ time: "09:00" });
  const rescheduledBooking = {
    ...booking,
    bookingDate: "2026-05-08",
    dayKey: "2026-05-08",
    time: "12:00",
  };
  let updateCalls = 0;
  let notificationCalls = 0;

  Booking.find = async () => [booking];
  Booking.findOne = async () => rescheduledBooking;
  Booking.findOneAndUpdate = async () => {
    updateCalls += 1;
    return null;
  };
  Notification.create = async () => {
    notificationCalls += 1;
  };

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 0);
  assert.equal(updateCalls, 0);
  assert.equal(notificationCalls, 0);
});

test("transactional re-read skips non-pending status changes without writes", async () => {
  const booking = createBooking({ time: "09:00" });
  let updateCalls = 0;

  Booking.find = async () => [booking];
  Booking.findOne = async () => ({ ...booking, status: "accepted" });
  Booking.findOneAndUpdate = async () => {
    updateCalls += 1;
    return null;
  };
  Notification.create = async () => assert.fail("notification should not be created");

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 0);
  assert.equal(updateCalls, 0);
});

test("missing booking fields use exists-false CAS predicates", async () => {
  const booking = createBooking({ bookingDate: undefined, dayKey: "2026-05-06", time: undefined });

  Booking.find = async () => [booking];
  Booking.findOne = async () => ({ ...booking });
  Booking.findOneAndUpdate = async (query, update) => {
    assert.deepEqual(query.bookingDate, { $exists: false });
    assert.equal(query.dayKey, "2026-05-06");
    assert.deepEqual(query.time, { $exists: false });
    return { ...booking, ...(update.$set || {}) };
  };
  Notification.create = async (payload) => payload;

  const expiredBookings = await expirePendingBookings(
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(expiredBookings.length, 1);
});

test("waitlist processing is awaited inside the fenced expiration transaction", async () => {
  const booking = createBooking({ time: "09:00" });
  let waitlistCalls = 0;
  let createNotificationCalls = 0;
  const session = { id: "expiration-waitlist-session" };
  let afterCommitCalls = 0;

  Booking.find = async () => [booking];
  Booking.findOne = async () => ({ ...booking });
  Booking.findOneAndUpdate = async (query, update) =>
    ({ ...booking, ...(update.$set || {}) });
  Notification.create = async (payload) => {
    createNotificationCalls += 1;
    return payload;
  };
  __bookingExpirationTestHooks.setNotifyMatchingWaitlistEntries(async (payload) => {
    waitlistCalls += 1;
    assert.equal(payload.session, session);
    assert.equal(typeof payload.afterCommit, "function");
    assert.equal(payload.now.toISOString(), "2026-05-07T06:00:00.000Z");
    assert.equal(payload.date, booking.bookingDate);
    assert.equal(payload.serviceId, booking.serviceId);
    return 1;
  });

  const expiredBookings = await expirePendingBookings({
    now: new Date("2026-05-07T10:00:00+04:00"),
    leaseContext: {
      withFencedWrite: async (write) => {
        const result = await write({
          session,
          afterCommit() {
            afterCommitCalls += 1;
          },
        });
        assert.equal(waitlistCalls, 1);
        return result;
      },
    },
  });

  assert.equal(expiredBookings.length, 1);
  assert.equal(createNotificationCalls, 2);
  assert.equal(waitlistCalls, 1);
  assert.equal(afterCommitCalls, 2);
});

test("waitlist failure aborts booking expiration and propagates", async () => {
  const booking = createBooking({ time: "09:00" });
  const error = new Error("waitlist failed");
  let updateCalls = 0;

  Booking.find = async () => [booking];
  Booking.findOne = async () => ({ ...booking });
  Booking.findOneAndUpdate = async (query, update) => {
    updateCalls += 1;
    return { ...booking, ...(update.$set || {}) };
  };
  Notification.create = async (payload) => payload;
  __bookingExpirationTestHooks.setNotifyMatchingWaitlistEntries(async () => {
    throw error;
  });

  await assert.rejects(
    () => expirePendingBookings(new Date("2026-05-07T10:00:00+04:00")),
    error
  );
  assert.equal(updateCalls, 1);
});
