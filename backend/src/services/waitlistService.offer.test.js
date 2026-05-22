import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import WaitlistEntry from "../models/WaitlistEntry.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import {
  barberId,
  clientId,
  createMockEntry,
  otherBarberId,
  resetWaitlistServiceModelMocks,
} from "./waitlistService.testUtils.js";
import { offerWaitlistEntry } from "./waitlistService.js";

afterEach(() => {
  resetWaitlistServiceModelMocks();
});

test("barber can offer time for own active waitlist entry", async () => {
  const entry = createMockEntry({ _id: "offer-entry" });
  let notificationCreated = null;

  WaitlistEntry.findById = async () => entry;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (String(query.barberId) !== String(entry.barberId)) return null;
    if (Array.isArray(query.status?.$in) && !query.status.$in.includes(entry.status)) return null;
    Object.assign(entry, update.$set || {});
    return entry;
  };
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  const offered = await offerWaitlistEntry({
    entryId: "offer-entry",
    barberId,
    time: "14:00",
  });

  assert.equal(offered.status, "offered");
  assert.equal(offered.offeredTime, "14:00");
  assert.ok(offered.offeredAt);
  assert.ok(notificationCreated);
  assert.equal(notificationCreated.userId, clientId);
  assert.equal(notificationCreated.type, "waitlist_offered");
});

test("barber can offer time for notified waitlist entry", async () => {
  const entry = createMockEntry({ _id: "offer-notified-entry", status: "notified" });
  let notificationCreated = null;

  WaitlistEntry.findById = async () => entry;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (String(query.barberId) !== String(entry.barberId)) return null;
    if (Array.isArray(query.status?.$in) && !query.status.$in.includes(entry.status)) return null;
    Object.assign(entry, update.$set || {});
    return entry;
  };
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  const offered = await offerWaitlistEntry({
    entryId: "offer-notified-entry",
    barberId,
    time: "10:30",
  });

  assert.equal(offered.status, "offered");
  assert.equal(offered.offeredTime, "10:30");
  assert.ok(offered.offeredAt);
  assert.ok(notificationCreated);
});

test("non-owner barber cannot offer", async () => {
  WaitlistEntry.findById = async () => createMockEntry({ _id: "offer-entry-other" });

  await assert.rejects(
    () => offerWaitlistEntry({ entryId: "offer-entry-other", barberId: otherBarberId, time: "14:00" }),
    (err) => {
      assert.equal(err.code, "FORBIDDEN");
      return true;
    }
  );
});

test("offer does not create Booking", async () => {
  const entry = createMockEntry({ _id: "offer-no-booking" });
  let bookingCreated = false;

  WaitlistEntry.findById = async () => entry;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    Object.assign(entry, update.$set || {});
    return entry;
  };
  Notification.create = async (payload) => payload;
  Booking.create = async () => {
    bookingCreated = true;
    return null;
  };

  await offerWaitlistEntry({ entryId: "offer-no-booking", barberId, time: "14:00" });

  assert.equal(bookingCreated, false);
});

test("offer sets status offered, offeredTime, offeredAt", async () => {
  const entry = createMockEntry({ _id: "offer-sets-fields" });
  const before = Date.now();

  WaitlistEntry.findById = async () => entry;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    Object.assign(entry, update.$set || {});
    return entry;
  };
  Notification.create = async (payload) => payload;

  const offered = await offerWaitlistEntry({ entryId: "offer-sets-fields", barberId, time: "16:00" });

  assert.equal(offered.status, "offered");
  assert.equal(offered.offeredTime, "16:00");
  assert.ok(offered.offeredAt);
  assert.ok(offered.offeredAt.getTime() >= before);
});

test("offer sends client notification", async () => {
  const entry = createMockEntry({ _id: "offer-notif" });
  let notificationCreated = null;

  WaitlistEntry.findById = async () => entry;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    Object.assign(entry, update.$set || {});
    return entry;
  };
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  await offerWaitlistEntry({ entryId: "offer-notif", barberId, time: "11:00" });

  assert.ok(notificationCreated);
  assert.equal(notificationCreated.userId, clientId);
  assert.equal(notificationCreated.type, "waitlist_offered");
  assert.ok(notificationCreated.message.includes("confirm or decline"));
});

test("offer rejects invalid time format", async () => {
  await assert.rejects(
    () => offerWaitlistEntry({ entryId: "invalid-time", barberId, time: "not-a-time" }),
    (err) => {
      assert.equal(err.code, "VALIDATION_ERROR");
      return true;
    }
  );
});

test("offer rejects if status is not active or notified", async () => {
  const entry = createMockEntry({ _id: "offer-wrong-status", status: "converted" });

  WaitlistEntry.findById = async () => entry;

  await assert.rejects(
    () => offerWaitlistEntry({ entryId: "offer-wrong-status", barberId, time: "14:00" }),
    (err) => {
      assert.equal(err.code, "INVALID_STATUS");
      return true;
    }
  );
});

test("offer succeeds even if client notification fails after status becomes offered", async () => {
  const entry = createMockEntry({ _id: "offer-notif-fail" });
  const logs = [];

  console.warn = (...args) => logs.push(args);
  WaitlistEntry.findById = async () => entry;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    Object.assign(entry, update.$set || {});
    return entry;
  };
  Notification.create = async () => {
    throw new Error("notification service unavailable");
  };

  const offered = await offerWaitlistEntry({ entryId: "offer-notif-fail", barberId, time: "14:00" });

  assert.equal(offered.status, "offered");
  assert.equal(offered.offeredTime, "14:00");
  assert.ok(offered.offeredAt);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "Waitlist notification failed (non-fatal):");
  assert.equal(logs[0][1], "notification service unavailable");
});
