import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { getArmeniaDateKey } from "../utils/bookingDateTime.js";
import {
  __publicSalonBookingTestHooks,
  getPublicSalonBooking,
} from "./bookings/publicSalonBookingController.js";

const salonId = "64b000000000000000001001";
const paidStaffBarberId = "64b000000000000000001002";
const paidChairRenterId = "64b000000000000000001003";
const unpaidBarberId = "64b000000000000000001004";
const expiredBarberId = "64b000000000000000001005";
const staleSeatBarberId = "64b000000000000000001006";

const originalMethods = {
  barberProfileFind: BarberProfile.find,
  bookingFind: Booking.find,
  salonFindById: Salon.findById,
  scheduleFind: Schedule.find,
  serviceFind: Service.find,
  userFind: User.find,
};

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

const makeFindChain = (result, onSelect = () => {}) => ({
  select(fields) {
    onSelect(fields);
    return Promise.resolve(result);
  },
});

const makeLeanQuery = (result) => ({
  async lean() {
    return result;
  },
});

const makeBarber = (id, overrides = {}) => ({
  _id: id,
  name: `Barber ${String(id).slice(-4)}`,
  role: "barber",
  avatarUrl: "",
  city: "Yerevan",
  profession: "barber",
  barberType: "unisex",
  specialty: "unisex",
  password: "x",
  salons: [
    {
      salon: salonId,
      status: "approved",
      relationshipType: overrides.relationshipType || "staff",
      worksAsSpecialist: true,
      defaultSchedule: {},
    },
  ],
  salon: salonId,
  salonStatus: "approved",
  ...overrides,
});

let paidAccessMap = new Map();
let reviewStatsMap = new Map();
const todayKey = getArmeniaDateKey(new Date());

const readyAvailabilitySchedule = (barberId, scopedSalonId = salonId) => ({
  barberId,
  salonId: scopedSalonId,
  weeklySchedule: {},
  scheduleOverrides: {
    [todayKey]: {
      isWorking: true,
      startTime: "00:00",
      endTime: "23:59",
      breakStart: "",
      breakEnd: "",
    },
  },
  nonWorkingDays: [],
});

const completedOnboarding = (workplace = "salon") => ({
  version: 1,
  status: "completed",
  currentStep: null,
  workplace,
  completedAt: new Date("2026-07-16T10:00:00.000Z"),
});

afterEach(() => {
  paidAccessMap = new Map();
  reviewStatsMap = new Map();
  __publicSalonBookingTestHooks.resetGetPaidAccessByBarberIds();
  __publicSalonBookingTestHooks.resetGetSalonReviewStats();
  BarberProfile.find = originalMethods.barberProfileFind;
  Booking.find = originalMethods.bookingFind;
  Salon.findById = originalMethods.salonFindById;
  Schedule.find = originalMethods.scheduleFind;
  Service.find = originalMethods.serviceFind;
  User.find = originalMethods.userFind;
});

test("public booking data returns paid approved staff barber", async () => {
  const res = createResponse();
  const userSelectFields = [];

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "Main 1",
    phone: "+3741000000",
    imageUrl: "/uploads/salon.jpg",
  });
  reviewStatsMap = new Map([
    [
      salonId,
      {
        averageRating: 4.7,
        totalReviews: 12,
        reviewsCount: 12,
      },
    ],
  ]);
  User.find = () =>
    makeFindChain([makeBarber(paidStaffBarberId)], (fields) => {
      userSelectFields.push(fields);
    });
  BarberProfile.find = async () => [];
  Schedule.find = async () => [readyAvailabilitySchedule(paidStaffBarberId)];
  Booking.find = async () => [];
  paidAccessMap = new Map([[String(paidStaffBarberId), true]]);
  Service.find = () =>
    makeLeanQuery([
      {
        _id: "srv1",
        barberId: paidStaffBarberId,
        name: "Haircut",
        price: 3000,
        duration: 30,
        description: "",
        category: "haircut",
        tags: [],
        type: "single",
        discountType: "none",
        discountValue: 0,
        active: true,
      },
    ]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(userSelectFields.includes("-password"));
  assert.ok(userSelectFields.includes("_id specialistOnboarding salons role"));
  assert.equal(res.body.salon.name, "Test Salon");
  assert.equal(res.body.salon.averageRating, 4.7);
  assert.equal(res.body.barbers.length, 1);
  assert.equal(String(res.body.barbers[0].id), String(paidStaffBarberId));
  assert.equal(res.body.barbers[0].availabilityStatus, "ready");
  assert.equal(res.body.barbers[0].services.length, 1);
  assert.equal(res.body.services.length, 1);
  assert.equal(res.body.services[0].name, "Haircut");
});

test("public booking marks specialist unavailable when exact salon schedule is missing", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "Main 1",
    phone: "+3741000000",
    imageUrl: "/uploads/salon.jpg",
  });
  User.find = () => makeFindChain([makeBarber(paidStaffBarberId)]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  paidAccessMap = new Map([[String(paidStaffBarberId), true]]);
  Service.find = () =>
    makeLeanQuery([
      {
        _id: "srv1",
        barberId: paidStaffBarberId,
        name: "Haircut",
        price: 3000,
        duration: 30,
        description: "",
        category: "haircut",
        tags: [],
        type: "single",
        discountType: "none",
        discountValue: 0,
        active: true,
      },
    ]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 1);
  assert.equal(res.body.barbers[0].availabilityStatus, "unavailable");
  assert.equal(res.body.barbers[0].firstAvailableSlot, null);
});

test("returns paid approved chair_renter barber publicly", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  reviewStatsMap = new Map();
  User.find = () =>
    makeFindChain([
      makeBarber(paidChairRenterId, { relationshipType: "chair_renter" }),
    ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([{ barberId: paidChairRenterId, active: true }]);
  paidAccessMap = new Map([[String(paidChairRenterId), true]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 1);
  assert.equal(String(res.body.barbers[0].id), String(paidChairRenterId));
  assert.equal(res.body.barbers[0].relationshipType, "chair_renter");
});

test("hides pending salon specialist from public booking data", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () =>
    makeFindChain([
      makeBarber("barber-pending", {
        salons: [{
          salon: salonId,
          status: "approved",
          relationshipType: "staff",
          relationshipStatus: "pending",
          worksAsSpecialist: true,
        }],
      }),
    ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([{ barberId: "barber-pending", active: true }]);
  paidAccessMap = new Map([["barber-pending", true]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 0);
});

test("hides unpaid barber from public booking data", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () => makeFindChain([makeBarber(unpaidBarberId)]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([]);
  paidAccessMap = new Map([[String(unpaidBarberId), false]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 0);
  assert.equal(res.body.services.length, 0);
});

test("hides expired barber from public booking data", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () => makeFindChain([makeBarber(expiredBarberId)]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([]);
  paidAccessMap = new Map([[String(expiredBarberId), false]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 0);
});

test("hides approved owner who does not work as specialist from public booking data", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () =>
    makeFindChain([
      makeBarber(paidStaffBarberId, {
        salons: [
          {
            salon: salonId,
            status: "approved",
            relationshipType: "staff",
            relationshipStatus: "accepted",
            worksAsSpecialist: false,
          },
        ],
      }),
    ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () =>
    makeLeanQuery([
      {
        _id: "srv-deposit",
        barberId: paidStaffBarberId,
        name: "Haircut",
        price: 3000,
        duration: 30,
        description: "",
        category: "haircut",
        tags: [],
        type: "single",
        discountType: "none",
        discountValue: 0,
        active: true,
      },
    ]);
  paidAccessMap = new Map([[String(paidStaffBarberId), true]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 0);
});

test("public booking treats both as salon-capable only with approved specialist membership", async () => {
  const res = createResponse();
  const bothBarberId = "64b000000000000000001077";

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () => makeFindChain([
    makeBarber(bothBarberId, {
      specialistOnboarding: completedOnboarding("both"),
      salons: [{
        salon: salonId,
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "accepted",
        worksAsSpecialist: true,
      }],
    }),
  ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [readyAvailabilitySchedule(bothBarberId)];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([
    { _id: "srv-both", barberId: bothBarberId, name: "Cut", price: 3000, duration: 30, active: true },
  ]);
  paidAccessMap = new Map([
    [String(bothBarberId), true],
  ]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.barbers.map((barber) => String(barber.id)), [bothBarberId]);
  assert.deepEqual(res.body.services.map((service) => String(service.barberId)), [bothBarberId]);
});

test("hides stale-seat barber from public booking data", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () => makeFindChain([makeBarber(staleSeatBarberId)]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([]);
  paidAccessMap = new Map([[String(staleSeatBarberId), false]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 0);
});

test("does not expose private dashboard metrics", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () => makeFindChain([makeBarber(paidStaffBarberId)]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([]);
  paidAccessMap = new Map([[String(paidStaffBarberId), true]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subscriptionSummary, undefined);
  assert.equal(res.body.bookingSummary, undefined);
  assert.equal(res.body.revenueSummary, undefined);
  assert.equal(res.body.alerts, undefined);
  assert.equal(res.body.staffSummary, undefined);
});

test("public booking data includes safe deposit minimumBookingPrice", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () => makeFindChain([makeBarber(paidStaffBarberId)]);
  BarberProfile.find = async () => [
    {
      barberId: paidStaffBarberId,
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 1000,
        minimumBookingPrice: 5000,
        noShowPolicyText: "Deposit applies to qualifying bookings.",
      },
    },
  ];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () =>
    makeLeanQuery([
      {
        _id: "srv-deposit",
        barberId: paidStaffBarberId,
        name: "Haircut",
        price: 3000,
        duration: 30,
        description: "",
        category: "haircut",
        tags: [],
        type: "single",
        discountType: "none",
        discountValue: 0,
        active: true,
      },
    ]);
  paidAccessMap = new Map([[String(paidStaffBarberId), true]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.barbers[0].depositSettings, {
    enabled: true,
    mode: "fixed",
    value: 1000,
    minimumBookingPrice: 5000,
    noShowPolicyText: "Deposit applies to qualifying bookings.",
  });
});

test("public booking keeps salon-scoped readiness isolated from unrelated approved salons", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => ({
    _id: salonId,
    name: "Test Salon",
    city: "Yerevan",
    address: "",
    phone: "",
    imageUrl: "",
  });
  User.find = () =>
    makeFindChain([
      makeBarber("barber-cross-salon", {
        salons: [
          {
            salon: salonId,
            status: "approved",
            relationshipType: "staff",
            worksAsSpecialist: false,
          },
          {
            salon: "other-salon",
            status: "approved",
            relationshipType: "staff",
            worksAsSpecialist: true,
          },
        ],
      }),
    ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Booking.find = async () => [];
  Service.find = () => makeLeanQuery([{ barberId: "barber-cross-salon", active: true }]);
  paidAccessMap = new Map([["barber-cross-salon", true]]);

  await getPublicSalonBooking({ params: { salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barbers.length, 0);
});

test("missing salon returns 404", async () => {
  const res = createResponse();

  __publicSalonBookingTestHooks.setGetPaidAccessByBarberIds(
    async () => paidAccessMap
  );
  __publicSalonBookingTestHooks.setGetSalonReviewStats(
    async () => reviewStatsMap
  );

  Salon.findById = async () => null;

  await getPublicSalonBooking(
    { params: { salonId: "000000000000000000000000" } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Salon not found");
});
