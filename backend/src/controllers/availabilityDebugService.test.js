import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { debugAvailability, authorizeDebugAccess } from "../services/availabilityDebugService.js";
import Booking from "../models/Booking.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";

const barberId = "64b000000000000000000001";
const salonId = "64b000000000000000000002";
const serviceId = "64b000000000000000000003";
const ownerId = "64b000000000000000000020";
const adminId = "64b000000000000000000021";
const unrelatedBarberId = "64b000000000000000000010";
const bookingDate = "2026-06-08";
const oldAutoClosedWeeklySchedule = {
  sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  tue: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  wed: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  thu: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  fri: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
};

const defaultService = {
  _id: serviceId,
  barberId,
  name: "Haircut",
  duration: 60,
  price: 100,
  active: true,
};

const existingSalon = {
  _id: salonId,
  name: "Test Salon",
  ownerId,
  admins: [adminId],
};

const ownerUser = {
  _id: ownerId,
  role: "barber",
  salons: [{ salon: salonId, status: "approved", isPrimary: true }],
};

const adminUser = {
  _id: adminId,
  role: "barber",
  salons: [{ salon: salonId, status: "approved", isPrimary: false }],
};

const barberWithSalon = {
  _id: barberId,
  role: "barber",
  salons: [{ salon: salonId, status: "approved", isPrimary: false }],
};

const originalMethods = {
  bookingFind: Booking.find,
  salonFindById: Salon.findById,
  scheduleFindOne: Schedule.findOne,
  serviceFindOne: Service.findOne,
  userFindById: User.findById,
};

const restoreOriginals = () => {
  Booking.find = originalMethods.bookingFind;
  Salon.findById = originalMethods.salonFindById;
  Schedule.findOne = originalMethods.scheduleFindOne;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
};

afterEach(() => {
  restoreOriginals();
});

const mockBookingFind = (bookings) => {
  return () => ({
    lean: async () => bookings,
  });
};

const mockUserFindById = (userData) => {
  return (id) => ({
    select: async () => userData,
  });
};

describe("authorizeDebugAccess", () => {
  test("allows barber to debug own availability for approved salon", async () => {
    Salon.findById = async () => existingSalon;
    User.findById = mockUserFindById(barberWithSalon);

    const result = await authorizeDebugAccess({
      requester: { _id: barberId, role: "barber", ...barberWithSalon },
      barberId,
      salonId,
    });

    assert.equal(result.allowed, true);
  });

  test("rejects barber self-debug for unrelated salon", async () => {
    Salon.findById = async () => existingSalon;
    User.findById = mockUserFindById({
      _id: barberId,
      role: "barber",
      salons: [{ salon: "64b000000000000000000099", status: "approved" }],
    });

    const result = await authorizeDebugAccess({
      requester: { _id: barberId, role: "barber" },
      barberId,
      salonId,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.status, 400);
    assert.match(result.message, /does not work in selected salon/i);
  });

  test("rejects barber self-debug when salon is missing", async () => {
    Salon.findById = async () => null;
    let userLookupCalled = false;
    User.findById = () => {
      userLookupCalled = true;
      return { select: async () => barberWithSalon };
    };

    const result = await authorizeDebugAccess({
      requester: { _id: barberId, role: "barber" },
      barberId,
      salonId,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.status, 400);
    assert.match(result.message, /salon not found/i);
    assert.equal(userLookupCalled, false);
  });

  test("rejects clients with 403", async () => {
    const result = await authorizeDebugAccess({
      requester: { _id: "client-id", role: "client" },
      barberId,
      salonId,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.status, 403);
    assert.match(result.message, /Only barbers/i);
  });

  test("allows salon owner to debug a barber for managed salon", async () => {
    Salon.findById = async () => existingSalon;
    User.findById = mockUserFindById({ _id: barberId, role: "barber", salons: [{ salon: salonId, status: "approved" }] });

    const result = await authorizeDebugAccess({
      requester: { _id: ownerId, role: "barber", ...ownerUser },
      barberId,
      salonId,
    });

    assert.equal(result.allowed, true);
  });

  test("allows salon admin to debug a barber for managed salon", async () => {
    Salon.findById = async () => existingSalon;
    User.findById = mockUserFindById({ _id: barberId, role: "barber", salons: [{ salon: salonId, status: "approved" }] });

    const result = await authorizeDebugAccess({
      requester: { _id: adminId, role: "barber", ...adminUser },
      barberId,
      salonId,
    });

    assert.equal(result.allowed, true);
  });

  test("rejects unrelated barber with 403 when debugging another barber", async () => {
    Salon.findById = async () => existingSalon;

    const result = await authorizeDebugAccess({
      requester: { _id: unrelatedBarberId, role: "barber" },
      barberId,
      salonId,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.status, 403);
    assert.match(result.message, /you can only debug/i);
  });
});

describe("debugAvailability", () => {
  test("returns available: false with explanation for non-working day", async () => {
    Schedule.findOne = async () => ({
      nonWorkingDays: [bookingDate],
      defaultSchedule: null,
      scheduleOverrides: {},
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "10:00",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /not working this day/i);
    assert.equal(result.schedule.isNonWorkingDay, true);
  });

  test("returns available: false for override isWorking: false", async () => {
    Schedule.findOne = async () => ({
      scheduleOverrides: { [bookingDate]: { isWorking: false } },
      nonWorkingDays: [],
      defaultSchedule: null,
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "10:00",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /not working this day/i);
    assert.equal(result.schedule.hasOverride, true);
  });

  test("returns unavailable with not enough time near end of day", async () => {
    Schedule.findOne = async () => ({
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00" },
      },
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: null,
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "17:30",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /not enough time/i);
  });

  test("falls back to default schedule for old auto-closed weekly schedule", async () => {
    Schedule.findOne = async () => ({
      weeklySchedule: oldAutoClosedWeeklySchedule,
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: {
        startTime: "09:00",
        endTime: "18:00",
        hasBreak: false,
        breakStart: "",
        breakEnd: "",
      },
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "10:00",
      serviceId,
    });

    assert.equal(result.available, true);
    assert.match(result.explanation, /available/i);
    assert.equal(result.schedule.startTime, "09:00");
    assert.equal(result.schedule.endTime, "18:00");
  });

  test("returns unavailable with booking conflict and blockingBookings omits client data", async () => {
    const existingBookings = [
      {
        _id: "existing-booking-1",
        barberId,
        clientId: "some-client-id",
        bookingDate,
        time: "10:00",
        duration: 60,
        status: "accepted",
        salonId,
      },
    ];

    Schedule.findOne = async () => ({
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00" },
      },
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: null,
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind(existingBookings);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "10:30",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /already booked/i);
    assert.equal(Array.isArray(result.blockingBookings), true);
    assert.ok(result.blockingBookings.length > 0);
    // No client data exposed
    for (const booking of result.blockingBookings) {
      assert.equal(booking.clientId, undefined);
      assert.equal(booking.clientName, undefined);
      assert.equal(booking.clientPhone, undefined);
    }
  });

  test("returns available: true for an open slot", async () => {
    Schedule.findOne = async () => ({
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00" },
      },
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: null,
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "10:00",
      serviceId,
    });

    assert.equal(result.available, true);
    assert.match(result.explanation, /available/i);
    assert.equal(result.barberId, barberId);
    assert.equal(result.salonId, salonId);
    assert.equal(result.service.id, serviceId);
    assert.equal(result.service.isActive, true);
    assert.equal(result.date, bookingDate);
    assert.equal(result.time, "10:00");
    assert.ok(result.schedule);
    assert.ok(result.checks);
    assert.deepEqual(result.blockingBookings, []);
  });

  test("returns response shape for no-time query", async () => {
    Schedule.findOne = async () => ({
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00" },
      },
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: null,
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: null,
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /select a time/i);
    assert.equal(result.time, null);
    assert.ok(result.service);
    assert.ok(result.schedule);
    assert.equal(result.schedule.isWorking, true);
    assert.deepEqual(result.blockingBookings, []);
  });

  test("returns cross break as not enough time", async () => {
    Schedule.findOne = async () => ({
      weeklySchedule: {
        mon: {
          working: true,
          from: "09:00",
          to: "18:00",
          breakFrom: "13:00",
          breakTo: "14:00",
        },
      },
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: null,
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "12:30",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /not enough time/i);
  });

  test("returns outside working hours for time before work start", async () => {
    Schedule.findOne = async () => ({
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00" },
      },
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: null,
    });
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "08:00",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /outside working hours/i);
  });

  test("returns past time explanation for a past time", async () => {
    Schedule.findOne = async () => null;
    Service.findOne = async () => defaultService;
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: "2020-06-01",
      time: "10:00",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /already past/i);
  });

  test("returns inactive service as unavailable", async () => {
    Schedule.findOne = async () => ({
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00" },
      },
      nonWorkingDays: [],
      scheduleOverrides: {},
      defaultSchedule: null,
    });
    Service.findOne = async () => ({
      ...defaultService,
      active: false,
    });
    Booking.find = mockBookingFind([]);
    User.findById = mockUserFindById({ _id: barberId, salons: [{ salon: salonId }] });

    const result = await debugAvailability({
      barberId,
      salonId,
      date: bookingDate,
      time: "10:00",
      serviceId,
    });

    assert.equal(result.available, false);
    assert.match(result.explanation, /service is inactive/i);
    assert.equal(result.service.isActive, false);
  });
});
