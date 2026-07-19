import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createBooking, updateBooking } from "./bookings/bookingController.js";
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
  createMutableBooking,
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
const originalConsoleError = console.error;

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
  console.error = originalConsoleError;
});

test("createBooking with valid voucherCode applies discount to booking.price and records voucher fields", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const voucher = {
    _id: "voucher-1",
    ownerType: "barber",
    ownerId: barberId,
    code: "WELCOME10",
    title: "Welcome 10",
    type: "amount",
    amount: 10,
    maxUses: 5,
    currentUses: 0,
    active: true,
    expiresAt: null,
    redemptionBookingIds: [],
  };

  // Mock the atomic claim to succeed
  let claimed = { ...voucher };
  Voucher.findOneAndUpdate = async (filter, update) => {
    if (filter._id === voucher._id && filter.active && filter.currentUses.$lt === voucher.maxUses) {
      return claimed;
    }
    return null;
  };

  // Mock findOne for initial lookup (always returns from our mock)
  Voucher.findOne = async () => claimed;

  // Mock findByIdAndUpdate for recordRedemption
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
        voucherCode: "WELCOME10",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(String(createdBookings[0].voucherId), "voucher-1");
  assert.equal(String(createdBookings[0].promotionId), "voucher-1");
  assert.equal(createdBookings[0].voucherCode, "WELCOME10");
  assert.equal(createdBookings[0].promotionCode, "WELCOME10");
  assert.equal(createdBookings[0].voucherDiscount, 10);
  assert.equal(createdBookings[0].discountAmount, 10);
  assert.equal(createdBookings[0].originalPrice, 100);
  assert.equal(createdBookings[0].finalPrice, 90); // audit trail
  assert.equal(createdBookings[0].price, 90); // booking.price is the discounted price
  assert.equal(createdBookings[0].price, 100 - 10); // service.price(100) - voucherDiscount(10)
});

test("createBooking with voucher calculates deposit from discounted final price", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  BarberProfile.findOne = () => ({
    lean: async () => ({
      depositSettings: {
        enabled: true,
        mode: "percentage",
        value: 50,
        minimumBookingPrice: null,
        noShowPolicyText: "",
      },
    }),
  });

  const voucher = {
    _id: "voucher-deposit",
    ownerType: "barber",
    ownerId: barberId,
    code: "HALFOFF",
    title: "Half Off",
    type: "amount",
    amount: 40,
    maxUses: 5,
    currentUses: 0,
    active: true,
    expiresAt: null,
    redemptionBookingIds: [],
  };

  Voucher.findOne = async () => voucher;
  Voucher.findOneAndUpdate = async () => voucher;
  Voucher.findByIdAndUpdate = async () => ({
    ...voucher,
    currentUses: 1,
    redemptionBookingIds: ["booking-new"],
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
        voucherCode: "HALFOFF",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].finalPrice, 60);
  assert.equal(createdBookings[0].price, 60);
  assert.equal(createdBookings[0].depositRequired, true);
  assert.equal(createdBookings[0].depositAmount, 30);
  assert.equal(createdBookings[0].depositStatus, "pending");
});

test("createBooking with promotionCode stores promotion fields", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const voucher = {
    _id: "promotion-1",
    ownerType: "salon",
    ownerId: salonId,
    code: "SAVE25",
    title: "Save 25",
    type: "amount",
    discountType: "percentage",
    amount: 25,
    maxUses: 5,
    currentUses: 0,
    active: true,
    expiresAt: null,
    startDate: null,
    applicableServiceIds: [serviceId],
    applicableBarberIds: [barberId],
    redemptionBookingIds: [],
  };

  Voucher.findOne = async () => voucher;
  Voucher.findOneAndUpdate = async () => voucher;
  Voucher.findByIdAndUpdate = async () => voucher;

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
        promotionCode: "save25",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].price, 75);
  assert.equal(createdBookings[0].originalPrice, 100);
  assert.equal(createdBookings[0].discountAmount, 25);
  assert.equal(createdBookings[0].finalPrice, 75);
  assert.equal(createdBookings[0].promotionCode, "SAVE25");
  assert.equal(String(createdBookings[0].promotionId), "promotion-1");
});

test("createBooking with invalid voucherCode returns 400", async () => {
  mockSuccessfulCreateDependencies([], barberWithSalon);

  Voucher.findOne = async () => null;
  Voucher.findOneAndUpdate = async () => null;

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
        voucherCode: "INVALID",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("Invalid voucher code"));
});

test("createBooking with fully used voucher returns 400", async () => {
  mockSuccessfulCreateDependencies([], barberWithSalon);

  const overusedVoucher = {
    _id: "voucher-overused",
    ownerType: "barber",
    ownerId: barberId,
    code: "USEDUP",
    title: "Used Up",
    type: "amount",
    amount: 10,
    maxUses: 3,
    currentUses: 3,
    active: true,
    expiresAt: null,
    redemptionBookingIds: ["booking-old"],
  };

  Voucher.findOne = async () => overusedVoucher;
  // Atomic claim should fail because currentUses >= maxUses
  Voucher.findOneAndUpdate = async (filter) => {
    if (filter.currentUses && filter.currentUses.$lt && filter.currentUses.$lt > overusedVoucher.currentUses) {
      return overusedVoucher;
    }
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
        voucherCode: "USEDUP",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("fully redeemed") || res.body.message.includes("no longer available"));
});

test("createBooking with expired voucher returns 400", async () => {
  mockSuccessfulCreateDependencies([], barberWithSalon);

  const expiredVoucher = {
    _id: "voucher-expired",
    ownerType: "barber",
    ownerId: barberId,
    code: "EXPIRED",
    title: "Expired",
    type: "amount",
    amount: 10,
    maxUses: 5,
    currentUses: 1,
    active: true,
    expiresAt: new Date("2020-01-01"),
    redemptionBookingIds: [],
  };

  Voucher.findOne = async () => expiredVoucher;

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
        voucherCode: "EXPIRED",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("expired"));
});

test("createBooking with voucher for wrong barber returns 400", async () => {
  mockSuccessfulCreateDependencies([], barberWithSalon);

  const wrongBarberVoucher = {
    _id: "voucher-wrong",
    ownerType: "barber",
    ownerId: "64b000000000000000000099", // wrong barber
    code: "WRONG",
    title: "Wrong",
    type: "amount",
    amount: 10,
    maxUses: 5,
    currentUses: 0,
    active: true,
    expiresAt: null,
    redemptionBookingIds: [],
  };

  Voucher.findOne = async () => wrongBarberVoucher;

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
        voucherCode: "WRONG",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("does not apply to this barber"));
});

test("cancelling a voucher-discounted booking restores voucher use", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Mock Voucher.findByIdAndUpdate to capture the restoration call
  let restoredVoucherId = null;
  let restoredFields = null;
  Voucher.findByIdAndUpdate = async (id, update) => {
    restoredVoucherId = id;
    restoredFields = update;
    return null;
  };

  const booking = createMutableBooking({
    status: "accepted",
    voucherId: "voucher-1",
    voucherCode: "WELCOME10",
    voucherDiscount: 10,
    finalPrice: 90,
  });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { status: "cancelled", cancelReason: "Plans changed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(restoredVoucherId, "voucher-1");
  assert.ok(restoredFields.$inc);
  assert.equal(restoredFields.$inc.currentUses, -1);
  assert.ok(restoredFields.$pull);
  assert.ok(restoredFields.$pull.redemptionBookingIds);
});

test("cancelling a booking without voucher does not call voucher restore", async () => {
  const notifications = [];
  let voucherFindByIdAndUpdateCalled = false;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  Voucher.findByIdAndUpdate = async () => {
    voucherFindByIdAndUpdateCalled = true;
    return null;
  };

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: client,
      params: { id: booking._id },
      body: { status: "cancelled", cancelReason: "Plans changed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(voucherFindByIdAndUpdateCalled, false);
});

test("createBooking with voucher amount exceeding service price caps at price=0 and voucherDiscount=servicePrice", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  // service.price = 100; voucher amount = 150
  const voucher = {
    _id: "voucher-high",
    ownerType: "barber",
    ownerId: barberId,
    code: "HIGH150",
    title: "High Value",
    type: "amount",
    amount: 150,
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
        voucherCode: "HIGH150",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdBookings[0].voucherDiscount, 100); // capped at service.price
  assert.equal(createdBookings[0].price, 0);            // discounted to zero
  assert.equal(createdBookings[0].finalPrice, 0);       // audit trail matches
});

test("voucher claim is rolled back if Booking.create fails after atomic claim", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  const voucher = {
    _id: "voucher-rollback",
    ownerType: "barber",
    ownerId: barberId,
    code: "ROLLBACK",
    title: "Rollback Test",
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

  let rollbackCalled = false;
  let rollbackVoucherId = null;
  Voucher.findByIdAndUpdate = async (id, update) => {
    if (update && update.$inc && update.$inc.currentUses === -1) {
      rollbackCalled = true;
      rollbackVoucherId = id;
    }
    return { ...voucher };
  };

  // Make Booking.create throw to simulate DB failure after claim
  console.error = () => {};
  Booking.create = async () => {
    throw new Error("database unavailable");
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
        voucherCode: "ROLLBACK",
      },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create booking");
  // Confirm rollback was called
  assert.equal(rollbackCalled, true);
  assert.equal(rollbackVoucherId, "voucher-rollback");
});

test("repeated cancel/reject on voucher booking does not double-restore voucher use", async () => {
  let restoreCallCount = 0;
  let lastRestoreBookingId = null;
  Voucher.findByIdAndUpdate = async (id, update) => {
    if (update && update.$inc && update.$inc.currentUses === -1) {
      restoreCallCount++;
      lastRestoreBookingId = id;
    }
    return null;
  };

  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({
    status: "accepted",
    voucherId: "voucher-repeat",
    voucherDiscount: 10,
  });
  Booking.findById = async () => booking;

  // First cancel
  const res1 = createResponse();
  await updateBooking(
    { user: client, params: { id: booking._id }, body: { status: "cancelled", cancelReason: "Plans changed" } },
    res1
  );
  assert.equal(res1.statusCode, 200);
  assert.equal(restoreCallCount, 1);

  // Second cancel attempt — status is already "cancelled" so controller should reject
  const res2 = createResponse();
  booking.status = "cancelled"; // simulate saved state
  await updateBooking(
    { user: client, params: { id: booking._id }, body: { status: "cancelled", cancelReason: "Again" } },
    res2
  );
  assert.equal(res2.statusCode, 400); // "Only pending or accepted bookings can be cancelled"

  // restore should NOT be called a second time
  assert.equal(restoreCallCount, 1);
  assert.equal(lastRestoreBookingId, "voucher-repeat");
});
