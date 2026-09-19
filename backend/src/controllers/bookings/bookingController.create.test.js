import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import fs from "fs";
import path from "path";

import { __bookingTestHooks, createBooking, updateBooking } from "./bookingController.js";
import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import BookingCreateIdempotencyOperation from "../../models/BookingCreateIdempotencyOperation.js";
import BookingPostCommitDispatch from "../../models/BookingPostCommitDispatch.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import MockPaymentProvider from "../../services/payment/MockPaymentProvider.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import Voucher from "../../models/Voucher.js";
import { handleReferenceImageUploadError } from "../../middleware/uploadMiddleware.js";
import { __bookingCreateServiceTestHooks } from "../../services/booking/bookingCreateService.js";
import { __loyaltyRewardRedemptionTestHooks } from "../../services/booking/loyaltyRewardRedemptionService.js";
import { __bookingSideEffectsTestHooks } from "../../services/booking/bookingSideEffectsService.js";
import { MEDIA_STORE_ERROR_CODES, MediaStoreError } from "../../services/media/mediaStore.js";
import { explicitAllDaysOffMarker } from "../../utils/scheduleUtils.js";

import {
  barber,
  barberId,
  barberWithSalon,
  beginMockBookingPostCommitDispatchTransaction,
  bookingDate,
  client,
  clientId,
  commitMockBookingPostCommitDispatchTransaction,
  createMutableBooking,
  createResponse,
  getMockBookingPostCommitDispatches,
  getFutureBookingDateForDay,
  mockBookingFind,
  mockBookingPostCommitDispatchModel,
  mockBookingSlotHoldModel,
  mockCreateBookingDependencies,
  mockSuccessfulCreateDependencies,
  originalMethods,
  rollbackMockBookingPostCommitDispatchTransaction,
  salonBId,
  salonId,
  serviceId,
  sundayBookingDate,
} from "./bookingController.testUtils.js";

const originalConsoleError = console.error;
const originalServiceFind = Service.find;
const originalPaymentProvider = process.env.PAYMENT_PROVIDER;
const originalFindByIdAndDelete = Booking.findByIdAndDelete;
const originalBookingCreateIdempotencyFindOne = BookingCreateIdempotencyOperation.findOne;
const originalBookingCreateIdempotencyCreate = BookingCreateIdempotencyOperation.create;
const originalStageBookingReferenceMedia =
  __bookingCreateServiceTestHooks.stageBookingReferenceMedia;
const originalPromoteBookingReferenceMedia =
  __bookingCreateServiceTestHooks.promoteBookingReferenceMedia;
const originalActivateBookingReferenceMedia =
  __bookingCreateServiceTestHooks.activateBookingReferenceMedia;
const originalCompensateBookingReferenceMediaFailure =
  __bookingCreateServiceTestHooks.compensateBookingReferenceMediaFailure;
const originalSupportsTransactions =
  __bookingCreateServiceTestHooks.supportsTransactions;
const originalStartSession = __bookingCreateServiceTestHooks.startSession;
const originalVoucherFind = Voucher.find;
const originalVoucherFindOne = Voucher.findOne;
const originalVoucherFindOneAndUpdate = Voucher.findOneAndUpdate;
const originalVoucherFindByIdAndUpdate = Voucher.findByIdAndUpdate;
const originalSubscriptionPaymentAttemptFindOneAndUpdate =
  SubscriptionPaymentAttempt.findOneAndUpdate;
const originalMockCreatePaymentIntent = MockPaymentProvider.prototype.createPaymentIntent;
const originalLoyaltyClaim =
  __loyaltyRewardRedemptionTestHooks.claimLoyaltyReward;
const mockLoyaltyClaim = async ({
  bookingId,
  barberId,
  clientId,
  milestone,
} = {}) => ({ bookingId, barberId, clientId, milestone, status: "claimed" });

beforeEach(() => {
  __loyaltyRewardRedemptionTestHooks.claimLoyaltyReward = mockLoyaltyClaim;
});

const oldAutoClosedWeeklySchedule = {
  sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  tue: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  wed: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  thu: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  fri: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
};
const tuesdayBookingDate = getFutureBookingDateForDay("tue");

const createRequestLogger = () => {
  const calls = [];
  return {
    calls,
    infoCalls: [],
    warnCalls: [],
    error(...args) {
      calls.push(args);
    },
    info(...args) {
      this.infoCalls.push(args);
    },
    warn(...args) {
      this.warnCalls.push(args);
    },
  };
};

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  BookingPostCommitDispatch.create = originalMethods.bookingPostCommitDispatchCreate;
  BookingPostCommitDispatch.find = originalMethods.bookingPostCommitDispatchFind;
  BookingPostCommitDispatch.findOne = originalMethods.bookingPostCommitDispatchFindOne;
  BookingPostCommitDispatch.findOneAndUpdate =
    originalMethods.bookingPostCommitDispatchFindOneAndUpdate;
  BookingSlotHold.findOne = originalMethods.bookingSlotHoldFindOne;
  BookingSlotHold.insertMany = originalMethods.bookingSlotHoldInsertMany;
  BookingSlotHold.bulkWrite = originalMethods.bookingSlotHoldBulkWrite;
  BookingSlotHold.deleteMany = originalMethods.bookingSlotHoldDeleteMany;
  mockBookingSlotHoldModel();
  BarberProfile.findOne = originalMethods.barberProfileFindOne;
  Notification.create = originalMethods.notificationCreate;
  Salon.exists = originalMethods.salonExists;
  Salon.findById = originalMethods.salonFindById;
  Schedule.findOne = originalMethods.scheduleFindOne;
  Service.findOne = originalMethods.serviceFindOne;
  Service.find = originalServiceFind;
  Subscription.findOne = originalMethods.subscriptionFindOne;
  SubscriptionPaymentAttempt.create = originalMethods.subscriptionPaymentAttemptCreate;
  SubscriptionPaymentAttempt.findOneAndUpdate =
    originalSubscriptionPaymentAttemptFindOneAndUpdate;
  MockPaymentProvider.prototype.createPaymentIntent = originalMockCreatePaymentIntent;
  MockPaymentProvider.paymentIntentsByIdempotencyKey.clear();
  SubscriptionSeat.find = originalMethods.subscriptionSeatFind;
  SubscriptionSeat.findOne = originalMethods.subscriptionSeatFindOne;
  User.findById = originalMethods.userFindById;
  Booking.findByIdAndDelete = originalFindByIdAndDelete;
  BookingCreateIdempotencyOperation.findOne = originalBookingCreateIdempotencyFindOne;
  BookingCreateIdempotencyOperation.create = originalBookingCreateIdempotencyCreate;
  __bookingCreateServiceTestHooks.stageBookingReferenceMedia =
    originalStageBookingReferenceMedia;
  __bookingCreateServiceTestHooks.promoteBookingReferenceMedia =
    originalPromoteBookingReferenceMedia;
  __bookingCreateServiceTestHooks.activateBookingReferenceMedia =
    originalActivateBookingReferenceMedia;
  __bookingCreateServiceTestHooks.compensateBookingReferenceMediaFailure =
    originalCompensateBookingReferenceMediaFailure;
  __bookingCreateServiceTestHooks.supportsTransactions =
    originalSupportsTransactions;
  __bookingCreateServiceTestHooks.startSession = originalStartSession;
  __bookingSideEffectsTestHooks.resetGetIO();
  Voucher.find = originalVoucherFind;
  Voucher.findOne = originalVoucherFindOne;
  Voucher.findOneAndUpdate = originalVoucherFindOneAndUpdate;
  Voucher.findByIdAndUpdate = originalVoucherFindByIdAndUpdate;
  __loyaltyRewardRedemptionTestHooks.claimLoyaltyReward = originalLoyaltyClaim;
  if (originalPaymentProvider === undefined) {
    delete process.env.PAYMENT_PROVIDER;
  } else {
    process.env.PAYMENT_PROVIDER = originalPaymentProvider;
  }
  console.error = originalConsoleError;
  installReferenceMediaSuccessHooks();
});

const installReferenceMediaSuccessHooks = () => {
  __bookingCreateServiceTestHooks.stageBookingReferenceMedia = async ({
    files = [],
  } = {}) =>
    files.map((file, index) => ({
      fileName: file.filename,
      legacyUrl: `uploads/booking-references/${file.filename}`,
      mediaObjectId: `media-${index + 1}`,
      storageKey: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}.jpg`,
      stageKey: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}.stage`,
    }));
  __bookingCreateServiceTestHooks.promoteBookingReferenceMedia = async ({
    media = [],
  } = {}) =>
    media.map((entry) => ({
      ...entry,
      stageKey: "",
    }));
  __bookingCreateServiceTestHooks.activateBookingReferenceMedia = async ({
    media = [],
  } = {}) => media;
  __bookingCreateServiceTestHooks.compensateBookingReferenceMediaFailure = async () => {};
  __bookingCreateServiceTestHooks.supportsTransactions = async () => true;
  __bookingCreateServiceTestHooks.startSession = async () => ({
    async withTransaction(callback) {
      return callback();
    },
    async endSession() {},
  });
};

const installBookingCreateIdempotencyStore = (createdBookings) => {
  const operations = [];
  BookingCreateIdempotencyOperation.findOne = async (filter) =>
    operations.find((operation) =>
      String(operation.actorId) === String(filter.actorId) &&
      operation.keyHash === filter.keyHash
    ) || null;
  BookingCreateIdempotencyOperation.create = async ([payload]) => {
    if (operations.some((operation) =>
      String(operation.actorId) === String(payload.actorId) &&
      operation.keyHash === payload.keyHash
    )) {
      throw Object.assign(new Error("duplicate key"), { code: 11000 });
    }
    operations.push(payload);
    return [payload];
  };
  Booking.findById = async () => createdBookings[0] || null;
  return operations;
};

installReferenceMediaSuccessHooks();

const createTransactionSession = (withTransaction) => {
  const session = {
    async withTransaction(callback) {
      const executeAttempt = async () => {
        beginMockBookingPostCommitDispatchTransaction(session);
        return callback();
      };
      try {
        const result = withTransaction
          ? await withTransaction(executeAttempt)
          : await executeAttempt();
        commitMockBookingPostCommitDispatchTransaction(session);
        return result;
      } catch (error) {
        rollbackMockBookingPostCommitDispatchTransaction(session);
        throw error;
      }
    },
    async endSession() {},
  };
  return session;
};

const installTransactionalBookingCreate = ({
  createdBookings,
  withTransaction,
  onFindOneAndUpdate,
} = {}) => {
  let pendingBookings = new Map();
  const commitPendingBookings = () => {
    for (const booking of pendingBookings.values()) {
      const index = createdBookings.findIndex(
        (entry) => String(entry._id) === String(booking._id)
      );
      if (index >= 0) {
        createdBookings[index] = booking;
      } else {
        createdBookings.push(booking);
      }
    }
  };
  const session = createTransactionSession(async (callback) => {
    const executeAttempt = async () => {
      pendingBookings = new Map();
      beginMockBookingPostCommitDispatchTransaction(session);
      return callback();
    };
    const result = withTransaction
      ? await withTransaction(executeAttempt)
      : await executeAttempt();
    commitPendingBookings();
    return result;
  });
  __bookingCreateServiceTestHooks.supportsTransactions = async () => true;
  __bookingCreateServiceTestHooks.startSession = async () => session;
  Booking.findOneAndUpdate = async (query, update, options = {}) => {
    onFindOneAndUpdate?.(options.session);
    const key = String(query._id);
    const existing =
      pendingBookings.get(key) ||
      createdBookings.find(
      (booking) => String(booking._id) === String(query._id)
      );
    if (existing) return existing;
    const booking = { ...update.$setOnInsert, _id: query._id };
    pendingBookings.set(key, booking);
    return booking;
  };
  return session;
};

test("legacy booking schedule lookup excludes a personal null-salon schedule", async () => {
  let query;
  Schedule.findOne = async (nextQuery) => {
    query = nextQuery;
    return null;
  };
  Booking.find = async () => [];

  await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate: "2026-12-15",
    time: "10:00",
    duration: 30,
  });

  assert.deepEqual(query, { barberId, salonId: { $ne: null } });
});

const bookingReferenceDir = path.resolve(process.cwd(), "uploads", "booking-references");

const createReferenceUploadFile = (filename) => {
  fs.mkdirSync(bookingReferenceDir, { recursive: true });
  const filePath = path.join(bookingReferenceDir, filename);
  fs.writeFileSync(filePath, "reference image", "utf8");
  return filePath;
};

const staffMembership = (id, overrides = {}) => ({
  salon: id,
  status: "approved",
  relationshipType: "staff",
  relationshipStatus: "accepted",
  worksAsSpecialist: true,
  ...overrides,
});

const validSchedule = (overrides = {}) => ({
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
  ...overrides,
});

const mockSalonScopedSeatAccess = ({
  seatSalonId = salonId,
  resolvedBarber = {
    ...barber,
    salons: [staffMembership(salonId), staffMembership(salonBId)],
  },
} = {}) => {
  Subscription.findOne = async () => null;
  SubscriptionSeat.find = () => ({
    populate: () => ({
      lean: async () => [
        {
          _id: "seat-1",
          barberId,
          salonId: seatSalonId,
          status: "active",
          subscriptionId: {
            _id: "salon-subscription-1",
            ownerId: seatSalonId,
            status: "active",
          },
        },
      ],
    }),
  });
  User.findById = () => ({
    select: async (fields) =>
      fields === "name" ? { name: "Barber" } : resolvedBarber,
  });
  Salon.exists = async ({ _id }) => [salonId, salonBId].includes(String(_id));
};

test("createBooking succeeds independently with the null-salon personal schedule", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barber,
    specialistOnboarding: {
      version: 1,
      status: "completed",
      currentStep: "review",
      workplace: "independent",
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  let scheduleQuery;
  Schedule.findOne = async (query) => {
    scheduleQuery = query;
    return validSchedule({ salonId: null });
  };

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: { barberId, clientId, serviceId, bookingDate, time: "10:00", clientName: "Client" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(scheduleQuery, { barberId, salonId: null });
  assert.equal(createdBookings[0].salonId, null);
});

test("createBooking rejects independent readiness without address or personal schedule", async () => {
  for (const { name, profile, schedule } of [
    { name: "missing address", profile: { barberId, address: "" }, schedule: validSchedule() },
    { name: "missing schedule", profile: { barberId, address: "1 Main St" }, schedule: null },
  ]) {
    const createdBookings = [];
    mockSuccessfulCreateDependencies(createdBookings, {
      ...barber,
      specialistOnboarding: {
        version: 1,
        status: "completed",
        currentStep: "review",
        workplace: "independent",
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    BarberProfile.findOne = () => ({ lean: async () => profile });
    Schedule.findOne = async () => schedule;

    const res = createResponse();
    await createBooking(
      {
        user: client,
        body: { barberId, clientId, serviceId, bookingDate, time: "10:00", clientName: name },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(createdBookings.length, 0);
  }
});

test("createBooking rejects non-eligible salon memberships and legacy fallback", async () => {
  for (const membership of [
    staffMembership(salonId, { status: "pending" }),
    staffMembership(salonId, { status: "rejected" }),
    staffMembership(salonId, { relationshipStatus: "pending" }),
    staffMembership(salonId, { relationshipStatus: "rejected" }),
    staffMembership(salonId, { worksAsSpecialist: false }),
    staffMembership(salonBId),
  ]) {
    const createdBookings = [];
    mockSuccessfulCreateDependencies(createdBookings, {
      ...barber,
      salon: salonId,
      salonStatus: "approved",
      salons: [membership],
    });

    const res = createResponse();
    await createBooking(
      {
        user: client,
        body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(createdBookings.length, 0);
  }
});

test("createBooking resolves only the exact salon schedule", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const queries = [];
  Schedule.findOne = async (query) => {
    queries.push(query);
    return String(query.salonId) === salonId
      ? validSchedule({ salonId })
      : validSchedule({ salonId: salonBId });
  };

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(queries, [{ barberId, salonId }, { barberId, salonId }]);
});

test("slot validation exact mode uses default schedule fallback within the resolved salon schedule", async () => {
  Booking.find = async () => [];
  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate: tuesdayBookingDate,
    time: "10:00",
    duration: 30,
    schedule: { weeklySchedule: {}, defaultSchedule: { startTime: "09:00", endTime: "18:00" } },
    requireResolvedSchedule: true,
  });

  assert.equal(result.message, undefined);
  assert.equal(result.effectiveDayKey, "tue");
});

test("slot validation exact mode keeps explicit weekly day off blocked", async () => {
  Booking.find = async () => [];
  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:00",
    duration: 30,
    schedule: {
      weeklySchedule: {
        mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
      },
      defaultSchedule: { startTime: "09:00", endTime: "18:00" },
    },
    requireResolvedSchedule: true,
  });

  assert.equal(result.message, "Barber is not working this day");
});

test("slot validation exact mode respects explicit weekly working hours", async () => {
  Booking.find = async () => [];
  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:00",
    duration: 30,
    schedule: {
      weeklySchedule: {
        mon: { working: true, from: "11:00", to: "18:00", breakFrom: "", breakTo: "" },
      },
      defaultSchedule: { startTime: "09:00", endTime: "18:00" },
    },
    requireResolvedSchedule: true,
  });

  assert.equal(result.message, "This time is outside working hours");
});

test("slot validation exact mode respects working date overrides", async () => {
  Booking.find = async () => [];
  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:00",
    duration: 30,
    schedule: {
      weeklySchedule: {
        mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
      },
      scheduleOverrides: {
        [bookingDate]: {
          isWorking: true,
          startTime: "09:00",
          endTime: "12:00",
          breakStart: "",
          breakEnd: "",
        },
      },
      defaultSchedule: { startTime: "13:00", endTime: "18:00" },
    },
    requireResolvedSchedule: true,
  });

  assert.equal(result.message, undefined);
});

test("slot validation exact mode blocks non-working date overrides", async () => {
  Booking.find = async () => [];
  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:00",
    duration: 30,
    schedule: {
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
      },
      scheduleOverrides: {
        [bookingDate]: { isWorking: false },
      },
      defaultSchedule: { startTime: "09:00", endTime: "18:00" },
    },
    requireResolvedSchedule: true,
  });

  assert.equal(result.message, "Barber is not working this day");
});

test("slot validation exact mode blocks non-working dates even with working default fallback", async () => {
  Booking.find = async () => [];
  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate: tuesdayBookingDate,
    time: "10:00",
    duration: 30,
    schedule: {
      weeklySchedule: {},
      nonWorkingDays: [tuesdayBookingDate],
      defaultSchedule: { startTime: "09:00", endTime: "18:00" },
    },
    requireResolvedSchedule: true,
  });

  assert.equal(result.message, "Barber is not working this day");
});

// ── Slot validation and booking conflicts ──────────────────────────

test("10:00 60-minute booking blocks 10:20 by overlap", async () => {
  assert.equal(
    __bookingTestHooks.slotOverlaps(
      { time: "10:00", duration: 60 },
      "10:20",
      20
    ),
    true
  );
});

test("pending booking blocks slot", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    createMutableBooking({
      _id: "booking-pending",
      time: "10:00",
      duration: 60,
      status: "pending",
    }),
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, "This time is already booked");
});

test("accepted and confirmed bookings block slot", async () => {
  for (const status of ["accepted", "confirmed"]) {
    Schedule.findOne = async () => null;
    Booking.find = mockBookingFind([
      createMutableBooking({
        _id: `booking-${status}`,
        time: "10:00",
        duration: 60,
        status,
      }),
    ]);

    const result = await __bookingTestHooks.validateBookingSlot({
      barberId,
      barber,
      bookingDate,
      time: "10:20",
      duration: 20,
    });

    assert.equal(result.message, "This time is already booked");
  }
});

test("rejected booking does not block slot", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    createMutableBooking({
      _id: "booking-rejected",
      time: "10:00",
      duration: 60,
      status: "rejected",
    }),
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});

test("cancelled booking does not block slot", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    createMutableBooking({
      _id: "booking-cancelled",
      time: "10:00",
      duration: 60,
      status: "cancelled",
    }),
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});

test("expired booking does not block slot", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    createMutableBooking({
      _id: "booking-expired",
      time: "10:00",
      duration: 60,
      status: "expired",
    }),
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});

test("booking availability uses the selected salon schedule", async () => {
  const barberWithTwoSalons = {
    ...barber,
    salons: [
      { salon: salonId, status: "approved" },
      { salon: salonBId, status: "approved" },
    ],
  };

  Schedule.findOne = async (query) => {
    if (String(query.salonId) === salonId) {
      return {
        scheduleOverrides: {},
        nonWorkingDays: [],
        defaultSchedule: {
          startTime: "12:00",
          endTime: "18:00",
          hasBreak: false,
          breakStart: "",
          breakEnd: "",
        },
      };
    }

    if (String(query.salonId) === salonBId) {
      return {
        scheduleOverrides: {},
        nonWorkingDays: [],
        defaultSchedule: {
          startTime: "09:00",
          endTime: "18:00",
          hasBreak: false,
          breakStart: "",
          breakEnd: "",
        },
      };
    }

    return null;
  };
  Booking.find = mockBookingFind([]);

  const salonAResult = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId,
    barber: barberWithTwoSalons,
    bookingDate,
    time: "10:00",
    duration: 20,
  });
  const salonBResult = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId: salonBId,
    barber: barberWithTwoSalons,
    bookingDate,
    time: "10:00",
    duration: 20,
  });

  assert.equal(salonAResult.message, "This time is outside working hours");
  assert.equal(salonBResult.message, undefined);
  assert.ok(salonBResult.effectiveDayKey);
});

test("booking availability treats explicit non-working weekly day as closed", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: {
      mon: {
        working: false,
        from: "",
        to: "",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "20:00",
      hasBreak: true,
      breakStart: "14:00",
      breakEnd: "15:00",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, "Barber is not working this day");
});

test("booking availability returns no slots for Sunday when Sunday is off", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: {
      sun: {
        working: false,
        from: "",
        to: "",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "20:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate: sundayBookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, "Barber is not working this day");
});

test("booking availability returns no slots for explicitly saved all-days-off schedule", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: {
      ...oldAutoClosedWeeklySchedule,
      [explicitAllDaysOffMarker]: true,
    },
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "20:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, "Barber is not working this day");
});

test("booking availability still returns slots for a working weekly day", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: {
      mon: {
        working: true,
        from: "10:00",
        to: "20:00",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});

test("booking availability ignores old auto-closed weekly schedule and falls back to default", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: oldAutoClosedWeeklySchedule,
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "20:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});

test("booking availability respects meaningful weekly schedule before default schedule fallback", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: {
      mon: {
        working: true,
        from: "12:00",
        to: "18:00",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:00",
    duration: 20,
  });

  assert.equal(result.message, "This time is outside working hours");
});

test("date schedule override still blocks booking slot", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: {
      mon: {
        working: true,
        from: "10:00",
        to: "20:00",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {
      [bookingDate]: {
        isWorking: false,
      },
    },
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "20:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:00",
    duration: 20,
  });

  assert.equal(result.message, "Barber is not working this day");
});

test("non-working day blocks booking slot even when default schedule is working", async () => {
  Schedule.findOne = async () => ({
    weeklySchedule: {
      mon: {
        working: false,
        from: "",
        to: "",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
    nonWorkingDays: [bookingDate],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "20:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId,
    barber: barberWithSalon,
    bookingDate,
    time: "10:00",
    duration: 20,
  });

  assert.equal(result.message, "Barber is not working this day");
});

test("booking validation uses clean default schedule values with break", async () => {
  Schedule.findOne = async () => ({
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
      _doc: {
        startTime: "10:30",
        endTime: "18:00",
        hasBreak: true,
        breakStart: "14:00",
        breakEnd: "15:00",
      },
    },
  });
  Booking.find = mockBookingFind([]);

  const validStartResult = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId,
    barber: barberWithSalon,
    bookingDate,
    time: "10:30",
    duration: 30,
  });
  const breakResult = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId,
    barber: barberWithSalon,
    bookingDate,
    time: "14:10",
    duration: 30,
  });
  const validAfterBreakResult = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId,
    barber: barberWithSalon,
    bookingDate,
    time: "15:00",
    duration: 30,
  });
  const outsideHoursResult = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId,
    barber: barberWithSalon,
    bookingDate,
    time: "09:00",
    duration: 30,
  });

  assert.equal(validStartResult.message, undefined);
  assert.equal(breakResult.message, "Not enough time for selected service");
  assert.equal(validAfterBreakResult.message, undefined);
  assert.equal(outsideHoursResult.message, "This time is outside working hours");
});

test("break time blocks booking slot", async () => {
  Schedule.findOne = async () => ({
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: true,
      breakStart: "12:00",
      breakEnd: "13:00",
    },
  });
  Booking.find = mockBookingFind([]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    salonId,
    barber: barberWithSalon,
    bookingDate,
    time: "12:20",
    duration: 20,
  });

  assert.equal(result.message, "Not enough time for selected service");
});

// ── Create booking basics ────────────────────────────────────────

test("client-created booking ignores accepted status and saves salonId", async () => {
  const createdBookings = [];
  const notifications = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        status: "accepted",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.status, "pending");
  assert.equal(String(res.body.salonId), salonId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "booking_created");
  assert.deepEqual(notifications[0].data, { bookingId: res.body._id });
});

test("createBooking blocks unpaid target barber with BARBER_UNAVAILABLE", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Subscription.findOne = async () => null;
  SubscriptionSeat.findOne = () => ({
    populate: async () => null,
  });
  SubscriptionSeat.find = () => ({
    populate: () => ({
      lean: async () => [],
    }),
  });

  let serviceLookedUp = false;
  Service.findOne = async () => {
    serviceLookedUp = true;
    return null;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  });
  assert.equal(serviceLookedUp, false);
  assert.equal(createdBookings.length, 0);
});

test("client-sent paid/paymentStatus/depositPaid fields do not bypass paid access check", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Subscription.findOne = async () => null;
  SubscriptionSeat.findOne = () => ({
    populate: async () => null,
  });
  SubscriptionSeat.find = () => ({
    populate: () => ({
      lean: async () => [],
    }),
  });

  let serviceLookedUp = false;
  Service.findOne = async () => {
    serviceLookedUp = true;
    return null;
  };

  const res = createResponse();

  // Send paid, paymentStatus, and depositPaid as if a malicious client
  // tried to trick the server into skipping the paid access check
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        paid: true,
        paymentStatus: "completed",
        depositPaid: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  });
  assert.equal(serviceLookedUp, false);
  assert.equal(createdBookings.length, 0);
});

test("createBooking allows active salon seat only in the matching salon", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings);
  mockSalonScopedSeatAccess({ seatSalonId: salonId });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(String(createdBookings[0].salonId), salonId);
});

test("createBooking allows salon booking when approved membership omits legacy worksAsSpecialist", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings);
  mockSalonScopedSeatAccess({
    seatSalonId: salonId,
    resolvedBarber: {
      ...barber,
      specialistOnboarding: {
        version: 1,
        status: "completed",
        currentStep: "review",
        workplace: "salon",
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      salons: [staffMembership(salonId, { worksAsSpecialist: undefined })],
    },
  });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(String(createdBookings[0].salonId), salonId);
});

test("createBooking blocks active seat from another salon", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings);
  mockSalonScopedSeatAccess({ seatSalonId: salonId });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId: salonBId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  });
  assert.equal(createdBookings.length, 0);

  const paidSalonRes = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    paidSalonRes
  );

  assert.equal(paidSalonRes.statusCode, 201);
  assert.equal(String(createdBookings[0].salonId), salonId);
});

test("createBooking treats missing salonId as independent and does not infer a primary salon", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings);
  mockSalonScopedSeatAccess({ seatSalonId: salonId });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(createdBookings[0].salonId, null);
});

test("createBooking blocks personal subscription in explicit unpaid salon context", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barber,
    salons: [staffMembership(salonId), staffMembership(salonBId)],
  });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId: salonBId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  });
  assert.equal(createdBookings.length, 0);
});

test("createBooking blocks chair renter from salon staff seat access", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings);
  mockSalonScopedSeatAccess({
    seatSalonId: salonBId,
    resolvedBarber: {
      ...barber,
      salons: [
        staffMembership(salonBId, {
          relationshipType: "chair_renter",
          relationshipStatus: "accepted",
        }),
      ],
    },
  });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId: salonBId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createdBookings.length, 0);
});

test("updateBooking blocks accepting with paid seat from another salon", async () => {
  mockSalonScopedSeatAccess({ seatSalonId: salonId });
  const booking = createMutableBooking({ status: "pending", salonId: salonBId });
  Booking.findById = async () => booking;

  const res = createResponse();

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  });
  assert.equal(booking.status, "pending");
  assert.equal(booking.saveCalled, false);
});

test("createBooking blocks target barber with inactive salon seat subscription", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Subscription.findOne = async () => null;
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
            status: "expired",
          },
        },
      ],
    }),
  });
  User.findById = () => ({
    select: async (fields) =>
      fields === "name" ? { name: "Barber" } : barberWithSalon,
  });

  let serviceLookedUp = false;
  Service.findOne = async () => {
    serviceLookedUp = true;
    return null;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  });
  assert.equal(serviceLookedUp, false);
  assert.equal(createdBookings.length, 0);
});

test("createBooking allows paid target barber", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
});

test("booking only accepts active services owned by the selected barber", async () => {
  const createdBookings = [];
  let serviceQuery;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Service.findOne = async (query) => {
    serviceQuery = query;
    return null;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Service is not available for this barber");
  assert.deepEqual(serviceQuery, { _id: serviceId, barberId, active: true });
  assert.equal(createdBookings.length, 0);
});

test("booking from package service snapshots package name/duration/price on creation", async () => {
  const createdBookings = [];
  const packageServiceId = "64b000000000000000000099";
  const packageService = {
    _id: packageServiceId,
    barberId,
    name: "Hair + Beard Package",
    duration: 90,
    price: 200,
    type: "package",
    includedServiceIds: [serviceId, "64b000000000000000000098"],
    packagePriceMode: "sum",
    packageDurationMode: "sum",
  };

  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Service.findOne = async (query) => {
    if (String(query._id) === String(packageServiceId)) return packageService;
    return null;
  };
  Service.find = async () => [
    { _id: serviceId, barberId, active: true, type: "single", price: 100, duration: 45 },
    { _id: "64b000000000000000000098", barberId, active: true, type: "single", price: 100, duration: 45 },
  ];

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId: packageServiceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(String(res.body.serviceId), packageServiceId);
  assert.equal(res.body.serviceName, packageService.name);
  assert.equal(res.body.duration, packageService.duration);
  assert.equal(res.body.price, packageService.price);
  assert.equal(createdBookings.length, 1);
});

test("booking rejects a package with stale effective members", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Service.findOne = async () => ({
    _id: serviceId, barberId, name: "Stale package", active: true, type: "package",
    includedServiceIds: ["64b000000000000000000098", "64b000000000000000000099"],
  });
  Service.find = async () => [
    { _id: "64b000000000000000000098", barberId, active: true, type: "single", price: 100, duration: 30 },
  ];

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Service is not available for this barber" });
  assert.equal(createdBookings.length, 0);
});

test("booking snapshots package state revalidated inside the create transaction", async () => {
  const createdBookings = [];
  let memberLookup = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Service.findOne = async () => ({
    _id: serviceId, barberId, name: "Changing package", active: true, type: "package",
    includedServiceIds: ["64b000000000000000000098", "64b000000000000000000099"],
    packagePriceMode: "sum", packageDurationMode: "sum",
  });
  Service.find = async () => {
    memberLookup += 1;
    const price = memberLookup === 1 ? 50 : 125;
    const duration = memberLookup === 1 ? 20 : 35;
    return [
      { _id: "64b000000000000000000098", barberId, active: true, type: "single", price, duration },
      { _id: "64b000000000000000000099", barberId, active: true, type: "single", price, duration },
    ];
  };

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(memberLookup, 2);
  assert.equal(res.body.price, 250);
  assert.equal(res.body.duration, 70);
});

test("booking fails closed when a service deactivates after preflight readiness", async () => {
  const createdBookings = [];
  let serviceLookups = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Service.findOne = async () => {
    serviceLookups += 1;
    return serviceLookups === 1
      ? { _id: serviceId, barberId, name: "Cut", active: true, type: "single", price: 100, duration: 30 }
      : null;
  };

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Service is not available for this barber");
  assert.equal(createdBookings.length, 0);
});

test("booking fails closed when salon membership changes after preflight readiness", async () => {
  const createdBookings = [];
  let readinessLookups = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  User.findById = () => ({
    select: async (projection) => {
      if (!projection.includes("salon salonStatus")) return { name: "Barber" };
      readinessLookups += 1;
      return readinessLookups === 1 ? barberWithSalon : { ...barberWithSalon, salons: [] };
    },
  });

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  });
  assert.equal(createdBookings.length, 0);
});

test("direct booking revalidates session-bound profile readiness before persistence", async () => {
  const createdBookings = [];
  const sessions = [];
  let profileReads = 0;
  const session = createTransactionSession();
  const independentBarber = {
    ...barber,
    specialistOnboarding: {
      version: 1,
      status: "completed",
      currentStep: "review",
      workplace: "independent",
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  };
  mockSuccessfulCreateDependencies(createdBookings, independentBarber);
  __bookingCreateServiceTestHooks.startSession = async () => session;
  Subscription.findOne = async () => ({ _id: "individual-sub", status: "active" });
  BarberProfile.findOne = () => ({
    session(candidate) {
      sessions.push(candidate);
      return this;
    },
    select() {
      profileReads += 1;
      return { lean: async () => ({ barberId, address: profileReads === 1 ? "1 Main St" : "" }) };
    },
  });
  Schedule.findOne = async () => validSchedule();

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(sessions, [session]);
  assert.equal(createdBookings.length, 0);
});

test("booking fails closed when session-bound individual paid access is lost", async () => {
  const createdBookings = [];
  const sessions = [];
  let subscriptionReads = 0;
  const session = createTransactionSession();
  const independentBarber = {
    ...barber,
    specialistOnboarding: {
      version: 1, status: "completed", currentStep: "review", workplace: "independent",
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  };
  mockSuccessfulCreateDependencies(createdBookings, independentBarber);
  __bookingCreateServiceTestHooks.startSession = async () => session;
  BarberProfile.findOne = () => ({
    select: () => ({ lean: async () => ({ barberId, address: "1 Main St" }) }),
    lean: async () => ({}),
  });
  Schedule.findOne = async () => validSchedule();
  Subscription.findOne = () => {
    subscriptionReads += 1;
    const value = subscriptionReads === 1 ? { _id: "individual-sub", status: "active" } : null;
    return {
      session(candidate) {
        sessions.push(candidate);
        return Promise.resolve(value);
      },
      then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject);
      },
    };
  };
  SubscriptionSeat.find = () => ({
    session() { return this; },
    populate: () => ({ lean: async () => [] }),
  });

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(sessions, [session]);
  assert.equal(createdBookings.length, 0);
});

test("booking fails closed when a session-bound seat parent subscription loses access", async () => {
  const createdBookings = [];
  const sessions = [];
  const membershipSessions = [];
  let seatReads = 0;
  const session = createTransactionSession();
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  __bookingCreateServiceTestHooks.startSession = async () => session;
  Subscription.findOne = async () => null;
  User.findById = () => {
    let querySession = null;
    return {
      session(candidate) {
        querySession = candidate;
        return this;
      },
      select(fields) {
        if (fields === "salon salonStatus salons role" && querySession) {
          membershipSessions.push(querySession);
        }
        return Promise.resolve(barberWithSalon);
      },
    };
  };
  SubscriptionSeat.find = () => ({
    session(candidate) {
      sessions.push(candidate);
      return this;
    },
    populate: () => ({
      lean: async () => {
        seatReads += 1;
        return [{
          _id: "seat-1",
          barberId,
          salonId,
          status: "active",
          subscriptionId: { _id: "parent-sub", ownerId: salonId, status: seatReads === 1 ? "active" : "expired" },
        }];
      },
    }),
  });

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(sessions, [session]);
  assert.deepEqual(membershipSessions, [session]);
  assert.equal(createdBookings.length, 0);
});

test("transaction retries revalidate current service state before the committed booking", async () => {
  const createdBookings = [];
  let serviceLookups = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({
    createdBookings,
    withTransaction: async (callback) => {
      await callback();
      return callback();
    },
  });
  Service.findOne = async () => {
    serviceLookups += 1;
    const price = [100, 150, 200][serviceLookups - 1];
    return { _id: serviceId, barberId, name: "Retry Cut", active: true, type: "single", price, duration: 30 };
  };

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(serviceLookups, 3);
  assert.equal(createdBookings.length, 1);
  assert.equal(createdBookings[0].price, 200);
});

test("transaction retries revalidate session-bound paid access before committing", async () => {
  const createdBookings = [];
  const sessions = [];
  let subscriptionReads = 0;
  const independentBarber = {
    ...barber,
    specialistOnboarding: {
      version: 1, status: "completed", currentStep: "review", workplace: "independent",
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  };
  mockSuccessfulCreateDependencies(createdBookings, independentBarber);
  BarberProfile.findOne = () => ({
    select: () => ({ lean: async () => ({ barberId, address: "1 Main St" }) }),
    lean: async () => ({}),
  });
  Schedule.findOne = async () => validSchedule();
  const session = installTransactionalBookingCreate({
    createdBookings,
    withTransaction: async (callback) => {
      await callback();
      return callback();
    },
  });
  Subscription.findOne = () => {
    subscriptionReads += 1;
    const value = subscriptionReads < 3 ? { _id: "individual-sub", status: "active" } : null;
    return {
      session(candidate) {
        sessions.push(candidate);
        return Promise.resolve(value);
      },
      then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject);
      },
    };
  };
  SubscriptionSeat.find = () => ({
    session() { return this; },
    populate: () => ({ lean: async () => [] }),
  });

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(sessions, [session, session]);
  assert.equal(createdBookings.length, 0);
});

// ── Plain object and FormData validation ─────────────────────────

test("FormData: consultation JSON string 'null' returns 400 and cleans uploaded file", async () => {
  const filename = "cons-null-cleanup.jpg";
  const filePath = path.resolve(process.cwd(), "uploads", "booking-references", filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "cleanup test", "utf8");

  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: JSON.stringify(null),
        consent: JSON.stringify({ accepted: false }),
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid consultation JSON");
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(createdBookings.length, 0);
});

test("FormData: consultation JSON string '[]' returns 400 and cleans uploaded file", async () => {
  const filename = "cons-array-cleanup.jpg";
  const filePath = path.resolve(process.cwd(), "uploads", "booking-references", filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "cleanup test", "utf8");

  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: JSON.stringify([]),
        consent: JSON.stringify({ accepted: false }),
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid consultation JSON");
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(createdBookings.length, 0);
});

test("FormData: consent JSON string 'true' returns 400 and cleans uploaded file", async () => {
  const filename = "sent-true-cleanup.jpg";
  const filePath = path.resolve(process.cwd(), "uploads", "booking-references", filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "cleanup test", "utf8");

  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: JSON.stringify({ hairType: "straight" }),
        consent: JSON.stringify(true),
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid consent JSON");
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(createdBookings.length, 0);
});

test("FormData: consent JSON string '[]' returns 400 and cleans uploaded file", async () => {
  const filename = "sent-array-cleanup.jpg";
  const filePath = path.resolve(process.cwd(), "uploads", "booking-references", filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "cleanup test", "utf8");

  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: JSON.stringify({ hairType: "straight" }),
        consent: JSON.stringify([]),
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid consent JSON");
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(createdBookings.length, 0);
});

// ── Duplicate and overlap protection ─────────────────────────────

test("overlapping 10:20 booking is rejected against 10:00-11:00 booking", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    {
      _id: "booking-1",
      barberId,
      bookingDate,
      time: "10:00",
      duration: 60,
      status: "pending",
    },
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, "This time is already booked");
});

test("cancelled and rejected bookings do not block a slot", async () => {
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([
    {
      _id: "booking-1",
      barberId,
      bookingDate,
      time: "10:00",
      duration: 60,
      status: "cancelled",
    },
    {
      _id: "booking-2",
      barberId,
      bookingDate,
      time: "10:00",
      duration: 60,
      status: "rejected",
    },
  ]);

  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:20",
    duration: 20,
  });

  assert.equal(result.message, undefined);
  assert.ok(result.effectiveDayKey);
});

test("simultaneous duplicate booking attempts create only one booking", async () => {
  const createdBookings = [];
  mockCreateBookingDependencies(createdBookings);

  const body = {
    barberId,
    serviceId,
    createdBy: "barber",
    clientName: "Walk In",
    bookingDate,
    time: "10:00",
  };

  const [firstResponse, secondResponse] = await Promise.all([
    createResponse(),
    createResponse(),
  ].map((res) => createBooking({ user: barber, body }, res).then(() => res)));

  const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();

  assert.deepEqual(statusCodes, [201, 400]);
  assert.equal(createdBookings.length, 1);
  assert.equal(
    [firstResponse.body?.message, secondResponse.body?.message].includes(
      "This time is already booked"
    ),
    true
  );
});

test("booking slot conflict emits one safe terminal outcome", async () => {
  const createdBookings = [];
  mockCreateBookingDependencies(createdBookings);
  const createdLogger = createRequestLogger();
  const conflictLogger = createRequestLogger();
  const body = {
    barberId,
    serviceId,
    createdBy: "barber",
    clientName: "Walk In",
    bookingDate,
    time: "10:00",
  };
  const first = createResponse();
  const second = createResponse();

  await createBooking({ user: barber, log: createdLogger, body }, first);
  await createBooking({ user: barber, log: conflictLogger, body }, second);

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 400);
  assert.deepEqual(conflictLogger.infoCalls, [[{
    event: "booking.create.outcome",
    operation: "create",
    outcome: "slot_conflict",
    replay: false,
    statusCode: 400,
  }, "booking.create.outcome"]]);
  assert.equal(JSON.stringify(conflictLogger.infoCalls).includes("Walk In"), false);
});

// ── Reference image upload basics ─────────────────────────────────

test("booking create with referenceImages saves internal upload paths", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [
        { filename: "ref-before.jpg" },
        { filename: "ref-style.webp" },
      ],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(createdBookings[0].referenceImages, [
    "uploads/booking-references/ref-before.jpg",
    "uploads/booking-references/ref-style.webp",
  ]);
});

test("reference upload rejects more than five images", () => {
  const filename = "ref-too-many-cleanup.jpg";
  const filePath = createReferenceUploadFile(filename);
  const req = { files: [{ path: filePath }] };
  const res = createResponse();

  handleReferenceImageUploadError(
    req,
    res,
    { code: "LIMIT_UNEXPECTED_FILE" }
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Unexpected file field");
  assert.equal(fs.existsSync(filePath), false);
});

test("reference upload rejects non-image files", () => {
  const res = createResponse();

  handleReferenceImageUploadError(
    { files: [] },
    res,
    new Error("Image must be a JPEG, PNG, or WEBP image")
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Image must be a JPEG, PNG, or WEBP image");
});

test("booking create cleans uploaded reference files on validation failure", async () => {
  const filename = "ref-validation-failure.jpg";
  const filePath = createReferenceUploadFile(filename);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(fs.existsSync(filePath), false);
});

test("booking create cleans uploaded reference files on database error", async () => {
  const filename = "ref-db-error.jpg";
  const filePath = createReferenceUploadFile(filename);
  const createdBookings = [];
  const logger = createRequestLogger();
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });
  Booking.findOneAndUpdate = async () => {
    const error = new Error("database unavailable at /srv/uploads/reference");
    error.name = "../filesystem";
    throw error;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      log: logger,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create booking");
  assert.equal(fs.existsSync(filePath), false);
  assert.deepEqual(logger.calls, [[{
    err: { name: "Error" },
    event: "booking.controller_error",
    statusCode: 500,
    userId: client._id,
  }]]);
  assert.deepEqual(logger.warnCalls, [[{
    event: "booking.create.outcome",
    operation: "create",
    outcome: "internal_failure",
    replay: false,
    statusCode: 500,
  }, "booking.create.outcome"]]);
  assert.equal(JSON.stringify(logger.calls).includes("/srv/uploads/reference"), false);
  assert.equal(JSON.stringify(logger.calls).includes("../filesystem"), false);
  assert.equal(JSON.stringify(logger.calls).includes(filename), false);
});

test("booking create returns 503 and compensates promoted media when binding fails", async () => {
  const filename = "ref-activation-failure.jpg";
  const filePath = createReferenceUploadFile(filename);
  const createdBookings = [];
  let compensated = null;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });
  __bookingCreateServiceTestHooks.activateBookingReferenceMedia = async () => {
    throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE, {
      operation: "promote",
    });
  };
  __bookingCreateServiceTestHooks.compensateBookingReferenceMediaFailure = async (args) => {
    compensated = args;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.message, "Media storage is unavailable");
  assert.equal(createdBookings.length, 0);
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(compensated.media.length, 1);
  assert.equal(compensated.promotedMedia.length, 1);
});

test("booking create retries cleanly after a media activation failure", async () => {
  const firstFilename = "ref-retry-first.jpg";
  const secondFilename = "ref-retry-second.jpg";
  createReferenceUploadFile(firstFilename);
  createReferenceUploadFile(secondFilename);
  const createdBookings = [];
  let attempts = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });
  __bookingCreateServiceTestHooks.activateBookingReferenceMedia = async ({
    media = [],
  } = {}) => {
    attempts += 1;
    if (attempts === 1) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE, {
        operation: "promote",
      });
    }
    return media;
  };

  const firstRes = createResponse();
  await createBooking(
    {
      user: client,
      files: [{ filename: firstFilename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    firstRes
  );

  const secondRes = createResponse();
  await createBooking(
    {
      user: client,
      files: [{ filename: secondFilename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "11:30",
        salonId,
        clientName: "Client",
      },
    },
    secondRes
  );

  assert.equal(firstRes.statusCode, 503);
  assert.equal(secondRes.statusCode, 201);
  assert.equal(createdBookings.length, 1);
});

test("booking create with new reference media fails closed when transactions are unavailable", async () => {
  const filename = "ref-no-transaction.jpg";
  createReferenceUploadFile(filename);
  const createdBookings = [];
  let stageAttempts = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  __bookingCreateServiceTestHooks.supportsTransactions = async () => false;
  __bookingCreateServiceTestHooks.startSession = async () => null;
  __bookingCreateServiceTestHooks.stageBookingReferenceMedia = async () => {
    stageAttempts += 1;
    return [];
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 503);
  assert.equal(
    res.body.message,
    "Booking slot protection is temporarily unavailable"
  );
  assert.equal(createdBookings.length, 0);
  assert.equal(stageAttempts, 0);
});

test("media-free booking create uses the booking transaction when a session is available", async () => {
  const createdBookings = [];
  let startSessionAttempts = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  __bookingCreateServiceTestHooks.supportsTransactions = async () => true;
  __bookingCreateServiceTestHooks.startSession = async () => {
    startSessionAttempts += 1;
    return createTransactionSession();
  };
  Booking.findOneAndUpdate = async (query, update, options = {}) => {
    assert.ok(options.session);
    const booking = { ...update.$setOnInsert, _id: query._id };
    createdBookings.push(booking);
    return booking;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(startSessionAttempts, 1);
});

test("booking create maps transaction setup failures to protection-unavailable without side effects", async () => {
  const cases = [
    {
      label: "session rejection",
      startSession: async () => {
        throw new Error("startSession failed");
      },
    },
    {
      label: "invalid session",
      startSession: async () => ({ id: "bad-session" }),
    },
    {
      label: "transaction setup failure",
      startSession: async () => ({
        async withTransaction() {
          throw new Error("transaction setup failed");
        },
        async endSession() {},
      }),
    },
  ];

  for (const testCase of cases) {
    const filename = `ref-${testCase.label.replaceAll(" ", "-")}.jpg`;
    createReferenceUploadFile(filename);
    const createdBookings = [];
    let bookingWrites = 0;
    let holdWrites = 0;
    let paymentWrites = 0;
    let notificationWrites = 0;
    let mediaActivations = 0;
    let socketEmits = 0;
    let voucherWrites = 0;

    mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
    __bookingCreateServiceTestHooks.supportsTransactions = async () => true;
    __bookingCreateServiceTestHooks.startSession = testCase.startSession;
    __bookingCreateServiceTestHooks.activateBookingReferenceMedia = async () => {
      mediaActivations += 1;
      return [];
    };
    __bookingSideEffectsTestHooks.setGetIO(() => ({
      to: () => ({
        emit: () => {
          socketEmits += 1;
        },
      }),
    }));
    Booking.create = async () => {
      bookingWrites += 1;
      return null;
    };
    Booking.findOneAndUpdate = async () => {
      bookingWrites += 1;
      return null;
    };
    BookingSlotHold.bulkWrite = async () => {
      holdWrites += 1;
      return { ok: 1 };
    };
    BookingSlotHold.insertMany = async () => {
      holdWrites += 1;
      return [];
    };
    SubscriptionPaymentAttempt.create = async () => {
      paymentWrites += 1;
      return null;
    };
    Notification.create = async () => {
      notificationWrites += 1;
      return null;
    };
    Voucher.findOne = async () => {
      voucherWrites += 1;
      return null;
    };
    Voucher.findOneAndUpdate = async () => {
      voucherWrites += 1;
      return null;
    };
    Voucher.findByIdAndUpdate = async () => {
      voucherWrites += 1;
      return null;
    };

    const res = createResponse();
    await createBooking(
      {
        user: client,
        files: [{ filename }],
        body: {
          barberId,
          clientId,
          serviceId,
          bookingDate,
          time: "10:00",
          salonId,
          clientName: "Client",
          promotionCode: "SAVE10",
        },
      },
      res
    );

    assert.equal(res.statusCode, 503, testCase.label);
    assert.deepEqual(res.body, {
      message: "Booking slot protection is temporarily unavailable",
    });
    assert.equal(createdBookings.length, 0);
    assert.equal(bookingWrites, 0);
    assert.equal(holdWrites, 0);
    assert.equal(paymentWrites, 0);
    assert.equal(notificationWrites, 0);
    assert.equal(mediaActivations, 0);
    assert.equal(socketEmits, 0);
    assert.equal(voucherWrites, 0);
    __bookingSideEffectsTestHooks.resetGetIO();
  }
});

test("duplicate transaction callback execution does not create duplicate bookings", async () => {
  const filename = "ref-duplicate-callback.jpg";
  createReferenceUploadFile(filename);
  const createdBookings = [];
  let activationAttempts = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({
    createdBookings,
    withTransaction: async (callback) => {
      await callback();
      return callback();
    },
  });
  __bookingCreateServiceTestHooks.activateBookingReferenceMedia = async ({ media = [] } = {}) => {
    activationAttempts += 1;
    return media;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(activationAttempts, 2);
});

test("voucher claim and redemption roll back before a retried booking transaction commits", async () => {
  const createdBookings = [];
  const voucher = {
    _id: "voucher-transaction-retry",
    code: "RETRY10",
    ownerType: "barber",
    ownerId: barberId,
    amount: 10,
    discountType: "fixed",
    active: true,
    currentUses: 0,
    maxUses: 1,
    redemptionBookingIds: [],
  };
  let transactionAttempts = 0;
  let claimAttempts = 0;
  let pendingHoldWrites = 0;
  let committedHoldWrites = 0;
  let notificationWrites = 0;
  let socketEmits = 0;

  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({
    createdBookings,
    withTransaction: async (callback) => {
      transactionAttempts += 1;
      await callback();
      const transientError = Object.assign(new Error("transient transaction failure"), {
        hasErrorLabel: (label) => label === "TransientTransactionError",
      });
      try {
        throw transientError;
      } catch (error) {
        assert.equal(error.hasErrorLabel("TransientTransactionError"), true);
      }
      voucher.currentUses = 0;
      voucher.redemptionBookingIds = [];
      pendingHoldWrites = 0;
      transactionAttempts += 1;
      const result = await callback();
      committedHoldWrites = pendingHoldWrites;
      return result;
    },
  });
  BookingSlotHold.bulkWrite = async (operations, options) => {
    assert.ok(options?.session);
    pendingHoldWrites += operations.length;
    return { ok: 1 };
  };
  Voucher.find = async (query, _projection, options) => {
    assert.equal(query.code, "RETRY10");
    assert.deepEqual(query.$or, [
      { ownerType: "barber", ownerId: barberId },
      { ownerType: "salon", ownerId: salonId },
    ]);
    assert.ok(options?.session);
    return [voucher];
  };
  Voucher.findOneAndUpdate = async (_filter, update, options) => {
    assert.ok(options?.session);
    assert.equal(voucher.currentUses, 0);
    claimAttempts += 1;
    const claimed = { ...voucher };
    voucher.currentUses += update.$inc.currentUses;
    voucher.redemptionBookingIds.push(update.$addToSet.redemptionBookingIds);
    return claimed;
  };
  Notification.create = async () => {
    notificationWrites += 1;
  };
  __bookingSideEffectsTestHooks.setGetIO(() => ({
    to: () => ({
      emit: (event) => {
        if (event === "bookingUpdated") socketEmits += 1;
      },
    }),
  }));

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        voucherCode: "RETRY10",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(transactionAttempts, 2);
  assert.equal(claimAttempts, 2);
  assert.equal(createdBookings.length, 1);
  assert.equal(committedHoldWrites > 0, true);
  assert.equal(voucher.currentUses, 1);
  assert.deepEqual(voucher.redemptionBookingIds, [createdBookings[0]._id]);
  assert.equal(notificationWrites, 1);
  assert.equal(socketEmits, 2);
});

test("transaction-capable booking create uses a Mongo session for booking and media activation", async () => {
  const filename = "ref-transaction.jpg";
  createReferenceUploadFile(filename);
  const createdBookings = [];
  const session = createTransactionSession();
  let bookingCreateSession = null;
  let mediaActivationSession = null;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  __bookingCreateServiceTestHooks.supportsTransactions = async () => true;
  __bookingCreateServiceTestHooks.startSession = async () => session;
  Booking.findOneAndUpdate = async (query, update, options = {}) => {
    bookingCreateSession = options.session;
    const booking = { ...update.$setOnInsert, _id: query._id };
    createdBookings.push(booking);
    return booking;
  };
  __bookingCreateServiceTestHooks.activateBookingReferenceMedia = async ({
    media = [],
    session: activationSession,
  } = {}) => {
    mediaActivationSession = activationSession;
    return media;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(bookingCreateSession, session);
  assert.equal(mediaActivationSession, session);
});

test("transaction rollback compensates promoted booking reference media before returning 500", async () => {
  const filename = "ref-transaction-rollback.jpg";
  createReferenceUploadFile(filename);
  const createdBookings = [];
  let compensated = null;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({
    createdBookings,
    withTransaction: async (callback) => {
      await callback();
      throw new Error("transaction commit failed");
    },
  });
  __bookingCreateServiceTestHooks.compensateBookingReferenceMediaFailure = async (args) => {
    compensated = args;
  };

  const res = createResponse();
  console.error = () => {};

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create booking");
  assert.equal(Array.isArray(compensated.promotedMedia), true);
  assert.equal(compensated.promotedMedia.length, 1);
});

test("createBooking validation error returns 400", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const logger = {
    error() {
      throw new Error("logger failure");
    },
  };
  Booking.create = async () => {
    const error = new Error("Booking validation failed");
    error.name = "ValidationError";
    throw error;
  };
  Booking.findOneAndUpdate = async () => {
    const error = new Error("Booking validation failed");
    error.name = "ValidationError";
    throw error;
  };

  const res = createResponse();

  await createBooking(
    {
      user: client,
      log: logger,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Booking validation failed");
});

// ── Consultation and consent create flow ──────────────────────────

test("create booking with consultation data saves consultation", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: {
          hairType: "curly",
          chemicalTreatments: "bleach",
          allergies: "none",
          scalpSensitivity: "mild",
          desiredOutcome: "short layers",
          notes: "prefer natural look",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepStrictEqual(createdBookings[0].consultation, {
    hairType: "curly",
    chemicalTreatments: "bleach",
    allergies: "none",
    scalpSensitivity: "mild",
    desiredOutcome: "short layers",
    notes: "prefer natural look",
  });
});

test("create booking with consent accepted and textVersion saves accepted=true and server-side acceptedAt", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();
  const clientAcceptedAt = "2020-01-01T00:00:00.000Z";

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consent: {
          accepted: true,
          acceptedAt: clientAcceptedAt,
          textVersion: "v1.0",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].consent.accepted, true);
  assert.equal(createdBookings[0].consent.textVersion, "v1.0");
  // Client-provided acceptedAt must be replaced by server-side Date
  assert.notEqual(createdBookings[0].consent.acceptedAt, clientAcceptedAt);
  assert.ok(createdBookings[0].consent.acceptedAt instanceof Date);
});

test("create booking with consent accepted but missing textVersion returns 400", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consent: {
          accepted: true,
          textVersion: "",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Consent requires a non-empty textVersion");
  assert.equal(createdBookings.length, 0);
});

test("client-provided consent.acceptedAt is ignored and replaced server-side", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consent: {
          accepted: true,
          acceptedAt: "2019-06-15T12:00:00.000Z",
          textVersion: "v1.0",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.notEqual(
    String(createdBookings[0].consent.acceptedAt),
    "2019-06-15T12:00:00.000Z"
  );
});

test("existing reference image create tests still pass after consultation/consent changes", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [
        { filename: "existing-ref-a.jpg" },
        { filename: "existing-ref-b.jpg" },
      ],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: { hairType: "fine" },
        consent: { accepted: true, textVersion: "v1.0" },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(createdBookings[0].referenceImages, [
    "uploads/booking-references/existing-ref-a.jpg",
    "uploads/booking-references/existing-ref-b.jpg",
  ]);
  assert.deepEqual(createdBookings[0].consultation, { hairType: "fine" });
  assert.equal(createdBookings[0].consent.accepted, true);
  assert.equal(createdBookings[0].consent.textVersion, "v1.0");
});

// ── Contract/integration tests: frontend-shaped payload ───────────

test("contract: frontend-shaped consultation payload persists all canonical fields", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  // This payload matches what the frontend ClientDetailsStep now sends
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: {
          hairType: "curly",
          chemicalTreatments: "bleach + color",
          allergies: "sulfates",
          scalpSensitivity: "mild",
          desiredOutcome: "soft layers with volume",
          notes: "prefer natural look",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  const saved = createdBookings[0].consultation;
  assert.equal(saved.hairType, "curly");
  assert.equal(saved.chemicalTreatments, "bleach + color");
  assert.equal(saved.allergies, "sulfates");
  assert.equal(saved.scalpSensitivity, "mild");
  assert.equal(saved.desiredOutcome, "soft layers with volume");
  assert.equal(saved.notes, "prefer natural look");
});

test("contract: frontend-shaped consent payload persists accepted and textVersion, acceptedAt is server-side", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  // This payload matches what the frontend ClientDetailsStep now sends
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consent: {
          accepted: true,
          textVersion: "v1.0",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].consent.accepted, true);
  assert.equal(createdBookings[0].consent.textVersion, "v1.0");
  // acceptedAt must be set server-side (a Date, not undefined/null)
  assert.ok(createdBookings[0].consent.acceptedAt instanceof Date);
  // consentDate must NOT exist (frontend no longer sends it)
  assert.equal(createdBookings[0].consent.consentDate, undefined);
});

test("contract: consent accepted without textVersion returns 400", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consent: {
          accepted: true,
          textVersion: "",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Consent requires a non-empty textVersion");
  assert.equal(createdBookings.length, 0);
});

test("contract: consentDate extra field does not break booking creation", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  // Old frontend shape — must not break; the extra consentDate field
  // passes through in test mocks but is stripped by Mongoose strict mode in prod
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consent: {
          accepted: true,
          textVersion: "v1.0",
          consentDate: "2026-05-26T09:00:00.000Z", // extra field (legacy)
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].consent.accepted, true);
  // Server must always set acceptedAt (ignoring client's consentDate)
  assert.ok(createdBookings[0].consent.acceptedAt instanceof Date);
  // acceptedAt must NOT equal the client-provided consentDate
  assert.notEqual(
    String(createdBookings[0].consent.acceptedAt),
    "2026-05-26T09:00:00.000Z"
  );
  // The frontend canonical shape does NOT use consentDate
  // (Mongoose strict:true strips it in production)
  // Test: frontend display uses acceptedAt, not consentDate
  assert.ok(createdBookings[0].consent.textVersion, "v1.0");
});

test("contract: consent without accepted defaults to false", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        // No consent at all
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].consent.accepted, false);
  assert.equal(createdBookings[0].consent.acceptedAt, null);
});

test("contract: reference images + full consultation + consent still works", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [
        { filename: "ref-a.jpg" },
        { filename: "ref-b.jpg" },
      ],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: {
          hairType: "wavy",
          chemicalTreatments: "perm",
          allergies: "none",
          scalpSensitivity: "normal",
          desiredOutcome: "beachy waves",
          notes: "keep length",
        },
        consent: {
          accepted: true,
          textVersion: "v1.0",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  const saved = createdBookings[0];
  assert.deepEqual(saved.referenceImages, [
    "uploads/booking-references/ref-a.jpg",
    "uploads/booking-references/ref-b.jpg",
  ]);
  assert.equal(saved.consultation.hairType, "wavy");
  assert.equal(saved.consultation.chemicalTreatments, "perm");
  assert.equal(saved.consultation.allergies, "none");
  assert.equal(saved.consultation.scalpSensitivity, "normal");
  assert.equal(saved.consultation.desiredOutcome, "beachy waves");
  assert.equal(saved.consultation.notes, "keep length");
  assert.equal(saved.consent.accepted, true);
  assert.equal(saved.consent.textVersion, "v1.0");
  assert.ok(saved.consent.acceptedAt instanceof Date);
});

// ── Multipart serialization create flow ──────────────────────────

test("FormData: JSON-stringified consultation + consent + referenceImages all persist correctly", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [
        { filename: "multipart-before.jpg" },
        { filename: "multipart-after.jpg" },
      ],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        // Simulates what the browser FormData sends after frontend JSON.stringify
        consultation: JSON.stringify({
          hairType: "curly",
          chemicalTreatments: "bleach",
          allergies: "none",
          scalpSensitivity: "mild",
          desiredOutcome: "short layers",
          notes: "prefer natural look",
        }),
        consent: JSON.stringify({
          accepted: true,
          textVersion: "v2.0",
        }),
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  const saved = createdBookings[0];
  assert.deepEqual(saved.referenceImages, [
    "uploads/booking-references/multipart-before.jpg",
    "uploads/booking-references/multipart-after.jpg",
  ]);
  assert.equal(saved.consultation.hairType, "curly");
  assert.equal(saved.consultation.chemicalTreatments, "bleach");
  assert.equal(saved.consultation.allergies, "none");
  assert.equal(saved.consultation.scalpSensitivity, "mild");
  assert.equal(saved.consultation.desiredOutcome, "short layers");
  assert.equal(saved.consultation.notes, "prefer natural look");
  assert.equal(saved.consent.accepted, true);
  assert.equal(saved.consent.textVersion, "v2.0");
  assert.ok(saved.consent.acceptedAt instanceof Date);
});

test("FormData: malformed consultation JSON string with uploaded file returns 400 and cleans up", async () => {
  const filename = "malformed-consultation-cleanup.jpg";
  const filePath = path.resolve(process.cwd(), "uploads", "booking-references", filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "cleanup test", "utf8");

  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: "{broken json",
        consent: JSON.stringify({ accepted: false }),
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid consultation JSON");
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(createdBookings.length, 0);
});

test("FormData: malformed consent JSON string with uploaded file returns 400 and cleans up", async () => {
  const filename = "malformed-consent-cleanup.jpg";
  const filePath = path.resolve(process.cwd(), "uploads", "booking-references", filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "cleanup test", "utf8");

  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const res = createResponse();

  await createBooking(
    {
      user: client,
      files: [{ filename }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        consultation: JSON.stringify({ hairType: "straight" }),
        consent: "{broken json",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid consent JSON");
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(createdBookings.length, 0);
});

test("createBooking with enabled deposit stores pending deposit fields", async () => {
  const createdBookings = [];
  const paymentAttempts = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const createBookingRecord = Booking.findOneAndUpdate;
  Booking.findOneAndUpdate = async (...args) => {
    const booking = await createBookingRecord(...args);
    booking.currency = "AMD";
    booking.paidAmount = 0;
    booking.paymentStatus = "pending";
    booking.paymentProvider = "mock";
    booking.refundStatus = "none";
    booking.refundedAmount = 0;
    booking.paymentTransactionIds = ["64b000000000000000009001"];
    booking.refundTransactionIds = ["64b000000000000000009002"];
    booking.providerPaymentId = "provider-payment-private";
    booking.providerTransactionId = "provider-transaction-private";
    booking.rawWebhookPayload = { secret: true };
    return booking;
  };
  let paymentAttempt;
  SubscriptionPaymentAttempt.findOneAndUpdate = async (_filter, update) => {
    if (update.$setOnInsert) {
      paymentAttempts.push(update.$setOnInsert);
      paymentAttempt = { _id: "deposit-payment-attempt-1", ...update.$setOnInsert };
      return paymentAttempt;
    }
    Object.assign(paymentAttempt, update.$set);
    return paymentAttempt;
  };
  BarberProfile.findOne = () => ({
    lean: async () => ({
      depositSettings: {
        enabled: true,
        mode: "percentage",
        value: 25,
        minimumBookingPrice: null,
        noShowPolicyText: "No-show deposit policy",
      },
    }),
  });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].depositRequired, true);
  assert.equal(createdBookings[0].depositAmount, 25);
  assert.equal(createdBookings[0].depositStatus, "pending");
  assert.equal(createdBookings[0].depositMode, "percentage");
  assert.equal(createdBookings[0].depositValue, 25);
  assert.equal(createdBookings[0].depositPolicyText, "No-show deposit policy");
  assert.equal(paymentAttempts.length, 1);
  assert.equal(paymentAttempts[0].purpose, "booking_deposit");
  assert.equal(paymentAttempts[0].amount, 25);
  assert.equal(paymentAttempts[0].status, "pending");
  assert.equal(res.body.payment.paymentAttemptId, "deposit-payment-attempt-1");
  assert.equal(res.body.payment.paymentStatus, "pending");
  assert.equal(res.body.currency, "AMD");
  assert.equal(res.body.paymentStatus, "pending");
  assert.equal(res.body.paymentProvider, "mock");
  assert.equal(res.body.refundStatus, "none");
  assert.equal(res.body.paymentTransactionIds, undefined);
  assert.equal(res.body.refundTransactionIds, undefined);
  assert.equal(res.body.providerPaymentId, undefined);
  assert.equal(res.body.providerTransactionId, undefined);
  assert.equal(res.body.rawWebhookPayload, undefined);
});

test("createBooking reads deposit settings through the active transaction session", async () => {
  const createdBookings = [];
  const sessions = [];
  const session = createTransactionSession();
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  __bookingCreateServiceTestHooks.startSession = async () => session;
  BarberProfile.findOne = () => ({
    session(candidate) {
      sessions.push(candidate);
      return this;
    },
    lean: async () => ({
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 25,
        minimumBookingPrice: null,
        noShowPolicyText: "Session-bound deposit policy",
      },
    }),
  });

  const res = createResponse();
  await createBooking({
    user: client,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(sessions, [session]);
  assert.equal(createdBookings[0].depositAmount, 25);
  assert.equal(createdBookings[0].depositPolicyText, "Session-bound deposit policy");
});

test("createBooking with disabled payment provider leaves required deposit pending without payment attempt", async () => {
  process.env.PAYMENT_PROVIDER = "disabled";
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  SubscriptionPaymentAttempt.create = async () => {
    assert.fail("Disabled provider should not create a payment attempt");
  };
  BarberProfile.findOne = () => ({
    lean: async () => ({
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 50,
        minimumBookingPrice: null,
        noShowPolicyText: "No-show deposit policy",
      },
    }),
  });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].depositRequired, true);
  assert.equal(createdBookings[0].depositStatus, "pending");
  assert.equal(res.body.payment.paymentAttemptId, null);
  assert.equal(res.body.payment.paymentStatus, "pending");
  assert.equal(res.body.payment.checkoutUrl, null);
  assert.match(res.body.payment.message, /online payment is not enabled/i);
});

test("createBooking with disabled deposit keeps old no-deposit behavior", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  BarberProfile.findOne = () => ({
    lean: async () => ({
      depositSettings: {
        enabled: false,
        mode: "fixed",
        value: 50,
        minimumBookingPrice: null,
        noShowPolicyText: "Hidden when disabled",
      },
    }),
  });

  const res = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].depositRequired, false);
  assert.equal(createdBookings[0].depositAmount, 0);
  assert.equal(createdBookings[0].depositStatus, "not_required");
  assert.equal(createdBookings[0].depositMode, "");
  assert.equal(createdBookings[0].depositValue, 0);
  assert.equal(createdBookings[0].depositPolicyText, "");
  assert.equal(res.body.depositRequired, false);
  assert.equal(res.body.depositAmount, 0);
  assert.equal(res.body.depositStatus, "not_required");
  assert.equal(res.body.payment, undefined);
  assert.equal(res.body.depositPayment, undefined);
  assert.equal(res.body.paymentStatus, undefined);
  assert.equal(res.body.paymentProvider, undefined);
});

test("deposit profile lookup failure aborts booking creation instead of disabling deposits", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  BarberProfile.findOne = () => ({
    lean: async () => {
      throw new Error("deposit profile database unavailable");
    },
  });
  Notification.create = async () => {
    assert.fail("Notification must not be created when the transaction aborts");
  };

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create booking");
  assert.equal(createdBookings.length, 0);
});

test("pricing infrastructure failures return a generic booking error", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Voucher.find = async () => {
    throw new Error("database credentials must stay private");
  };

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        voucherCode: "SAVE10",
      },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create booking");
  assert.equal(JSON.stringify(res.body).includes("database credentials"), false);
  assert.equal(createdBookings.length, 0);
});

test("public pricing validation errors keep their existing client message", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Voucher.find = async () => {
    const error = new Error("Voucher is no longer available");
    error.statusCode = 400;
    throw error;
  };

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
        voucherCode: "SAVE10",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Voucher is no longer available");
  assert.equal(createdBookings.length, 0);
});

test("post-commit notification failure still returns the created booking", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  Notification.create = async () => {
    throw new Error("notification store unavailable");
  };

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(String(res.body._id), String(createdBookings[0]._id));
});

test("post-commit realtime failure still returns the created booking", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  __bookingSideEffectsTestHooks.setGetIO(() => ({
    to: () => ({
      emit() {
        throw new Error("socket unavailable");
      },
    }),
  }));

  const res = createResponse();
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings.length, 1);
});

const idempotentBookingRequest = ({ key, body = {}, user = client, log } = {}) => ({
  user,
  log,
  get: (name) => (name === "Idempotency-Key" ? key : undefined),
  body: {
    barberId,
    clientId: user._id,
    serviceId,
    bookingDate,
    time: "10:00",
    salonId,
    clientName: user.name || "Client",
    ...body,
  },
});

test("booking create emits safe fresh, replay, and idempotency-conflict outcomes", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installBookingCreateIdempotencyStore(createdBookings);
  const freshLogger = createRequestLogger();
  const replayLogger = createRequestLogger();
  const conflictLogger = createRequestLogger();
  const key = "booking-observability-key-1";
  const sensitiveNote = "private booking note";

  const fresh = createResponse();
  const replay = createResponse();
  const conflict = createResponse();
  await createBooking(idempotentBookingRequest({
    key,
    log: freshLogger,
    body: { note: sensitiveNote, clientPhone: "+37499123456" },
  }), fresh);
  await createBooking(idempotentBookingRequest({
    key,
    log: replayLogger,
    body: { note: sensitiveNote, clientPhone: "+37499123456" },
  }), replay);
  await createBooking(idempotentBookingRequest({
    key,
    log: conflictLogger,
    body: { time: "11:00", note: sensitiveNote },
  }), conflict);

  assert.equal(fresh.statusCode, 201);
  assert.equal(replay.statusCode, 201);
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(freshLogger.infoCalls, [[{
    event: "booking.create.outcome",
    operation: "create",
    outcome: "created",
    replay: false,
    statusCode: 201,
  }, "booking.create.outcome"]]);
  assert.deepEqual(replayLogger.infoCalls, [[{
    event: "booking.create.outcome",
    operation: "create",
    outcome: "idempotency_replay",
    replay: true,
    statusCode: 201,
  }, "booking.create.outcome"]]);
  assert.deepEqual(conflictLogger.infoCalls, [[{
    event: "booking.create.outcome",
    operation: "create",
    outcome: "idempotency_conflict",
    replay: false,
    statusCode: 409,
  }, "booking.create.outcome"]]);
  const output = JSON.stringify([freshLogger.infoCalls, replayLogger.infoCalls, conflictLogger.infoCalls]);
  assert.equal(output.includes(key), false);
  assert.equal(output.includes(sensitiveNote), false);
  assert.equal(output.includes("+37499123456"), false);
});

test("booking observability logger failures do not change a successful create", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const response = createResponse();
  const logger = {
    info() {
      throw new Error("observability unavailable");
    },
    warn() {
      throw new Error("observability unavailable");
    },
  };

  await createBooking({
    user: client,
    log: logger,
    body: { barberId, clientId, serviceId, bookingDate, time: "10:00", salonId, clientName: "Client" },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(createdBookings.length, 1);
});

test("booking create replays a same actor/key request without duplicate side effects", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const operations = installBookingCreateIdempotencyStore(createdBookings);
  let notifications = 0;
  Notification.create = async (payload) => {
    notifications += 1;
    return payload;
  };

  const first = createResponse();
  const replay = createResponse();
  await createBooking(idempotentBookingRequest({ key: "booking-create-replay-1" }), first);
  await createBooking(idempotentBookingRequest({ key: "booking-create-replay-1" }), replay);

  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.body._id, first.body._id);
  assert.equal(createdBookings.length, 1);
  assert.equal(operations.length, 1);
  assert.equal(getMockBookingPostCommitDispatches().length, 1);
  assert.equal(
    String(getMockBookingPostCommitDispatches()[0].bookingId),
    String(first.body._id)
  );
  assert.equal(notifications, 1);
});

test("booking create fails the transaction when required dispatch persistence fails", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installTransactionalBookingCreate({ createdBookings });
  mockBookingPostCommitDispatchModel({
    createError: new Error("dispatch persistence unavailable"),
  });

  const response = createResponse();
  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    response
  );

  assert.equal(response.statusCode, 500);
  assert.equal(createdBookings.length, 0);
  assert.equal(getMockBookingPostCommitDispatches().length, 0);
});

test("booking create replays accepted consent without treating its server timestamp as new intent", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const operations = installBookingCreateIdempotencyStore(createdBookings);
  const body = {
    consultation: { hairType: "curly" },
    consent: { accepted: true, textVersion: "v1" },
  };
  const first = createResponse();
  const replay = createResponse();

  await createBooking(idempotentBookingRequest({ key: "booking-create-consent-1", body }), first);
  await createBooking(idempotentBookingRequest({ key: "booking-create-consent-1", body }), replay);

  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(operations.length, 1);
  assert.match(operations[0].keyHash, /^[a-f0-9]{64}$/);
  assert.notEqual(operations[0].keyHash, "booking-create-consent-1");
});

test("booking replay resumes a committed deposit exactly once after initial payment setup fails", async () => {
  process.env.PAYMENT_PROVIDER = "mock";
  const createdBookings = [];
  const initialLogger = createRequestLogger();
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installBookingCreateIdempotencyStore(createdBookings);
  BarberProfile.findOne = () => ({
    lean: async () => ({ depositSettings: { enabled: true, mode: "fixed", value: 25 } }),
  });
  let initialClaim = true;
  let attempt = null;
  let providerCalls = 0;
  MockPaymentProvider.prototype.createPaymentIntent = async () => {
    providerCalls += 1;
    return {
      providerPaymentId: "mock-replay-payment-1",
      checkoutUrl: "/mock-payments/mock-replay-payment-1",
      status: "requires_action",
    };
  };
  SubscriptionPaymentAttempt.findOneAndUpdate = async (_filter, update) => {
    if (update.$setOnInsert) {
      if (initialClaim) {
        initialClaim = false;
        throw new Error("payment store temporarily unavailable");
      }
      if (!attempt) attempt = { _id: "deposit-replay-attempt-1", ...update.$setOnInsert };
      return attempt;
    }
    Object.assign(attempt, update.$set);
    return attempt;
  };

  const first = createResponse();
  const replay = createResponse();
  const repeatedReplay = createResponse();
  await createBooking(idempotentBookingRequest({
    key: "booking-create-deposit-replay-1",
    log: initialLogger,
  }), first);
  await createBooking(idempotentBookingRequest({ key: "booking-create-deposit-replay-1" }), replay);
  await createBooking(idempotentBookingRequest({ key: "booking-create-deposit-replay-1" }), repeatedReplay);

  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 201);
  assert.equal(repeatedReplay.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(replay.body.payment.paymentAttemptId, "deposit-replay-attempt-1");
  assert.equal(repeatedReplay.body.payment.checkoutUrl, "/mock-payments/mock-replay-payment-1");
  assert.equal(providerCalls, 1);
  assert.deepEqual(initialLogger.warnCalls, [[{
    event: "booking.deposit.recovery",
    operation: "create",
    outcome: "initialization_recovered",
  }, "booking.deposit.recovery"]]);
});

test("concurrent same-key booking creates commit once", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const operations = installBookingCreateIdempotencyStore(createdBookings);
  const first = createResponse();
  const second = createResponse();

  await Promise.all([
    createBooking(idempotentBookingRequest({ key: "booking-create-concurrent-1" }), first),
    createBooking(idempotentBookingRequest({ key: "booking-create-concurrent-1" }), second),
  ]);

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201);
  assert.equal(createdBookings.length, 1);
  assert.equal(operations.length, 1);
});

test("booking create rejects a reused idempotency key with changed intent", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  installBookingCreateIdempotencyStore(createdBookings);

  const first = createResponse();
  const conflict = createResponse();
  await createBooking(idempotentBookingRequest({ key: "booking-create-conflict-1" }), first);
  await createBooking(
    idempotentBookingRequest({
      key: "booking-create-conflict-1",
      body: { time: "11:00" },
    }),
    conflict
  );

  assert.equal(first.statusCode, 201);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.message, "Idempotency-Key was already used with a different request");
  assert.equal(createdBookings.length, 1);
});

test("booking idempotency keys are actor-scoped and legacy requests remain unchanged", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const operations = installBookingCreateIdempotencyStore(createdBookings);
  const other = { ...client, _id: "64b000000000000000000008", id: "64b000000000000000000008", name: "Other Client" };

  const legacy = createResponse();
  await createBooking(idempotentBookingRequest({ key: undefined, body: { time: "09:00" } }), legacy);
  const first = createResponse();
  await createBooking(idempotentBookingRequest({ key: "shared-key-1" }), first);
  const otherActor = createResponse();
  await createBooking(
    idempotentBookingRequest({ key: "shared-key-1", user: other, body: { time: "11:00" } }),
    otherActor
  );

  assert.equal(legacy.statusCode, 201);
  assert.equal(first.statusCode, 201);
  assert.equal(otherActor.statusCode, 201);
  assert.equal(createdBookings.length, 3);
  assert.equal(operations.length, 2);
});

test("independent keyed bookings replay by key while different keys remain distinct", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barber);
  const operations = installBookingCreateIdempotencyStore(createdBookings);
  const first = createResponse();
  const replay = createResponse();
  const distinct = createResponse();

  await createBooking(idempotentBookingRequest({
    key: "independent-booking-key-1",
    body: { salonId: null, time: "10:00" },
  }), first);
  await createBooking(idempotentBookingRequest({
    key: "independent-booking-key-1",
    body: { salonId: null, time: "10:00" },
  }), replay);
  await createBooking(idempotentBookingRequest({
    key: "independent-booking-key-2",
    body: { salonId: null, time: "11:00" },
  }), distinct);

  assert.equal(first.statusCode, 201);
  assert.equal(replay.body._id, first.body._id);
  assert.equal(distinct.statusCode, 201);
  assert.equal(createdBookings.length, 2);
  assert.equal(operations.length, 2);
});

test("booking create rejects malformed Idempotency-Key before mutation", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const logger = createRequestLogger();
  const res = createResponse();

  await createBooking(idempotentBookingRequest({
    key: "not a valid key",
    log: logger,
  }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Idempotency-Key must be a valid non-empty token");
  assert.equal(createdBookings.length, 0);
  assert.deepEqual(logger.infoCalls, [[{
    event: "booking.create.outcome",
    operation: "create",
    outcome: "controlled_rejection",
    replay: false,
    statusCode: 400,
  }, "booking.create.outcome"]]);
  assert.equal(JSON.stringify([logger.infoCalls, logger.calls]).includes("not a valid key"), false);
});

test("unexpected revalidation failure compensates staged reference media", async () => {
  const createdBookings = [];
  let compensation = null;
  let slotChecks = 0;
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const findSlotHold = BookingSlotHold.findOne;
  BookingSlotHold.findOne = (...args) => {
    slotChecks += 1;
    if (slotChecks === 2) {
      throw new Error("slot lookup unavailable");
    }
    return findSlotHold(...args);
  };
  __bookingCreateServiceTestHooks.compensateBookingReferenceMediaFailure = async (args) => {
    compensation = args;
  };

  const res = createResponse();
  await createBooking(
    {
      user: client,
      files: [{ filename: "revalidation-failure.jpg" }],
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        salonId,
        clientName: "Client",
      },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(createdBookings.length, 0);
  assert.equal(compensation?.media.length, 1);
  assert.equal(compensation?.error.message, "slot lookup unavailable");
});
