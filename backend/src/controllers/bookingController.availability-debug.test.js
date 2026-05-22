import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { debugBookingAvailability } from "./bookingController.js";
import bookingRoutes from "../routes/bookingRoutes.js";
import Booking from "../models/Booking.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";

const barberId = "64b000000000000000000001";
const salonId = "64b000000000000000000002";
const serviceId = "64b000000000000000000003";
const otherBarberId = "64b000000000000000000004";

const originalMethods = {
  bookingFind: Booking.find,
  salonFindById: Salon.findById,
  scheduleFindOne: Schedule.findOne,
  serviceFindOne: Service.findOne,
  userFindById: User.findById,
};

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
  Salon.findById = originalMethods.salonFindById;
  Schedule.findOne = originalMethods.scheduleFindOne;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
});

const createResponse = () => ({
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

const createDebugRequest = (overrides = {}) => ({
  user: { _id: barberId, id: barberId, role: "barber" },
  body: {
    barberId,
    salonId,
    serviceId,
    date: "2099-06-01",
    time: "10:00",
    ...overrides,
  },
});

const mockSuccessfulDebugDependencies = () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId: otherBarberId,
    admins: [],
  });
  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      role: "barber",
      salons: [{ salon: salonId, status: "approved" }],
    }),
  });
  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Haircut",
    duration: 60,
    price: 100,
    active: true,
  });
  Schedule.findOne = async () => ({
    weeklySchedule: {
      tue: { working: true, from: "09:00", to: "18:00" },
    },
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: null,
  });
  Booking.find = () => ({
    lean: async () => [],
  });
};

test("debugBookingAvailability returns 400 for invalid or missing body", async () => {
  const res = createResponse();

  await debugBookingAvailability(
    {
      user: { _id: barberId, role: "barber" },
      body: { barberId, salonId, serviceId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /date is required/i);
});

test("debugBookingAvailability returns 403 when service auth says not allowed", async () => {
  const res = createResponse();

  await debugBookingAvailability(
    {
      user: { _id: "client-id", role: "client" },
      body: { barberId, salonId, serviceId, date: "2099-06-01", time: "10:00" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /only barbers/i);
});

test("debugBookingAvailability returns JSON result on success", async () => {
  const res = createResponse();
  mockSuccessfulDebugDependencies();

  await debugBookingAvailability(createDebugRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.available, true);
  assert.equal(res.body.explanation, "This time is available");
  assert.equal(res.body.barberId, barberId);
  assert.equal(res.body.salonId, salonId);
  assert.equal(res.body.service.name, "Haircut");
  assert.deepEqual(res.body.blockingBookings, []);
});

test("debugBookingAvailability rejects inactive services like booking creation", async () => {
  const res = createResponse();
  let serviceQuery;

  mockSuccessfulDebugDependencies();
  Service.findOne = async (query) => {
    serviceQuery = query;
    return null;
  };

  await debugBookingAvailability(createDebugRequest(), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Service is not available for this barber");
  assert.deepEqual(serviceQuery, { _id: serviceId, barberId, active: true });
});

test("POST /availability-debug route is registered before generic POST routes", () => {
  const postPaths = bookingRoutes.stack
    .filter((layer) => layer.route?.methods?.post)
    .map((layer) => layer.route.path);
  const debugIndex = postPaths.indexOf("/availability-debug");

  assert.notEqual(debugIndex, -1);
  assert.ok(debugIndex < postPaths.indexOf("/"));
});
