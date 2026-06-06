import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createBooking } from "./bookingController.js";
import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Voucher from "../models/Voucher.js";

import {
  barberId,
  barberWithSalon,
  bookingDate,
  client,
  clientId,
  createResponse,
  mockSuccessfulCreateDependencies,
  originalMethods,
  salonId,
  serviceId,
} from "./bookingController.testUtils.js";

const originalVoucherMethods = {
  find: Voucher.find,
  findByIdAndUpdate: Voucher.findByIdAndUpdate,
  findOne: Voucher.findOne,
  findOneAndUpdate: Voucher.findOneAndUpdate,
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
  User.findById = originalMethods.userFindById;
  Voucher.find = originalVoucherMethods.find;
  Voucher.findByIdAndUpdate = originalVoucherMethods.findByIdAndUpdate;
  Voucher.findOne = originalVoucherMethods.findOne;
  Voucher.findOneAndUpdate = originalVoucherMethods.findOneAndUpdate;
});

test("createBooking with discounted service (percent) uses discountedPrice as booking.price", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  // Override Service.findOne to return a service with a 20% discount
  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Discounted Cut",
    duration: 30,
    price: 100,       // raw price
    discountType: "percent",
    discountValue: 20, // 20% off → discountedPrice = 80
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
  assert.equal(res.body.price, 80);     // booking.price = discounted price
  assert.equal(res.body.duration, 30);
  assert.equal(res.body.serviceName, "Discounted Cut");
});

test("createBooking with discounted service (fixed) uses discountedPrice as booking.price", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Fixed Discount Cut",
    duration: 45,
    price: 100,
    discountType: "fixed",
    discountValue: 25, // discountedPrice = 75
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
  assert.equal(res.body.price, 75);
});

test("createBooking with discounted package service uses discountedPrice as booking.price", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Package Cut + Beard",
    type: "package",
    duration: 60,
    price: 150,
    discountType: "fixed",
    discountValue: 40,
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
  assert.equal(createdBookings[0].price, 110);
});

test("createBooking with discounted service + voucher caps voucherDiscount at discountedPrice", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  // Service raw price = 100, 20% off → discountedPrice = 80
  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Discounted Cut",
    duration: 30,
    price: 100,
    discountType: "percent",
    discountValue: 20,
  });

  const voucher = {
    _id: "voucher-discount",
    ownerType: "barber",
    ownerId: barberId,
    code: "DISCOUNT10",
    title: "Discount Voucher",
    type: "amount",
    amount: 10,
    maxUses: 5,
    currentUses: 0,
    active: true,
    expiresAt: null,
    redemptionBookingIds: [],
  };

  let claimed = { ...voucher };
  Voucher.findOneAndUpdate = async (filter) => {
    if (filter._id === voucher._id && filter.active) return claimed;
    return null;
  };
  Voucher.findOne = async () => claimed;
  Voucher.findByIdAndUpdate = async () => ({ ...voucher, currentUses: 1, redemptionBookingIds: ["booking-new"] });

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
        voucherCode: "DISCOUNT10",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  // discountedPrice = 80, voucher = 10 → final = 70
  assert.equal(createdBookings[0].price, 70);
  assert.equal(createdBookings[0].voucherDiscount, 10);
  assert.equal(createdBookings[0].finalPrice, 70);
});

test("createBooking with discounted service + high-value voucher caps at 0", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  // Service raw price = 100, 20% off → discountedPrice = 80
  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Discounted Cut",
    duration: 30,
    price: 100,
    discountType: "percent",
    discountValue: 20,
  });

  const voucher = {
    _id: "voucher-high-discount",
    ownerType: "barber",
    ownerId: barberId,
    code: "HIGH200",
    title: "High Value Voucher",
    type: "amount",
    amount: 200,
    maxUses: 5,
    currentUses: 0,
    active: true,
    expiresAt: null,
    redemptionBookingIds: [],
  };

  let claimed = { ...voucher };
  Voucher.findOneAndUpdate = async (filter) => {
    if (filter._id === voucher._id && filter.active) return claimed;
    return null;
  };
  Voucher.findOne = async () => claimed;
  Voucher.findByIdAndUpdate = async () => ({ ...voucher, currentUses: 1, redemptionBookingIds: ["booking-new"] });

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
        voucherCode: "HIGH200",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  // voucher discount capped at discountedPrice (80)
  assert.equal(createdBookings[0].voucherDiscount, 80);
  assert.equal(createdBookings[0].price, 0);
  assert.equal(createdBookings[0].finalPrice, 0);
});
