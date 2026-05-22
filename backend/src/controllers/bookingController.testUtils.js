
import {
  __bookingSideEffectsTestHooks,
} from "../services/bookingSideEffectsService.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";

// ── Singleton model-method capture ──────────────────────────────────

export const originalMethods = {
  bookingCreate: Booking.create,
  bookingCountDocuments: Booking.countDocuments,
  bookingFind: Booking.find,
  bookingFindById: Booking.findById,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  notificationCreate: Notification.create,
  salonExists: Salon.exists,
  scheduleFindOne: Schedule.findOne,
  serviceFindOne: Service.findOne,
  userFindById: User.findById,
};

// ── Silence fire-and-forget waitlist notifications ──────────────────
// These would outlive each test and try to call WaitlistEntry.find on
// an unconnected mongoose buffer.
__bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries(async () => {});

// ── IDs ─────────────────────────────────────────────────────────────

export const barberId = "64b000000000000000000001";
export const serviceId = "64b000000000000000000002";
export const clientId = "64b000000000000000000003";
export const salonId = "64b000000000000000000004";
export const salonBId = "64b000000000000000000005";
export const bookingDate = "2099-06-01";
export const pastBookingDate = "2020-01-15";

// ── User fixtures ───────────────────────────────────────────────────

export const barber = {
  _id: barberId,
  id: barberId,
  role: "barber",
  salons: [],
  salonStatus: "none",
  salon: null,
};

export const barberWithSalon = {
  ...barber,
  salons: [{ salon: salonId, status: "approved", isPrimary: true }],
};

export const client = {
  _id: clientId,
  id: clientId,
  role: "client",
  name: "Client",
};

export const otherClient = {
  _id: "64b000000000000000000008",
  id: "64b000000000000000000008",
  role: "client",
  name: "Other Client",
};

// ── Response helper ─────────────────────────────────────────────────

export const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

// ── Mutable booking factory ─────────────────────────────────────────

export const createMutableBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId,
  clientId,
  serviceId,
  salonId,
  bookingDate,
  dayKey: "mon",
  time: "10:00",
  duration: 60,
  price: 100,
  status: "pending",
  saveCalled: false,
  async save() {
    this.saveCalled = true;
    return this;
  },
  ...overrides,
});

// ── Slot-validation booking find mock ───────────────────────────────

export const mockBookingFind = (bookings) => async (query) =>
  bookings.filter((booking) => {
    if (String(booking.barberId) !== String(query.barberId)) return false;
    if (booking.bookingDate !== query.bookingDate) return false;
    if (!query.status?.$in?.includes(booking.status)) return false;
    if (query._id?.$ne && String(booking._id) === String(query._id.$ne)) return false;
    return true;
  });

// ── Create-booking dependency mocks ─────────────────────────────────

export const mockCreateBookingDependencies = (createdBookings) => {
  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Haircut",
    duration: 60,
    price: 100,
  });
  User.findById = () => ({
    select: async () => barber,
  });
  Salon.exists = async () => false;
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind(createdBookings);
  Booking.create = async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, 20));

    const booking = {
      _id: `booking-${createdBookings.length + 1}`,
      ...payload,
    };
    createdBookings.push(booking);
    return booking;
  };
};

// ── Status-claim helper (findOneAndUpdate) ──────────────────────────

export const mockBookingStatusClaim = (booking) => {
  Booking.findOneAndUpdate = async (query, update) => {
    if (String(booking._id) !== String(query._id)) return null;
    if (String(booking.barberId) !== String(query.barberId)) return null;
    if (booking.status !== query.status) return null;

    Object.assign(booking, update.$set || {});
    return booking;
  };
};

// ── Successful creation dependencies (with salon + notification) ────

export const mockSuccessfulCreateDependencies = (
  createdBookings,
  resolvedBarber = barber
) => {
  mockCreateBookingDependencies(createdBookings);
  User.findById = () => ({
    select: async (fields) =>
      fields === "name" ? { name: "Barber" } : resolvedBarber,
  });
  Salon.exists = async () => Boolean(resolvedBarber.salons?.length);
  Notification.create = async (payload) => payload;
};

// ── Delay status-claim helper ───────────────────────────────────────

export const mockDelayStatusClaim = (booking) => {
  Booking.findOneAndUpdate = async (query, update) => {
    if (String(booking._id) !== String(query._id)) return null;
    if (String(booking.clientId) !== String(query.clientId)) return null;
    if (booking.status !== query.status) return null;
    if (booking.bookingDate !== query.bookingDate) return null;
    if (booking.time !== query.time) return null;

    Object.assign(booking, update.$set || {});
    return booking;
  };
};

// ── Delay dependency mocks ──────────────────────────────────────────

export const mockDelayDependencies = (
  activeBookings = [],
  storedBooking = null
) => {
  User.findById = () => ({
    select: async () => barberWithSalon,
  });
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind(activeBookings);
  if (storedBooking) {
    mockDelayStatusClaim(storedBooking);
  }
};
