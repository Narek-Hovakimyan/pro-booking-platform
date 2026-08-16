import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import WaitlistEntry from "../../models/WaitlistEntry.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import Service from "../../models/Service.js";
import User from "../../models/User.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import {
  barberId,
  clientId,
  createMockEntry,
  futureDate,
  installWaitlistTestClock,
  otherClientId,
  resetWaitlistServiceModelMocks,
  resetWaitlistTestClock,
  serviceId,
} from "./waitlistService.testUtils.js";
import {
  __bookingSlotHoldServiceTestHooks,
  BookingSlotProtectionUnavailableError,
} from "../booking/bookingSlotHoldService.js";
import { acceptWaitlistOffer, approveWaitlistEntry } from "./waitlistService.js";
import { __waitlistNotificationTestHooks } from "./waitlistNotificationService.js";
import { getLogger } from "../../config/logger.js";
import * as waitlistConversionService from "./waitlistConversionService.js";

const mockBarberPaidAccess = () => {
  Subscription.findOne = async () => ({
    _id: "sub-1",
    ownerType: "barber",
    ownerId: barberId,
    status: "active",
  });
  SubscriptionSeat.findOne = () => ({
    populate: async () => null,
  });
};

const createBookingResult = (payload, overrides = {}) => {
  const bookingPayload = Array.isArray(payload) ? payload[0] : payload;
  const booking = { ...bookingPayload, ...overrides };
  return Array.isArray(payload) ? [booking] : booking;
};

const originalSlotHoldMethods = {
  deleteMany: BookingSlotHold.deleteMany,
  indexesReady: __bookingSlotHoldServiceTestHooks.indexesReady,
  supportsTransactions: __bookingSlotHoldServiceTestHooks.supportsTransactions,
  startSession: __bookingSlotHoldServiceTestHooks.startSession,
};
const rollbackLogger = getLogger();
const originalRollbackLoggerWarn = rollbackLogger.warn;

beforeEach(() => {
  installWaitlistTestClock();
});

afterEach(() => {
  resetWaitlistTestClock();
  resetWaitlistServiceModelMocks();
  BookingSlotHold.deleteMany = originalSlotHoldMethods.deleteMany;
  __bookingSlotHoldServiceTestHooks.indexesReady = originalSlotHoldMethods.indexesReady;
  __bookingSlotHoldServiceTestHooks.supportsTransactions =
    originalSlotHoldMethods.supportsTransactions;
  __bookingSlotHoldServiceTestHooks.startSession = originalSlotHoldMethods.startSession;
  __waitlistNotificationTestHooks.resetLogger();
  rollbackLogger.warn = originalRollbackLoggerWarn;
});

const installProtectionUnavailableHooks = (startSession) => {
  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  __bookingSlotHoldServiceTestHooks.startSession = startSession;
};

test("client can accept own offered waitlist entry", async () => {
  mockBarberPaidAccess();
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
    const result = createBookingResult(payload, { _id: "new-booking" });
    bookingCreated = Array.isArray(result) ? result[0] : result;
    return result;
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
  mockBarberPaidAccess();
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
    const result = createBookingResult(payload, { _id: "booking-123" });
    bookingCreated = Array.isArray(result) ? result[0] : result;
    return result;
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
  mockBarberPaidAccess();
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
  Booking.create = async (payload) =>
    createBookingResult(payload, { _id: "booking-456" });
  Notification.create = async (payload) => payload;

  const result = await acceptWaitlistOffer({ entryId: "accept-convert", clientId });

  assert.equal(result.entry.status, "converted");
  assert.ok(result.entry.convertedAt);
  assert.equal(result.entry.convertedBooking, "booking-456");
});

test("accept sends barber notification", async () => {
  mockBarberPaidAccess();
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
  Booking.create = async (payload) =>
    createBookingResult(payload, { _id: "booking-notif" });
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
  mockBarberPaidAccess();
  const entry = createMockEntry({
    _id: "accept-notif-fail",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  const logs = [];

  __waitlistNotificationTestHooks.setLogger({
    warn(payload, message) {
      logs.push({ payload, message });
    },
  });
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
  Booking.create = async (payload) =>
    createBookingResult(payload, { _id: "booking-notif-fail" });
  Notification.create = async () => {
    throw new Error("notification service unavailable");
  };

  const result = await acceptWaitlistOffer({ entryId: "accept-notif-fail", clientId });

  assert.equal(result.entry.status, "converted");
  assert.equal(result.entry.convertedBooking, "booking-notif-fail");
  assert.equal(result.booking.status, "accepted");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, "waitlist.notification_failed");
  assert.equal(logs[0].payload.event, "waitlist.notification_failed");
  assert.equal(logs[0].payload.err.message, "notification service unavailable");
  assert.deepEqual(Object.keys(logs[0].payload).sort(), ["err", "event"]);
});

test("acceptWaitlistOffer fails closed with 503 when slot protection is unavailable", async () => {
  mockBarberPaidAccess();
  const entry = createMockEntry({
    _id: "accept-protection-unavailable",
    status: "offered",
    offeredTime: "14:00",
    offeredAt: new Date(),
  });
  let bookingCreated = 0;
  let notificationCreated = 0;
  let holdWrites = 0;
  let holdDeletes = 0;
  let restoreCalls = 0;

  installProtectionUnavailableHooks(async () => ({
    async withTransaction() {
      throw new Error("transaction setup failed");
    },
    async endSession() {},
  }));

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === String(entry._id) && query.status === "offered") {
      return entry;
    }
    return null;
  };
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered") {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      restoreCalls += 1;
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
  Booking.create = async () => {
    bookingCreated += 1;
    return null;
  };
  BookingSlotHold.bulkWrite = async () => {
    holdWrites += 1;
  };
  BookingSlotHold.insertMany = async () => {
    holdWrites += 1;
  };
  BookingSlotHold.deleteMany = async () => {
    holdDeletes += 1;
  };
  Notification.create = async () => {
    notificationCreated += 1;
    return null;
  };

  await assert.rejects(
    () => acceptWaitlistOffer({ entryId: entry._id, clientId }),
    (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.message, "Booking slot protection is temporarily unavailable");
      assert.equal(error instanceof BookingSlotProtectionUnavailableError, true);
      return true;
    }
  );

  assert.equal(bookingCreated, 0);
  assert.equal(notificationCreated, 0);
  assert.equal(holdWrites, 0);
  assert.equal(holdDeletes, 0);
  assert.equal(restoreCalls, 1);
});

test("approveWaitlistEntry fails closed with 503 when slot protection is unavailable", async () => {
  mockBarberPaidAccess();
  const entry = createMockEntry({
    _id: "approve-protection-unavailable",
    status: "active",
    offeredTime: "",
    offeredAt: null,
  });
  let bookingCreated = 0;
  let notificationCreated = 0;
  let holdWrites = 0;
  let holdDeletes = 0;
  let restoreCalls = 0;

  installProtectionUnavailableHooks(async () => ({
    async withTransaction() {
      throw new Error("transaction setup failed");
    },
    async endSession() {},
  }));

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === String(entry._id)) {
      return entry;
    }
    return null;
  };
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status?.$in?.includes(entry.status)) {
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      restoreCalls += 1;
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
  Booking.create = async () => {
    bookingCreated += 1;
    return null;
  };
  BookingSlotHold.bulkWrite = async () => {
    holdWrites += 1;
  };
  BookingSlotHold.insertMany = async () => {
    holdWrites += 1;
  };
  BookingSlotHold.deleteMany = async () => {
    holdDeletes += 1;
  };
  Notification.create = async () => {
    notificationCreated += 1;
    return null;
  };

  await assert.rejects(
    () => approveWaitlistEntry({ entryId: entry._id, barberId, time: "14:00" }),
    (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.message, "Booking slot protection is temporarily unavailable");
      assert.equal(error instanceof BookingSlotProtectionUnavailableError, true);
      return true;
    }
  );

  assert.equal(bookingCreated, 0);
  assert.equal(notificationCreated, 0);
  assert.equal(holdWrites, 0);
  assert.equal(holdDeletes, 0);
  assert.equal(restoreCalls, 1);
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
  mockBarberPaidAccess();
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
  mockBarberPaidAccess();
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

test("accept rejects stale claim when offer disappears before conversion", async () => {
  mockBarberPaidAccess();
  const entry = createMockEntry({
    _id: "accept-stale-claim",
    status: "offered",
    offeredTime: "15:00",
    offeredAt: new Date(),
  });
  let bookingCreated = 0;

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-stale-claim" && query.status === "offered") return entry;
    return null;
  };
  WaitlistEntry.findOneAndUpdate = async (query) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.status === "offered") return null;
    return entry;
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
  Booking.create = async () => {
    bookingCreated += 1;
    return null;
  };

  await assert.rejects(
    () => acceptWaitlistOffer({ entryId: "accept-stale-claim", clientId }),
    (err) => {
      assert.equal(err.code, "CONFLICT");
      return true;
    }
  );

  assert.equal(bookingCreated, 0);
  assert.equal(entry.status, "offered");
});

test("accept restores offered entry when booking creation fails", async () => {
  mockBarberPaidAccess();
  const entry = createMockEntry({
    _id: "accept-rollback",
    status: "offered",
    offeredTime: "15:30",
    offeredAt: new Date(),
  });

  WaitlistEntry.findOne = async (query) => {
    if (String(query._id) === "accept-rollback" && query.status === "offered") return entry;
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
  Booking.create = async () => {
    throw new Error("booking write failed");
  };

  await assert.rejects(
    () => acceptWaitlistOffer({ entryId: "accept-rollback", clientId }),
    /booking write failed/
  );

  assert.equal(entry.status, "offered");
  assert.equal(entry.convertedBooking, null);
});

const installRollbackCleanupFailureScenario = ({
  mode,
  failingOperation,
  loggerThrows = false,
  logger,
}) => {
  mockBarberPaidAccess();

  const entry = createMockEntry({
    _id: `${mode}-${failingOperation}-entry`,
    status: mode === "accept" ? "offered" : "active",
    offeredTime: mode === "accept" ? "11:00" : "",
    offeredAt: mode === "accept" ? new Date() : null,
  });
  entry.salonId = "salon-rollback";
  entry.serviceId = serviceId;

  let bookingDeleteCalls = 0;
  let releaseCalls = 0;
  let bookingCreateCalls = 0;
  let restoreCalls = 0;
  let notificationCalls = 0;
  const logs = [];
  const bookingId = mode === "accept"
    ? failingOperation === "delete_booking"
      ? "64b000000000000000000101"
      : "64b000000000000000000102"
    : failingOperation === "delete_booking"
      ? "64b000000000000000000103"
      : "64b000000000000000000104";
  const sessions = [];
  let endedSessionCleanupCalls = 0;
  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  __bookingSlotHoldServiceTestHooks.startSession = async () => {
    const session = {
      ended: false,
      async withTransaction(task) {
        await task({ session });
      },
      async endSession() {
        session.ended = true;
      },
    };
    sessions.push(session);
    return session;
  };
  if (logger === null) {
    rollbackLogger.warn = undefined;
  } else {
    rollbackLogger.warn = (payload, message) => {
      logs.push({ payload, message });
      if (loggerThrows) {
        throw new Error("logger failed");
      }
    };
  }

  WaitlistEntry.findOne = async (query) => {
    if (mode === "accept" && String(query._id) === String(entry._id) && query.status === "offered") {
      return entry;
    }
    if (mode === "approve" && String(query._id) === String(entry._id)) {
      return entry;
    }
    return null;
  };

  let claimed = false;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (mode === "accept" && query.status === "offered" && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (mode === "approve" && query.status?.$in?.includes("active") && !claimed) {
      claimed = true;
      Object.assign(entry, update.$set || {});
      return entry;
    }
    if (query.status === "converting") {
      if (Object.prototype.hasOwnProperty.call(update.$set || {}, "convertedBooking")) {
        return null;
      }
      restoreCalls += 1;
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
  Salon.findById = async (id) =>
    String(id) === "salon-rollback" ? { _id: "salon-rollback", name: "Rollback Salon" } : null;
  Booking.find = async () => [];
  Booking.create = async (payload) => {
    bookingCreateCalls += 1;
    return createBookingResult(payload, { _id: bookingId });
  };
  Booking.findByIdAndDelete = async (id, options) => {
    bookingDeleteCalls += 1;
    if (!options?.session || options.session.ended) endedSessionCleanupCalls += 1;
    if (failingOperation === "delete_booking") {
      throw Object.assign(new Error("/tmp/private/path"), {
        code: "EACCES",
        stack: "stack /tmp/private/path",
      });
    }
    return { _id: bookingId };
  };
  BookingSlotHold.deleteMany = async (query, options) => {
    releaseCalls += 1;
    if (!options?.session || options.session.ended) endedSessionCleanupCalls += 1;
    if (failingOperation === "release_slot_holds") {
      throw Object.assign(new Error("../secret/holds"), {
        code: "ENOENT",
        stack: "stack ../secret/holds",
      });
    }
    return { acknowledged: true };
  };
  Notification.create = async () => {
    notificationCalls += 1;
    return null;
  };

  return {
    entry,
    logs,
    bookingId,
    getCounts() {
      return {
        bookingCreateCalls,
        bookingDeleteCalls,
        releaseCalls,
        restoreCalls,
        notificationCalls,
        sessions: sessions.length,
        endedSessionCleanupCalls,
      };
    },
  };
};

const runRollbackCleanupFailureFlow = ({ mode, failingOperation, loggerThrows = false, logger }) => {
  const scenario = installRollbackCleanupFailureScenario({
    mode,
    failingOperation,
    loggerThrows,
    logger,
  });
  const action = mode === "accept"
    ? acceptWaitlistOffer({ entryId: scenario.entry._id, clientId })
    : approveWaitlistEntry({ entryId: scenario.entry._id, barberId, time: "11:00" });
  return { scenario, action };
};

for (const mode of ["accept", "approve"]) {
  for (const failingOperation of ["delete_booking", "release_slot_holds"]) {
    test(`${mode} logs rollback cleanup failure for ${failingOperation} and preserves rollback state`, async () => {
      const { scenario, action } = runRollbackCleanupFailureFlow({ mode, failingOperation });

      await assert.rejects(
        () => action,
        (error) => {
          assert.equal(error.code, "CONFLICT");
          assert.equal(error.message, "Waitlist entry could not be converted");
          return true;
        }
      );

      const counts = scenario.getCounts();
      assert.equal(counts.bookingCreateCalls, 1);
      assert.equal(counts.bookingDeleteCalls, 1);
      assert.equal(counts.releaseCalls, 1);
      assert.equal(counts.restoreCalls, 1);
      assert.equal(counts.notificationCalls, 0);
      assert.equal(counts.sessions, 2);
      assert.equal(counts.endedSessionCleanupCalls, 0);
      assert.equal(scenario.entry.status, mode === "accept" ? "offered" : "active");
      assert.equal(scenario.entry.convertedBooking, null);
      const matchingLog = scenario.logs.find(
        ({ payload }) => payload.operation === failingOperation
      );
      assert.ok(matchingLog);
      assert.equal(matchingLog.message, "waitlist.rollback_cleanup_failed");
      assert.deepEqual(matchingLog.payload, {
        err: { name: "Error" },
        event: "waitlist.rollback_cleanup_failed",
        operation: failingOperation,
        waitlistEntryId: scenario.entry._id,
        bookingId: scenario.bookingId,
        barberId,
        salonId: "salon-rollback",
        serviceId,
      });
      assert.equal(JSON.stringify(scenario.logs).includes("/tmp/private/path"), false);
      assert.equal(JSON.stringify(scenario.logs).includes("../secret/holds"), false);
    });
  }
}

test("accept rollback cleanup logging failure does not mask original error", async () => {
  const { scenario, action } = runRollbackCleanupFailureFlow({
    mode: "approve",
    failingOperation: "delete_booking",
    loggerThrows: true,
  });

  await assert.rejects(
    () => action,
    (error) => {
      assert.equal(error.code, "CONFLICT");
      assert.equal(error.message, "Waitlist entry could not be converted");
      return true;
    }
  );

  const counts = scenario.getCounts();
  assert.equal(counts.bookingCreateCalls, 1);
  assert.equal(counts.bookingDeleteCalls, 1);
  assert.equal(counts.releaseCalls, 1);
  assert.equal(counts.restoreCalls, 1);
  assert.equal(counts.notificationCalls, 0);
  assert.equal(counts.sessions, 2);
  assert.equal(counts.endedSessionCleanupCalls, 0);
  assert.equal(scenario.entry.status, "active");
  assert.equal(scenario.logs.length, 1);
});

test("approve rollback cleanup succeeds when rollback logger is absent", async () => {
  const { scenario, action } = runRollbackCleanupFailureFlow({
    mode: "approve",
    failingOperation: "release_slot_holds",
    logger: null,
  });

  await assert.rejects(
    () => action,
    (error) => {
      assert.equal(error.code, "CONFLICT");
      assert.equal(error.message, "Waitlist entry could not be converted");
      return true;
    }
  );

  const counts = scenario.getCounts();
  assert.equal(counts.bookingCreateCalls, 1);
  assert.equal(counts.bookingDeleteCalls, 1);
  assert.equal(counts.releaseCalls, 1);
  assert.equal(counts.restoreCalls, 1);
  assert.equal(counts.notificationCalls, 0);
  assert.equal(counts.sessions, 2);
  assert.equal(counts.endedSessionCleanupCalls, 0);
  assert.equal(scenario.entry.status, "active");
  assert.equal(scenario.logs.length, 0);
});

test("rollback cleanup does not add a production test hook export", () => {
  assert.equal("__waitlistConversionTestHooks" in waitlistConversionService, false);
});
