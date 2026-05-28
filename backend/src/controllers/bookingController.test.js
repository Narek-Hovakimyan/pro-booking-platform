import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import fs from "fs";
import path from "path";

import {
  __bookingTestHooks,
  createBooking,
  getReferenceImage,
  updateBooking,
  updateTreatmentRecord,
} from "./bookingController.js";
import { getBarberBookings } from "./bookingReadController.js";
import { serializeAvailabilityBooking } from "../utils/bookingUtils.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  deleteUploadedFile,
  handleReferenceImageUploadError,
} from "../middleware/uploadMiddleware.js";

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
  otherClient,
  salonBId,
  salonId,
  serviceId,
} from "./bookingController.testUtils.js";

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
  Notification.create = originalMethods.notificationCreate;
  Salon.exists = originalMethods.salonExists;
  Salon.findById = originalMethods.salonFindById;
  Schedule.findOne = originalMethods.scheduleFindOne;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
});

const bookingReferenceDir = path.resolve(process.cwd(), "uploads", "booking-references");

const createReferenceUploadFile = (filename) => {
  fs.mkdirSync(bookingReferenceDir, { recursive: true });
  const filePath = path.join(bookingReferenceDir, filename);
  fs.writeFileSync(filePath, "reference image", "utf8");
  return filePath;
};

const createSendFileResponse = () => ({
  ...createResponse(),
  sentFile: "",
  sendFile(filePath) {
    this.sentFile = filePath;
    return this;
  },
});

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

// ── Plain object validation tests ──────────────────────────────────

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

test("barber sees their own booking list", async () => {
  const booking = createMutableBooking();
  const res = createResponse();

  Booking.find = async (query) => {
    assert.equal(String(query.barberId), barberId);
    return [booking];
  };

  await getBarberBookings(
    {
      user: barber,
      params: { barberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [booking]);
});

test("barber accepts and rejects their booking", async () => {
  Notification.create = async (payload) => payload;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  for (const updateBody of [
    { status: "accepted" },
    { status: "rejected", rejectionReason: "Unavailable" },
  ]) {
    const booking = createMutableBooking();
    const res = createResponse();

    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: updateBody,
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, updateBody.status);
    assert.equal(booking.saveCalled, true);
  }
});

test("client cancels but cannot directly reschedule pending booking", async () => {
  Notification.create = async (payload) => payload;
  User.findById = () => ({
    select: async (fields) => (fields === "name" ? { name: "Barber" } : barberWithSalon),
  });
  Schedule.findOne = async () => null;
  Booking.find = mockBookingFind([]);

  const cancelBooking = createMutableBooking();
  const cancelResponse = createResponse();
  Booking.findById = async () => cancelBooking;

  await updateBooking(
    {
      user: client,
      params: { id: cancelBooking._id },
      body: { status: "cancelled", cancelReason: "Plans changed" },
    },
    cancelResponse
  );

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(cancelResponse.body.status, "cancelled");

  const rescheduleBooking = createMutableBooking({
    bookingDate,
    dayKey: "mon",
    time: "10:00",
  });
  const rescheduleResponse = createResponse();
  Booking.findById = async () => rescheduleBooking;

  await updateBooking(
    {
      user: client,
      params: { id: rescheduleBooking._id },
      body: {
        bookingDate,
        dayKey: "mon",
        time: "11:30",
      },
    },
    rescheduleResponse
  );

  assert.equal(rescheduleResponse.statusCode, 400);
  assert.equal(
    rescheduleResponse.body.message,
    "Bookings must be rescheduled by request."
  );
  assert.equal(rescheduleBooking.bookingDate, bookingDate);
  assert.equal(rescheduleBooking.dayKey, "mon");
  assert.equal(rescheduleBooking.time, "10:00");
  assert.equal(rescheduleBooking.saveCalled, false);
});

test("client cannot directly reschedule accepted or confirmed booking", async () => {
  for (const status of ["accepted", "confirmed"]) {
    const booking = createMutableBooking({
      status,
      bookingDate,
      dayKey: "mon",
      time: "10:00",
    });
    const res = createResponse();

    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: client,
        params: { id: booking._id },
        body: {
          bookingDate: "2099-06-02",
          dayKey: "tue",
          time: "11:30",
        },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body.message,
      "Bookings must be rescheduled by request."
    );
    assert.equal(booking.bookingDate, bookingDate);
    assert.equal(booking.dayKey, "mon");
    assert.equal(booking.time, "10:00");
    assert.equal(booking.saveCalled, false);
  }
});

test("barber direct reschedule behavior is unchanged", async () => {
  const booking = createMutableBooking({
    status: "accepted",
    bookingDate,
    dayKey: "mon",
    time: "10:00",
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        bookingDate: "2099-06-02",
        dayKey: "tue",
        time: "11:30",
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only the booking owner can reschedule");
  assert.equal(booking.saveCalled, false);
});

test("pending direct reschedule is blocked before slot validation", async () => {
  const booking = createMutableBooking({
    _id: "booking-reschedule-1",
    status: "pending",
    time: "10:00",
    duration: 30,
  });
  const res = createResponse();
  let findCalls = 0;

  Booking.findById = async () => booking;
  Booking.find = async () => {
    findCalls++;
    return [];
  };

  await updateBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { bookingDate, dayKey: "mon", time: "11:00" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Bookings must be rescheduled by request.");
  assert.equal(findCalls, 0);
  assert.equal(booking.time, "10:00");
  assert.equal(booking.saveCalled, false);
});

test("unauthorized user cannot update another user's booking", async () => {
  const booking = createMutableBooking();
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: otherClient,
      params: { id: booking._id },
      body: { status: "cancelled", cancelReason: "Trying to cancel" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

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

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "database unavailable");
  assert.equal(fs.existsSync(filePath), false);
});

test("GET reference image unauthenticated returns 401", async () => {
  const res = createResponse();
  let nextCalled = false;

  await protect(
    { headers: {} },
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("GET reference image by booking client returns 200", async () => {
  const imageName = "ref-owned.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  const res = createSendFileResponse();

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.sentFile, path.join(bookingReferenceDir, imageName));
});

test("GET reference image by assigned barber returns 200", async () => {
  const imageName = "ref-barber.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  const res = createSendFileResponse();

  await getReferenceImage(
    {
      user: barber,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.sentFile, path.join(bookingReferenceDir, imageName));
});

test("GET reference image allows booking salon owner", async () => {
  const imageName = "ref-salon-owner.jpg";
  const ownerId = "64b000000000000000000021";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId,
    });
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: salonId, ownerId, admins: [] }),
    }),
  });
  const res = createSendFileResponse();

  await getReferenceImage(
    {
      user: { _id: ownerId, role: "barber" },
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.sentFile, path.join(bookingReferenceDir, imageName));
});

test("GET reference image denies owner/admin of a different salon", async () => {
  const imageName = "ref-wrong-salon.jpg";
  const wrongSalonOwnerId = "64b000000000000000000022";
  const wrongSalonAdminId = "64b000000000000000000023";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId,
    });
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: salonId,
        ownerId: "64b000000000000000000024",
        admins: ["64b000000000000000000025"],
      }),
    }),
  });

  for (const userId of [wrongSalonOwnerId, wrongSalonAdminId]) {
    const res = createResponse();

    await getReferenceImage(
      {
        user: { _id: userId, role: "barber" },
        params: { bookingId: barberId, imageName },
      },
      res
    );

    assert.equal(res.statusCode, 403);
  }
});

test("GET reference image by unrelated user returns 403", async () => {
  const imageName = "ref-unrelated.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  const res = createResponse();

  await getReferenceImage(
    {
      user: otherClient,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("GET reference image with traversal returns 400", async () => {
  Booking.findById = async () => {
    throw new Error("should not load booking for invalid image name");
  };
  const res = createResponse();

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName: "..\\secret.jpg" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("GET reference image not listed on booking returns 404", async () => {
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: ["uploads/booking-references/ref-listed.jpg"],
    });
  const res = createResponse();

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName: "ref-missing.jpg" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
});

// ── Consultation / Consent Tests ────────────────────────────────────

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

test("public/non-owner serialized booking does not include consultation", async () => {
  const booking = createMutableBooking({
    consultation: {
      hairType: "coily",
      chemicalTreatments: "color",
      allergies: "sulfates",
    },
    consent: {
      accepted: true,
      acceptedAt: new Date(),
      textVersion: "v1.0",
    },
  });

  const serialized = serializeAvailabilityBooking(booking, "unrelated-user");

  assert.equal(serialized.consultation, undefined);
  assert.equal(serialized.consent, undefined);
});

test("public/non-owner serialized booking does not include consent", async () => {
  const booking = createMutableBooking({
    consent: {
      accepted: true,
      acceptedAt: new Date(),
      textVersion: "v2.0",
    },
  });

  const serialized = serializeAvailabilityBooking(booking, null);

  assert.equal(serialized.consent, undefined);
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

// ── Contract/integration tests: frontend-shaped payload ──────────────

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

// ── FormData multipart serialization tests ─────────────────────────

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

// ── Treatment Record Tests ─────────────────────────────────────────

test("assigned barber creates treatmentRecord for accepted booking", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        colorFormula: "6.3 gold blonde",
        tonerFormula: "9.1 ice toner",
        developer: "20 vol",
        processingTime: "35 min",
        productsUsed: "Wella Koleston, Olaplex",
        techniqueNotes: "Balayage with foils",
        outcomeNotes: "Good lift, even tone",
        reactionNotes: "No irritation",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.treatmentRecord);
  assert.equal(res.body.treatmentRecord.colorFormula, "6.3 gold blonde");
  assert.equal(res.body.treatmentRecord.tonerFormula, "9.1 ice toner");
  assert.equal(res.body.treatmentRecord.developer, "20 vol");
  assert.equal(res.body.treatmentRecord.processingTime, "35 min");
  assert.equal(res.body.treatmentRecord.productsUsed, "Wella Koleston, Olaplex");
  assert.equal(res.body.treatmentRecord.techniqueNotes, "Balayage with foils");
  assert.equal(res.body.treatmentRecord.outcomeNotes, "Good lift, even tone");
  assert.equal(res.body.treatmentRecord.reactionNotes, "No irritation");
  assert.equal(String(res.body.treatmentRecord.recordedBy), barberId);
  assert.ok(res.body.treatmentRecord.recordedAt instanceof Date);
  assert.ok(res.body.treatmentRecord.updatedAt instanceof Date);
  assert.equal(booking.saveCalled, true);
});

test("assigned barber updates treatmentRecord for completed booking", async () => {
  const previousRecordedAt = new Date("2026-01-01T00:00:00.000Z");
  const booking = createMutableBooking({
    _id: barberId,
    status: "completed",
    treatmentRecord: {
      colorFormula: "old color",
      tonerFormula: "",
      developer: "",
      processingTime: "",
      productsUsed: "",
      techniqueNotes: "",
      outcomeNotes: "",
      reactionNotes: "",
      recordedBy: barberId,
      recordedAt: previousRecordedAt,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        colorFormula: "7.1 ash blonde",
        outcomeNotes: "Client very satisfied",
        productsUsed: "Schwarzkopf, Redken",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.treatmentRecord.colorFormula, "7.1 ash blonde");
  assert.equal(res.body.treatmentRecord.outcomeNotes, "Client very satisfied");
  assert.equal(res.body.treatmentRecord.productsUsed, "Schwarzkopf, Redken");
  // Preserved from previous
  assert.equal(res.body.treatmentRecord.tonerFormula, "");
  assert.equal(res.body.treatmentRecord.developer, "");
  assert.equal(res.body.treatmentRecord.processingTime, "");
  assert.equal(res.body.treatmentRecord.techniqueNotes, "");
  assert.equal(res.body.treatmentRecord.reactionNotes, "");
  // recordedBy and recordedAt preserved
  assert.equal(String(res.body.treatmentRecord.recordedBy), barberId);
  assert.equal(res.body.treatmentRecord.recordedAt.getTime(), previousRecordedAt.getTime());
  assert.ok(res.body.treatmentRecord.updatedAt > previousRecordedAt);
});

test("unrelated barber gets 403 for treatmentRecord", async () => {
  const unrelatedBarber = { _id: "64b000000000000000000099", role: "barber" };
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId: null });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: unrelatedBarber,
      params: { id: booking._id },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

test("client gets 403 for treatmentRecord", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId: null });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: client,
      params: { id: booking._id },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

test("salon owner can update treatmentRecord for booking in their salon", async () => {
  const ownerId = "64b000000000000000000031";
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId });
  const res = createResponse();

  Booking.findById = async () => booking;
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: salonId, ownerId, admins: [] }),
    }),
  });

  await updateTreatmentRecord(
    {
      user: { _id: ownerId, role: "barber" },
      params: { id: booking._id },
      body: { techniqueNotes: "Salon owner notes" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.treatmentRecord.techniqueNotes, "Salon owner notes");
  assert.equal(booking.saveCalled, true);
});

test("wrong-salon owner/admin gets 403 for treatmentRecord", async () => {
  const wrongOwnerId = "64b000000000000000000032";
  const wrongAdminId = "64b000000000000000000033";
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId });
  Booking.findById = async () => booking;
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: salonId,
        ownerId: "64b000000000000000000034",
        admins: ["64b000000000000000000035"],
      }),
    }),
  });

  for (const userId of [wrongOwnerId, wrongAdminId]) {
    const res = createResponse();
    await updateTreatmentRecord(
      {
        user: { _id: userId, role: "barber" },
        params: { id: booking._id },
        body: { techniqueNotes: "Should not save" },
      },
      res
    );
    assert.equal(res.statusCode, 403);
  }
});

test("pending booking returns 400 for treatmentRecord", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "pending" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("accepted or completed"));
  assert.equal(booking.saveCalled, false);
});

test("cancelled/rejected booking returns 400 for treatmentRecord", async () => {
  for (const status of ["cancelled", "rejected", "no_show", "late_cancelled", "expired"]) {
    const booking = createMutableBooking({ _id: barberId, status });
    const res = createResponse();

    Booking.findById = async () => booking;

    await updateTreatmentRecord(
      {
        user: barber,
        params: { id: booking._id },
        body: { colorFormula: "test" },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes("accepted or completed"));
    assert.equal(booking.saveCalled, false);
  }
});

test("malformed booking id returns 400 for treatmentRecord", async () => {
  const res = createResponse();

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: "not-a-valid-id" },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid booking ID");
});

test("unsafe fields from client are ignored in treatmentRecord", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        colorFormula: "valid formula",
        recordedBy: "64b000000000000000000099",
        recordedAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
        clientId: "should-be-ignored",
        barberId: "should-be-ignored",
        status: "completed",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  // Color formula was provided on whitelist - should persist
  assert.equal(res.body.treatmentRecord.colorFormula, "valid formula");
  // Unsafe fields must be set server-side, not from client
  assert.equal(String(res.body.treatmentRecord.recordedBy), barberId);
  assert.ok(res.body.treatmentRecord.recordedAt instanceof Date);
  assert.ok(res.body.treatmentRecord.recordedAt > new Date("2020-01-01T00:00:00.000Z"));
  assert.equal(booking.status, "accepted"); // status should not have changed
  assert.equal(booking.saveCalled, true);
});

test("booking not found returns 404 for treatmentRecord", async () => {
  const res = createResponse();

  Booking.findById = async () => null;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: "64b000000000000000000099" },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
});

test("client booking read excludes treatmentRecord", async () => {
  const { getClientBookingsForRequester } = await import("../services/bookingReadService.js");

  const booking = createMutableBooking({
    treatmentRecord: { colorFormula: "secret", recordedBy: barberId, recordedAt: new Date() },
  });

  // Mock Booking.find to return a chainable with .select()
  Booking.find = () => ({
    select: async (fields) => {
      assert.equal(fields, "-treatmentRecord");
      // Mongoose select removes fields; simulate by deleting treatmentRecord
      const result = { ...booking };
      delete result.treatmentRecord;
      return [result];
    },
  });

  const result = await getClientBookingsForRequester({
    clientId,
    requester: client,
  });

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  // treatmentRecord should not appear in the returned client booking
  assert.equal(result[0].treatmentRecord, undefined);
});

test("public/non-owner serialized booking excludes treatmentRecord", async () => {
  const booking = createMutableBooking({
    treatmentRecord: { colorFormula: "trade-secret", recordedBy: barberId, recordedAt: new Date() },
  });

  const serialized = serializeAvailabilityBooking(booking, "unrelated-viewer");

  assert.equal(serialized.treatmentRecord, undefined);
});

// ── Review Request Automation Tests ────────────────────────────────

test("completing accepted booking creates one review_request notification for client", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "completed");

  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 1);
  assert.equal(reviewRequests[0].userId, clientId);
  assert.equal(reviewRequests[0].message, "How was your visit? Leave a review for your specialist.");
  assert.ok(reviewRequests[0].data.bookingId);
  assert.ok(reviewRequests[0].data.barberId);
});

test("completion does not create review_request if booking.reviewed === true", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted", reviewed: true });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("completion does not create review_request if Review.exists returns true", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => true;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("completion does not create duplicate review_request if notification already exists", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => ({ _id: "existing-notification" });
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("non-completion status changes do not create review_request", async () => {
  const notifications = [];
  let notificationFindOneCallCount = 0;

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => {
    notificationFindOneCallCount++;
    return null;
  };
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  for (const statusChange of [
    { from: "pending", to: "accepted" },
    { from: "pending", to: "rejected", rejectionReason: "Unavailable" },
    { from: "accepted", to: "rejected", rejectionReason: "Unavailable" },
  ]) {
    const booking = createMutableBooking({ status: statusChange.from });
    const res = createResponse();
    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: statusChange.to, ...(statusChange.rejectionReason ? { rejectionReason: statusChange.rejectionReason } : {}) },
      },
      res
    );

    assert.equal(res.statusCode, 200);
  }

  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
  // Non-completion paths should not query Notification.findOne for review_request
  assert.equal(notificationFindOneCallCount, 0);
});

test("re-sending completed status when already completed does not create duplicate request", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Start with already completed booking — status won't change
  // Controller returns 400: "Only accepted bookings can be completed"
  const booking = createMutableBooking({ status: "completed", completedAt: new Date() });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Only accepted bookings can be completed");
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("review_request notification data contains only safe fields: bookingId, barberId", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequest = notifications.find((n) => n.type === "review_request");
  assert.ok(reviewRequest);
  const dataKeys = Object.keys(reviewRequest.data);
  assert.equal(dataKeys.length, 2);
  assert.ok(dataKeys.includes("bookingId"));
  assert.ok(dataKeys.includes("barberId"));
  // Ensure no private fields leaked
  assert.equal(dataKeys.includes("clientName"), false);
  assert.equal(dataKeys.includes("clientPhone"), false);
  assert.equal(dataKeys.includes("phone"), false);
  assert.equal(dataKeys.includes("consultation"), false);
  assert.equal(dataKeys.includes("consent"), false);
  assert.equal(dataKeys.includes("referenceImages"), false);
  assert.equal(dataKeys.includes("treatmentRecord"), false);
});

test("existing completion/status tests still pass after review_request addition", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Test: barber accepts a booking
  const acceptBooking = createMutableBooking({ status: "pending" });
  const acceptRes = createResponse();
  Booking.findById = async () => acceptBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: acceptBooking._id },
      body: { status: "accepted" },
    },
    acceptRes
  );

  assert.equal(acceptRes.statusCode, 200);
  assert.equal(acceptRes.body.status, "accepted");

  // Test: barber completes the accepted booking
  const completeBooking = createMutableBooking({ status: "accepted" });
  const completeRes = createResponse();
  Booking.findById = async () => completeBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: completeBooking._id },
      body: { status: "completed" },
    },
    completeRes
  );

  assert.equal(completeRes.statusCode, 200);
  assert.equal(completeRes.body.status, "completed");
  assert.ok(completeRes.body.completedAt);

  // Test: barber rejects a pending booking
  const rejectBooking = createMutableBooking({ status: "pending" });
  const rejectRes = createResponse();
  Booking.findById = async () => rejectBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: rejectBooking._id },
      body: { status: "rejected", rejectionReason: "Unavailable" },
    },
    rejectRes
  );

  assert.equal(rejectRes.statusCode, 200);
  assert.equal(rejectRes.body.status, "rejected");
  assert.equal(rejectRes.body.rejectionReason, "Unavailable");
});

// =========================================================================
// Phase 8 — Book again retention automation
// =========================================================================

test("completing accepted booking creates one book_again_reminder notification for client", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 1);
});

test("completion does not create duplicate book_again_reminder if one already exists", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async (query) => {
    if (query.type === "book_again_reminder") return { _id: "existing-reminder" };
    return null;
  };
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 0);
});

test("non-completion status changes do not create book_again_reminder", async () => {
  const notifications = [];
  let notificationFindOneCallCount = 0;

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => {
    notificationFindOneCallCount++;
    return null;
  };
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  for (const statusChange of [
    { from: "pending", to: "accepted" },
    { from: "pending", to: "rejected", rejectionReason: "Unavailable" },
    { from: "accepted", to: "rejected", rejectionReason: "Unavailable" },
  ]) {
    const booking = createMutableBooking({ status: statusChange.from });
    const res = createResponse();
    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: statusChange.to, ...(statusChange.rejectionReason ? { rejectionReason: statusChange.rejectionReason } : {}) },
      },
      res
    );

    assert.equal(res.statusCode, 200);
  }

  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 0);
  // Non-completion paths should not query Notification.findOne for book_again_reminder
  assert.equal(notificationFindOneCallCount, 0);
});

test("re-sending completed status when already completed does not create duplicate reminder", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Start with already completed booking — status won't change
  // Controller returns 400: "Only accepted bookings can be completed"
  const booking = createMutableBooking({ status: "completed", completedAt: new Date() });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Only accepted bookings can be completed");
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 0);
});

test("book_again_reminder notification payload contains only safe fields: bookingId, barberId, salonId", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reminder = notifications.find((n) => n.type === "book_again_reminder");
  assert.ok(reminder);
  const dataKeys = Object.keys(reminder.data);
  assert.ok(dataKeys.includes("bookingId"));
  assert.ok(dataKeys.includes("barberId"));
  assert.ok(dataKeys.includes("salonId"));
  // Ensure no private fields leaked
  assert.equal(dataKeys.includes("clientName"), false);
  assert.equal(dataKeys.includes("clientPhone"), false);
  assert.equal(dataKeys.includes("phone"), false);
  assert.equal(dataKeys.includes("consultation"), false);
  assert.equal(dataKeys.includes("consent"), false);
  assert.equal(dataKeys.includes("referenceImages"), false);
  assert.equal(dataKeys.includes("treatmentRecord"), false);
});

test("existing Phase 7 review_request tests still pass after book_again_reminder addition", async () => {
  let notificationCounter = 0;
  const notifications = [];
  Notification.create = async (payload) => {
    const doc = { _id: `notif-${++notificationCounter}`, ...payload };
    notifications.push(doc);
    return doc;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Test: barber completes the accepted booking
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(booking.status, "completed");
  assert.ok(booking.completedAt);

  // review_request still created
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 1);

  // book_again_reminder also created
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 1);

  // Ensure they are independent notifications
  assert.notEqual(reviewRequests[0]._id, bookAgainReminders[0]._id);

  // Test: barber rejects a pending booking (should not create any notification)
  const rejectBooking = createMutableBooking({ status: "pending" });
  const rejectRes = createResponse();
  Booking.findById = async () => rejectBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: rejectBooking._id },
      body: { status: "rejected", rejectionReason: "Unavailable" },
    },
    rejectRes
  );

  assert.equal(rejectRes.statusCode, 200);
  assert.equal(rejectRes.body.status, "rejected");
  assert.equal(rejectRes.body.rejectionReason, "Unavailable");
});
