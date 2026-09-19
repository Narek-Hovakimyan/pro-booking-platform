
import {
  __bookingSideEffectsTestHooks,
} from "../../services/booking/bookingSideEffectsService.js";
import Booking from "../../models/Booking.js";
import BookingPostCommitDispatch from "../../models/BookingPostCommitDispatch.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import BarberProfile from "../../models/BarberProfile.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import {
  getArmeniaDateKey,
  getDayKeyFromDate,
} from "../../utils/bookingDateTime.js";
import {
  __bookingSlotHoldServiceTestHooks,
} from "../../services/booking/bookingSlotHoldService.js";
import {
  __bookingCreateServiceTestHooks,
} from "../../services/booking/bookingCreateService.js";

// ── Singleton model-method capture ──────────────────────────────────

export const originalMethods = {
  bookingCreate: Booking.create,
  bookingCountDocuments: Booking.countDocuments,
  bookingFind: Booking.find,
  bookingAggregate: Booking.aggregate,
  bookingFindById: Booking.findById,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  bookingPostCommitDispatchCreate: BookingPostCommitDispatch.create,
  bookingPostCommitDispatchFind: BookingPostCommitDispatch.find,
  bookingPostCommitDispatchFindOne: BookingPostCommitDispatch.findOne,
  bookingPostCommitDispatchFindOneAndUpdate:
    BookingPostCommitDispatch.findOneAndUpdate,
  bookingSlotHoldFindOne: BookingSlotHold.findOne,
  bookingSlotHoldInsertMany: BookingSlotHold.insertMany,
  bookingSlotHoldBulkWrite: BookingSlotHold.bulkWrite,
  bookingSlotHoldDeleteMany: BookingSlotHold.deleteMany,
  barberProfileFindOne: BarberProfile.findOne,
  notificationCreate: Notification.create,
  salonExists: Salon.exists,
  salonFindById: Salon.findById,
  scheduleFindOne: Schedule.findOne,
  serviceFindOne: Service.findOne,
  subscriptionFindOne: Subscription.findOne,
  subscriptionSeatFind: SubscriptionSeat.find,
  subscriptionPaymentAttemptCreate: SubscriptionPaymentAttempt.create,
  subscriptionSeatFindOne: SubscriptionSeat.findOne,
  userFindById: User.findById,
};

let mockBookingPostCommitDispatchStore;

const dispatchMatches = (dispatch, filter = {}) => {
  if (!dispatch) return false;
  for (const field of ["_id", "bookingId", "eventType", "status", "leaseToken"]) {
    if (filter[field] !== undefined && String(dispatch[field]) !== String(filter[field])) {
      return false;
    }
  }
  if (!filter.$or) return true;
  return filter.$or.some((candidate) => {
    if (candidate.status && dispatch.status !== candidate.status) return false;
    if (candidate.nextAttemptAt?.$lte && dispatch.nextAttemptAt > candidate.nextAttemptAt.$lte) {
      return false;
    }
    if (candidate.leaseExpiresAt?.$lte && dispatch.leaseExpiresAt > candidate.leaseExpiresAt.$lte) {
      return false;
    }
    return true;
  });
};

export const mockBookingPostCommitDispatchModel = ({ createError = null } = {}) => {
  let sequence = 0;
  const rows = [];
  const stagedRows = new WeakMap();
  const visibleRows = (session) => [
    ...rows,
    ...(session ? stagedRows.get(session) || [] : []),
  ];
  const state = {
    rows,
    begin(session) {
      stagedRows.set(session, []);
    },
    commit(session) {
      rows.push(...(stagedRows.get(session) || []));
      stagedRows.delete(session);
    },
    rollback(session) {
      stagedRows.delete(session);
    },
  };
  mockBookingPostCommitDispatchStore = state;

  BookingPostCommitDispatch.create = async (documents, { session } = {}) => {
    if (createError) throw createError;
    const payloads = Array.isArray(documents) ? documents : [documents];
    const target = session ? stagedRows.get(session) : rows;
    if (!target && session) throw new Error("dispatch persistence requires an active transaction");
    const created = payloads.map((payload) => {
      if (visibleRows(session).some((row) =>
        String(row.bookingId) === String(payload.bookingId) && row.eventType === payload.eventType
      )) {
        throw Object.assign(new Error("duplicate dispatch"), { code: 11000 });
      }
      return { _id: `dispatch-${++sequence}`, ...payload };
    });
    (target || rows).push(...created);
    return Array.isArray(documents) ? created : created[0];
  };
  BookingPostCommitDispatch.findOne = async (filter, _projection, { session } = {}) =>
    visibleRows(session).find((row) => dispatchMatches(row, filter)) || null;
  BookingPostCommitDispatch.findOneAndUpdate = async (filter, update, { session } = {}) => {
    const row = visibleRows(session).find((entry) => dispatchMatches(entry, filter));
    if (!row) return null;
    Object.assign(row, update.$set || {});
    for (const [field, value] of Object.entries(update.$inc || {})) {
      row[field] = (row[field] || 0) + value;
    }
    for (const field of Object.keys(update.$unset || {})) delete row[field];
    return row;
  };
  BookingPostCommitDispatch.find = (filter) => {
    const query = {
      sort() { return query; },
      limit() { return Promise.resolve(visibleRows().filter((row) => dispatchMatches(row, filter))); },
    };
    return query;
  };
  return state;
};

export const getMockBookingPostCommitDispatches = () =>
  mockBookingPostCommitDispatchStore?.rows || [];

export const beginMockBookingPostCommitDispatchTransaction = (session) =>
  mockBookingPostCommitDispatchStore?.begin(session);

export const commitMockBookingPostCommitDispatchTransaction = (session) =>
  mockBookingPostCommitDispatchStore?.commit(session);

export const rollbackMockBookingPostCommitDispatchTransaction = (session) =>
  mockBookingPostCommitDispatchStore?.rollback(session);

const createMockTransactionSession = (withTransaction) => {
  const session = {
    resetDispatchAttempt() {
      mockBookingPostCommitDispatchStore?.begin(session);
    },
    async withTransaction(callback) {
      const executeAttempt = async () => {
        session.resetDispatchAttempt();
        return callback();
      };
      try {
        const result = withTransaction
          ? await withTransaction(executeAttempt)
          : await executeAttempt();
        mockBookingPostCommitDispatchStore?.commit(session);
        return result;
      } catch (error) {
        mockBookingPostCommitDispatchStore?.rollback(session);
        throw error;
      }
    },
    async endSession() {},
  };
  return session;
};

export const mockBookingSlotHoldModel = () => {
  mockBookingPostCommitDispatchModel();
  const session = createMockTransactionSession();
  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  __bookingSlotHoldServiceTestHooks.startSession = async () => session;
  __bookingCreateServiceTestHooks.supportsTransactions = async () => true;
  __bookingCreateServiceTestHooks.startSession = async () => session;
  BookingSlotHold.findOne = async () => null;
  BookingSlotHold.insertMany = async (docs) => docs;
  BookingSlotHold.bulkWrite = async () => ({ ok: 1 });
  BookingSlotHold.deleteMany = async () => ({ deletedCount: 0 });
};

// ── Silence fire-and-forget waitlist notifications ──────────────────
// These would outlive each test and try to call WaitlistEntry.find on
// an unconnected mongoose buffer.
__bookingSideEffectsTestHooks.setNotifyMatchingWaitlistEntries(async () => {});
mockBookingSlotHoldModel();

// ── IDs ─────────────────────────────────────────────────────────────

export const barberId = "64b000000000000000000001";
export const serviceId = "64b000000000000000000002";
export const clientId = "64b000000000000000000003";
export const salonId = "64b000000000000000000004";
export const salonBId = "64b000000000000000000005";
export const pastBookingDate = "2020-01-15";

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addDaysToDateKey = (dateKey, days) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return formatDateKey(new Date(year, month - 1, day + days));
};

export const getFutureBookingDateForDay = (targetDayKey, minimumDaysFromToday = 7) => {
  let candidate = addDaysToDateKey(
    getArmeniaDateKey(new Date()),
    minimumDaysFromToday
  );

  for (let offset = 0; offset < 7; offset += 1) {
    if (getDayKeyFromDate(candidate) === targetDayKey) {
      return candidate;
    }
    candidate = addDaysToDateKey(candidate, 1);
  }

  return candidate;
};

export const bookingDate = getFutureBookingDateForDay("mon");
export const sundayBookingDate = getFutureBookingDateForDay("sun");

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
  salons: [{
    salon: salonId,
    status: "approved",
    relationshipStatus: "accepted",
    worksAsSpecialist: true,
    isPrimary: true,
  }],
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
  Subscription.findOne = async () => ({ _id: "subscription-1", status: "active" });
  SubscriptionPaymentAttempt.create = async (payload) => ({
    _id: "payment-attempt-1",
    ...payload,
  });
  SubscriptionSeat.findOne = () => ({
    populate: async () => null,
  });
  SubscriptionSeat.find = () => ({
    populate: () => ({
      lean: async () => [
        {
          _id: "seat-1",
          barberId,
          salonId,
          status: "active",
          subscriptionId: {
            _id: "salon-subscription-1",
            ownerId: salonId,
            status: "active",
          },
        },
      ],
    }),
  });
  BarberProfile.findOne = () => ({
    lean: async () => ({ barberId, address: "1 Main St" }),
  });
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
  Schedule.findOne = async () => ({
    barberId,
    salonId: null,
    weeklySchedule: {
      sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
      mon: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      tue: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      wed: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      thu: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      fri: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
    },
  });
  Booking.find = mockBookingFind(createdBookings);
  Booking.findById = async (id) =>
    createdBookings.find((booking) => String(booking._id) === String(id)) || null;
  mockBookingSlotHoldModel();
  const createBooking = async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, 20));

    const bookingPayload = Array.isArray(payload) ? payload[0] : payload;
    const booking = {
      ...bookingPayload,
      _id: bookingPayload._id || `booking-${createdBookings.length + 1}`,
    };
    createdBookings.push(booking);
    return Array.isArray(payload) ? [booking] : booking;
  };
  Booking.create = createBooking;
  Booking.findOneAndUpdate = async (query, update) => {
    const existing = createdBookings.find(
      (booking) => String(booking._id) === String(query._id)
    );
    if (existing) return existing;

    const booking = {
      ...update.$setOnInsert,
      _id: update.$setOnInsert?._id || query._id || `booking-${createdBookings.length + 1}`,
    };
    if (Booking.create !== createBooking) {
      const created = await Booking.create(booking);
      return Array.isArray(created) ? created[0] : created;
    }
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

    // Concurrency guard: reject if delayMinutesTotal > 0 or delayedAt set
    if (query.$or) {
      const hasDelay = booking.delayMinutesTotal > 0;
      const hasDelayedAt = Boolean(booking.delayedAt);
      if (hasDelay || hasDelayedAt) return null;
    }

    Object.assign(booking, update.$set || {});
    return booking;
  };
};

// ── Delay dependency mocks ──────────────────────────────────────────

export const mockDelayDependencies = (
  activeBookings = [],
  storedBooking = null
) => {
  mockBookingSlotHoldModel();
  User.findById = () => ({
    select: async () => barberWithSalon,
  });
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind(activeBookings);
  if (storedBooking) {
    mockDelayStatusClaim(storedBooking);
  }
};
