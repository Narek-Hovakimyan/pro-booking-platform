import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __bookingTestHooks,
  createBooking,
  getBarberBookings,
  updateBooking,
} from "./bookingController.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";

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
  Schedule.findOne = originalMethods.scheduleFindOne;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
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

test("client cancels and directly reschedules pending booking", async () => {
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

  const rescheduleBooking = createMutableBooking();
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

  assert.equal(rescheduleResponse.statusCode, 200);
  assert.equal(rescheduleResponse.body.time, "11:30");
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
      "Accepted bookings must be rescheduled by request."
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

test("concurrent pending direct reschedules cannot move different bookings into the same slot", async () => {
  Notification.create = async (payload) => payload;
  User.findById = () => ({
    select: async (fields) => (fields === "name" ? { name: "Barber" } : barberWithSalon),
  });
  Schedule.findOne = async () => null;

  const firstBooking = createMutableBooking({
    _id: "booking-reschedule-1",
    status: "pending",
    time: "10:00",
    duration: 30,
  });
  const secondBooking = createMutableBooking({
    _id: "booking-reschedule-2",
    status: "pending",
    time: "12:00",
    duration: 30,
    clientId,
  });
  const storedBookings = [firstBooking, secondBooking];
  const originalTimes = storedBookings.map((booking) => ({
    ...booking,
    save: booking.save,
  }));
  let findCalls = 0;
  let releasePrevalidations;
  const bothPrevalidationsStarted = new Promise((resolve) => {
    releasePrevalidations = resolve;
  });

  Booking.findById = async (id) =>
    storedBookings.find((booking) => String(booking._id) === String(id));
  Booking.find = async (query) => {
    findCalls++;
    if (findCalls === 2) releasePrevalidations();
    if (findCalls <= 2) {
      await bothPrevalidationsStarted;
      return mockBookingFind(originalTimes)(query);
    }

    return mockBookingFind(storedBookings)(query);
  };

  const firstResponse = createResponse();
  const secondResponse = createResponse();

  await Promise.all([
    updateBooking(
      {
        user: client,
        params: { id: firstBooking._id },
        body: { bookingDate, dayKey: "mon", time: "11:00" },
      },
      firstResponse
    ),
    updateBooking(
      {
        user: client,
        params: { id: secondBooking._id },
        body: { bookingDate, dayKey: "mon", time: "11:00" },
      },
      secondResponse
    ),
  ]);

  const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();

  assert.deepEqual(statusCodes, [200, 400]);
  assert.equal(storedBookings.filter((booking) => booking.time === "11:00").length, 1);
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
