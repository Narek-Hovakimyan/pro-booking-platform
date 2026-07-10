import assert from "node:assert/strict";

import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import WaitlistEntry from "../../models/WaitlistEntry.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import Service from "../../models/Service.js";
import User from "../../models/User.js";

export const clientId = "64b000000000000000000001";
export const otherClientId = "64b000000000000000000002";
export const barberId = "64b000000000000000000010";
export const otherBarberId = "64b000000000000000000011";
export const salonId = "64b000000000000000000020";
export const otherSalonId = "64b000000000000000000021";
export const serviceId = "64b000000000000000000030";
export const otherServiceId = "64b000000000000000000031";
export const futureDate = "2026-08-15";
export const beyondHorizonDate = "2099-06-15";
export const pastDate = "2020-01-01";
export const waitlistEntryId = "64b000000000000000000040";

const originalMethods = {
  waitlistFind: WaitlistEntry.find,
  waitlistFindOne: WaitlistEntry.findOne,
  waitlistCreate: WaitlistEntry.create,
  waitlistFindById: WaitlistEntry.findById,
  waitlistFindOneAndUpdate: WaitlistEntry.findOneAndUpdate,
  waitlistPopulate: WaitlistEntry.populate,
  bookingFind: Booking.find,
  bookingCreate: Booking.create,
  notificationCreate: Notification.create,
  salonFindById: Salon.findById,
  serviceFindOne: Service.findOne,
  userFindById: User.findById,
  subscriptionFindOne: Subscription.findOne,
  subscriptionSeatFindOne: SubscriptionSeat.findOne,
};
const originalConsoleWarn = console.warn;

export const applyWaitlistPopulatePassthrough = () => {
  WaitlistEntry.populate = async (entry) => entry;
};

export const resetWaitlistServiceModelMocks = () => {
  WaitlistEntry.find = originalMethods.waitlistFind;
  WaitlistEntry.findOne = originalMethods.waitlistFindOne;
  WaitlistEntry.create = originalMethods.waitlistCreate;
  WaitlistEntry.findById = originalMethods.waitlistFindById;
  WaitlistEntry.findOneAndUpdate = originalMethods.waitlistFindOneAndUpdate;
  WaitlistEntry.populate = originalMethods.waitlistPopulate;
  Booking.find = originalMethods.bookingFind;
  Booking.create = originalMethods.bookingCreate;
  Notification.create = originalMethods.notificationCreate;
  Salon.findById = originalMethods.salonFindById;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
  Subscription.findOne = originalMethods.subscriptionFindOne;
  SubscriptionSeat.findOne = originalMethods.subscriptionSeatFindOne;
  console.warn = originalConsoleWarn;

  // Re-apply passthrough for populateWaitlistEntry so action tests
  // don't hit the real Mongoose populate (which needs a DB connection).
  applyWaitlistPopulatePassthrough();
};

export const createMockEntry = (overrides = {}) => ({
  _id: overrides._id || waitlistEntryId,
  clientId,
  barberId,
  salonId: null,
  serviceId,
  date: futureDate,
  preferredStartTime: "",
  preferredEndTime: "",
  note: "",
  status: "active",
  notifiedAt: null,
  cancelledAt: null,
  expiredAt: null,
  convertedBooking: null,
  convertedAt: null,
  rejectedAt: null,
  saveCalled: false,
  async save() {
    this.saveCalled = true;
    return this;
  },
  ...overrides,
});

export const mockFindOneAndUpdateForEntries = (entries) => {
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    const entry = entries.find(
      (candidate) =>
        String(candidate._id) === String(query._id) &&
        (!query.barberId || String(candidate.barberId) === String(query.barberId)) &&
        (Array.isArray(query.status?.$in)
          ? query.status.$in.includes(candidate.status)
          : candidate.status === query.status)
    );

    if (!entry) {
      return null;
    }

    Object.assign(entry, update.$set || {});
    return entry;
  };
};

export const mockValidWaitlistRelationships = ({
  serviceExists = true,
  barber = {
    _id: barberId,
    id: barberId,
    role: "barber",
    salons: [{ salon: salonId, status: "approved" }],
  },
  salon = { _id: salonId, ownerId: "64b000000000000000000099", admins: [] },
} = {}) => {
  Service.findOne = async (query) => {
    if (
      serviceExists &&
      String(query._id) === String(serviceId) &&
      String(query.barberId) === String(barberId)
    ) {
      return { _id: serviceId, barberId };
    }

    return null;
  };
  User.findById = () => ({
    select: async () => barber,
  });
  Salon.findById = () => ({
    select: async () => salon,
  });
};

export const assertSafeWaitlistPopulate = (populateCalls) => {
  assert.deepEqual(populateCalls, [
    [
      { path: "clientId", select: "name" },
      { path: "barberId", select: "name" },
      { path: "salonId", select: "name" },
      { path: "serviceId", select: "name" },
      { path: "convertedBooking", select: "bookingDate time status" },
    ],
  ]);

  const populateFields = JSON.stringify(populateCalls);
  assert.equal(populateFields.includes("email"), false);
  assert.equal(populateFields.includes("phone"), false);
  assert.equal(populateFields.includes("password"), false);
};

export const mockWaitlistApprovalFlow = ({
  entry = createMockEntry(),
  activeBookings = [],
  service = {
    _id: serviceId,
    barberId,
    name: "Haircut",
    duration: 30,
    price: 50,
  },
  bookingId = "64b000000000000000000050",
} = {}) => {
  let createdBooking = null;

  WaitlistEntry.findById = async (entryId) =>
    String(entryId) === String(entry._id) ? entry : null;
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (query.barberId && String(query.barberId) !== String(entry.barberId)) return null;
    if (Array.isArray(query.status?.$in) && !query.status.$in.includes(entry.status)) {
      return null;
    }
    if (typeof query.status === "string" && entry.status !== query.status) {
      return null;
    }

    Object.assign(entry, update.$set || {});
    return entry;
  };
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(clientId)) return { _id: clientId, name: "Client" };
      if (String(id) === String(barberId)) {
        return { _id: barberId, name: "Barber", role: "barber" };
      }
      return null;
    },
  });
  Service.findOne = async () => service;
  Salon.findById = async () => ({ _id: salonId });
  Booking.find = async () => activeBookings;
  Booking.create = async (payload) => {
    createdBooking = { _id: bookingId, ...payload };
    return createdBooking;
  };
  Notification.create = async (payload) => payload;
  Subscription.findOne = async () => ({
    _id: "sub-1",
    ownerType: "barber",
    ownerId: barberId,
    status: "active",
  });
  SubscriptionSeat.findOne = () => ({
    populate: async () => null,
  });

  return {
    entry,
    getCreatedBooking: () => createdBooking,
  };
};

export const mockWaitlistFindWithSafePopulate = ({ expectedQuery, entries }) => {
  const populateCalls = [];

  WaitlistEntry.find = (query) => ({
    populate(options) {
      assert.deepEqual(query, expectedQuery);
      populateCalls.push(options);
      return this;
    },
    async sort(sortOptions) {
      assert.deepEqual(sortOptions, { createdAt: -1 });
      assertSafeWaitlistPopulate(populateCalls);
      return entries;
    },
  });
};

applyWaitlistPopulatePassthrough();
