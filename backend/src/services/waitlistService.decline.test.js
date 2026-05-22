import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import WaitlistEntry from "../models/WaitlistEntry.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import {
  barberId,
  clientId,
  createMockEntry,
  otherClientId,
  resetWaitlistServiceModelMocks,
} from "./waitlistService.testUtils.js";
import { declineWaitlistOffer } from "./waitlistService.js";

afterEach(() => {
  resetWaitlistServiceModelMocks();
});

test("client can decline own offered waitlist entry", async () => {
  const entry = createMockEntry({
    _id: "decline-entry",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  let barberNotification = null;

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "decline-entry" && String(query.clientId) === clientId && query.status === "offered") {
      return entry;
    }
    return null;
  };
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (String(query.clientId) !== String(clientId)) return null;
    if (query.status !== "offered") return null;
    Object.assign(entry, update.$set || {});
    return entry;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Declining Client" };
      return { _id: barberId };
    },
  });
  Notification.create = async (payload) => {
    barberNotification = payload;
    return payload;
  };

  const declined = await declineWaitlistOffer({ entryId: "decline-entry", clientId });

  assert.equal(declined.status, "rejected");
  assert.ok(declined.rejectedAt);
});

test("decline marks rejected and sends barber notification", async () => {
  const entry = createMockEntry({
    _id: "decline-notif",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  let barberNotification = null;

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "decline-notif" && query.status === "offered" && String(query.clientId) === clientId) {
      return entry;
    }
    return null;
  };
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status !== "offered") return null;
    Object.assign(entry, update.$set || {});
    return entry;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Declining Client" };
      return { _id: barberId, name: "Barber" };
    },
  });
  Notification.create = async (payload) => {
    barberNotification = payload;
    return payload;
  };

  await declineWaitlistOffer({ entryId: "decline-notif", clientId });

  assert.ok(barberNotification);
  assert.equal(barberNotification.userId, barberId);
  assert.equal(barberNotification.type, "waitlist_declined");
  assert.ok(barberNotification.message.includes("Declining Client"));
});

test("decline succeeds if barber notification fails after rejected", async () => {
  const entry = createMockEntry({
    _id: "decline-notif-fail",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  const logs = [];

  console.warn = (...args) => logs.push(args);
  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "decline-notif-fail" && query.status === "offered" && String(query.clientId) === clientId) {
      return entry;
    }
    return null;
  };
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status !== "offered") return null;
    Object.assign(entry, update.$set || {});
    return entry;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Declining Client" };
      return { _id: barberId, name: "Barber" };
    },
  });
  Notification.create = async () => {
    throw new Error("notification service unavailable");
  };

  const declined = await declineWaitlistOffer({ entryId: "decline-notif-fail", clientId });

  assert.equal(declined.status, "rejected");
  assert.ok(declined.rejectedAt);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "Waitlist notification failed (non-fatal):");
  assert.equal(logs[0][1], "notification service unavailable");
});

test("declined offer creates no Booking", async () => {
  const entry = createMockEntry({
    _id: "decline-no-booking",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  let bookingCreated = false;

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "decline-no-booking" && query.status === "offered") return entry;
    return null;
  };
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    Object.assign(entry, update.$set || {});
    return entry;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Declining Client" };
      return { _id: barberId, name: "Barber" };
    },
  });
  Notification.create = async (payload) => payload;
  Booking.create = async () => {
    bookingCreated = true;
    return null;
  };

  await declineWaitlistOffer({ entryId: "decline-no-booking", clientId });

  assert.equal(bookingCreated, false);
  assert.equal(entry.status, "rejected");
});

test("client cannot decline someone else's offer", async () => {
  WaitlistEntry.findOne = async (query) => {
    if (String(query.clientId) === otherClientId) return null;
    return null;
  };

  await assert.rejects(
    () => declineWaitlistOffer({ entryId: "other-decline", clientId: otherClientId }),
    (err) => {
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});

test("decline rejects if status is not offered", async () => {
  WaitlistEntry.findOne = async () => {
    return null;
  };

  await assert.rejects(
    () => declineWaitlistOffer({ entryId: "decline-wrong-status", clientId }),
    (err) => {
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});
