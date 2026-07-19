import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import fs from "fs";
import path from "path";

import { __bookingTestHooks, createBooking, updateBooking } from "./bookingController.js";
import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import { handleReferenceImageUploadError } from "../../middleware/uploadMiddleware.js";
import { explicitAllDaysOffMarker } from "../../utils/scheduleUtils.js";

import {
  barber,
  barberId,
  barberWithSalon,
  bookingDate,
  client,
  clientId,
  createMutableBooking,
  createResponse,
  mockBookingFind,
  mockCreateBookingDependencies,
  mockSuccessfulCreateDependencies,
  originalMethods,
  salonBId,
  salonId,
  serviceId,
  sundayBookingDate,
} from "./bookingController.testUtils.js";

const originalConsoleError = console.error;
const originalPaymentProvider = process.env.PAYMENT_PROVIDER;

const oldAutoClosedWeeklySchedule = {
  sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  tue: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  wed: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  thu: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  fri: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
};

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  BarberProfile.findOne = originalMethods.barberProfileFindOne;
  Notification.create = originalMethods.notificationCreate;
  Salon.exists = originalMethods.salonExists;
  Salon.findById = originalMethods.salonFindById;
  Schedule.findOne = originalMethods.scheduleFindOne;
  Service.findOne = originalMethods.serviceFindOne;
  Subscription.findOne = originalMethods.subscriptionFindOne;
  SubscriptionPaymentAttempt.create = originalMethods.subscriptionPaymentAttemptCreate;
  SubscriptionSeat.find = originalMethods.subscriptionSeatFind;
  SubscriptionSeat.findOne = originalMethods.subscriptionSeatFindOne;
  User.findById = originalMethods.userFindById;
  if (originalPaymentProvider === undefined) {
    delete process.env.PAYMENT_PROVIDER;
  } else {
    process.env.PAYMENT_PROVIDER = originalPaymentProvider;
  }
  console.error = originalConsoleError;
});

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
  assert.deepEqual(queries, [{ barberId, salonId }]);
});

test("slot validation exact mode does not use default schedule fallback", async () => {
  Booking.find = async () => [];
  const result = await __bookingTestHooks.validateBookingSlot({
    barberId,
    barber,
    bookingDate,
    time: "10:00",
    duration: 30,
    schedule: { weeklySchedule: {}, defaultSchedule: { startTime: "09:00", endTime: "18:00" } },
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

// ── Reference image upload basics ─────────────────────────────────

test("booking create with referenceImages saves internal upload paths", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

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
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  console.error = () => {};
  Booking.create = async () => {
    throw new Error("database unavailable");
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

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create booking");
  assert.equal(fs.existsSync(filePath), false);
});

test("createBooking validation error returns 400", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  console.error = () => {};
  Booking.create = async () => {
    const error = new Error("Booking validation failed");
    error.name = "ValidationError";
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
  const createBookingRecord = Booking.create;
  Booking.create = async (payload) => {
    const booking = await createBookingRecord(payload);
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
  SubscriptionPaymentAttempt.create = async (payload) => {
    paymentAttempts.push(payload);
    return {
      _id: "deposit-payment-attempt-1",
      ...payload,
    };
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
