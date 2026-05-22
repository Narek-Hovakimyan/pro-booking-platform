import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import WaitlistEntry from "../models/WaitlistEntry.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import {
  barberId,
  clientId,
  createMockEntry,
  futureDate,
  otherClientId,
  resetWaitlistServiceModelMocks,
  serviceId,
} from "./waitlistService.testUtils.js";
import { acceptWaitlistOffer } from "./waitlistService.js";

afterEach(() => {
  resetWaitlistServiceModelMocks();
});

test("client can accept own offered waitlist entry", async () => {
  const entry = createMockEntry({
    _id: "accept-entry",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  let bookingCreated = null;
  let notificationCreated = null;

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-entry" && String(query.clientId) === clientId && query.status === "offered") {
      return entry;
    }
    if (String(query._id) === "accept-entry") return null;
    return null;
  };
  let claimed = false;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered" && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    return null;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Client Name" };
      if (String(id) === String(barberId)) return { _id: barberId, name: "Barber", role: "barber" };
      return null;
    },
  });
  Service.findOne = async () => ({ _id: serviceId, barberId, name: "Haircut", duration: 30, price: 50 });
  Salon.findById = async () => null;
  Booking.find = async () => [];
  Booking.create = async (payload) => {
    bookingCreated = { _id: "new-booking", ...payload };
    return bookingCreated;
  };
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  const result = await acceptWaitlistOffer({ entryId: "accept-entry", clientId });

  assert.ok(result.booking);
  assert.equal(result.entry.status, "converted");
  assert.equal(result.entry.convertedBooking, "new-booking");
  assert.equal(bookingCreated.status, "accepted");
  assert.equal(bookingCreated.createdBy, "barber");
  assert.equal(bookingCreated.time, "14:00");
});

test("accept creates accepted Booking", async () => {
  const entry = createMockEntry({
    _id: "accept-create-booking",
    status: "offered",
    offeredTime: "15:00",
    offeredAt: new Date(),
  });
  let bookingCreated = null;

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-create-booking" && query.status === "offered") return entry;
    return null;
  };
  let claimed = false;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered" && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    return null;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Client" };
      if (String(id) === String(barberId)) return { _id: barberId, name: "Barber", role: "barber" };
      return null;
    },
  });
  Service.findOne = async () => ({ _id: serviceId, barberId, name: "Haircut", duration: 30, price: 50 });
  Salon.findById = async () => null;
  Booking.find = async () => [];
  Booking.create = async (payload) => {
    bookingCreated = { _id: "booking-123", ...payload };
    return bookingCreated;
  };
  Notification.create = async (payload) => payload;

  await acceptWaitlistOffer({ entryId: "accept-create-booking", clientId });

  assert.ok(bookingCreated);
  assert.equal(bookingCreated.status, "accepted");
  assert.equal(bookingCreated.createdBy, "barber");
  assert.equal(bookingCreated.clientId, clientId);
  assert.equal(bookingCreated.barberId, barberId);
  assert.equal(bookingCreated.time, "15:00");
});

test("accept marks waitlist converted and stores convertedBooking", async () => {
  const entry = createMockEntry({
    _id: "accept-convert",
    status: "offered",
    offeredTime: "10:00",
    offeredAt: new Date(),
  });

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-convert" && query.status === "offered") return entry;
    return null;
  };
  let claimed = false;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered" && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    return null;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Client" };
      if (String(id) === String(barberId)) return { _id: barberId, name: "Barber", role: "barber" };
      return null;
    },
  });
  Service.findOne = async () => ({ _id: serviceId, barberId, name: "Haircut", duration: 30, price: 50 });
  Salon.findById = async () => null;
  Booking.find = async () => [];
  Booking.create = async (payload) => ({ _id: "booking-456", ...payload });
  Notification.create = async (payload) => payload;

  const result = await acceptWaitlistOffer({ entryId: "accept-convert", clientId });

  assert.equal(result.entry.status, "converted");
  assert.ok(result.entry.convertedAt);
  assert.equal(result.entry.convertedBooking, "booking-456");
});

test("accept sends barber notification", async () => {
  const entry = createMockEntry({
    _id: "accept-notif-barber",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  let barberNotification = null;

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-notif-barber" && query.status === "offered") return entry;
    return null;
  };
  let claimed = false;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered" && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    return null;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Test Client" };
      if (String(id) === String(barberId)) return { _id: barberId, name: "Barber", role: "barber" };
      return null;
    },
  });
  Service.findOne = async () => ({ _id: serviceId, barberId, name: "Haircut", duration: 30, price: 50 });
  Salon.findById = async () => null;
  Booking.find = async () => [];
  Booking.create = async (payload) => ({ _id: "booking-notif", ...payload });
  Notification.create = async (payload) => {
    barberNotification = payload;
    return payload;
  };

  await acceptWaitlistOffer({ entryId: "accept-notif-barber", clientId });

  assert.ok(barberNotification);
  assert.equal(barberNotification.userId, barberId);
  assert.equal(barberNotification.type, "waitlist_accepted");
  assert.ok(barberNotification.message.includes("Test Client"));
});

test("accept succeeds if barber notification fails after booking and conversion", async () => {
  const entry = createMockEntry({
    _id: "accept-notif-fail",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  const logs = [];

  console.warn = (...args) => logs.push(args);
  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-notif-fail" && query.status === "offered") return entry;
    return null;
  };
  let claimed = false;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered" && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    return null;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Test Client" };
      if (String(id) === String(barberId)) return { _id: barberId, name: "Barber", role: "barber" };
      return null;
    },
  });
  Service.findOne = async () => ({ _id: serviceId, barberId, name: "Haircut", duration: 30, price: 50 });
  Salon.findById = async () => null;
  Booking.find = async () => [];
  Booking.create = async (payload) => ({ _id: "booking-notif-fail", ...payload });
  Notification.create = async () => {
    throw new Error("notification service unavailable");
  };

  const result = await acceptWaitlistOffer({ entryId: "accept-notif-fail", clientId });

  assert.equal(result.entry.status, "converted");
  assert.equal(result.entry.convertedBooking, "booking-notif-fail");
  assert.equal(result.booking.status, "accepted");
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "Waitlist notification failed (non-fatal):");
  assert.equal(logs[0][1], "notification service unavailable");
});

test("client cannot accept someone else's offer", async () => {
  WaitlistEntry.findOne = async (query) => {
    if (String(query.clientId) === otherClientId) return null;
    return null;
  };

  await assert.rejects(
    () => acceptWaitlistOffer({ entryId: "other-client-entry", clientId: otherClientId }),
    (err) => {
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});

test("accept rejects if status is not offered", async () => {
  const entry = createMockEntry({ _id: "accept-wrong-status", status: "active", offeredTime: "14:00" });

  WaitlistEntry.findOne = async () => {
    return null;
  };

  await assert.rejects(
    () => acceptWaitlistOffer({ entryId: "accept-wrong-status", clientId }),
    (err) => {
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});

test("accept re-checks overlap and does not create Booking if time is taken", async () => {
  const entry = createMockEntry({
    _id: "accept-overlap",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-overlap" && query.status === "offered") return entry;
    return null;
  };
  let claimed = false;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered" && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    return null;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Client" };
      if (String(id) === String(barberId)) return { _id: barberId, name: "Barber", role: "barber" };
      return null;
    },
  });
  Service.findOne = async () => ({ _id: serviceId, barberId, name: "Haircut", duration: 30, price: 50 });
  Salon.findById = async () => null;
  Booking.find = async () => [
    { status: "accepted", bookingDate: futureDate, time: "14:15", duration: 30 },
  ];
  let bookingCreated = false;
  Booking.create = async () => {
    bookingCreated = true;
    return null;
  };

  await assert.rejects(
    () => acceptWaitlistOffer({ entryId: "accept-overlap", clientId }),
    /This time is already booked/
  );

  assert.equal(bookingCreated, false);
});

test("overlap failure restores entry to offered", async () => {
  const entry = createMockEntry({
    _id: "accept-restore",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-restore" && query.status === "offered") return entry;
    return null;
  };
  let findOneAndUpdateCalls = [];
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    findOneAndUpdateCalls.push({ query, update: update.$set });
    if (query.status === "offered") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    return null;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Client" };
      if (String(id) === String(barberId)) return { _id: barberId, name: "Barber", role: "barber" };
      return null;
    },
  });
  Service.findOne = async () => ({ _id: serviceId, barberId, name: "Haircut", duration: 30, price: 50 });
  Salon.findById = async () => null;
  Booking.find = async () => [
    { status: "accepted", bookingDate: futureDate, time: "14:15", duration: 30 },
  ];
  Booking.create = async () => null;

  await assert.rejects(
    () => acceptWaitlistOffer({ entryId: "accept-restore", clientId }),
    /This time is already booked/
  );

  const restoreCall = findOneAndUpdateCalls.find(
    (call) => call.update && call.update.status === "offered"
  );
  assert.ok(restoreCall, "entry was restored to offered");
});
