import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import { createBooking, quoteBookingPrice } from "./bookingController.js";
import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import Voucher from "../../models/Voucher.js";
import { normalizeScopedBookingReadinessIds } from "../../services/booking/bookingReadinessService.js";

import {
  barber,
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
  Subscription.findOne = originalMethods.subscriptionFindOne;
  SubscriptionSeat.find = originalMethods.subscriptionSeatFind;
  User.findById = originalMethods.userFindById;
  Voucher.find = originalVoucherMethods.find;
  Voucher.findByIdAndUpdate = originalVoucherMethods.findByIdAndUpdate;
  Voucher.findOne = originalVoucherMethods.findOne;
  Voucher.findOneAndUpdate = originalVoucherMethods.findOneAndUpdate;
});

test("booking readiness rejects request-derived IDs before model queries with create/quote parity", async () => {
  const invalidBodies = [
    { barberId: { $ne: null }, serviceId },
    { barberId, serviceId: { $ne: null } },
    { barberId: "not-an-object-id", serviceId },
    { barberId: [barberId], serviceId },
    { barberId, serviceId: [serviceId] },
    { barberId, serviceId, salonId: " " },
    { barberId, serviceId, salonId: { $ne: null } },
  ];

  for (const body of invalidBodies) {
    let modelCalls = 0;
    const shouldNotQuery = () => {
      modelCalls += 1;
      throw new Error("request-derived ID reached a model query");
    };
    Service.findOne = shouldNotQuery;
    User.findById = shouldNotQuery;
    Salon.exists = shouldNotQuery;
    BarberProfile.findOne = shouldNotQuery;
    Schedule.findOne = shouldNotQuery;
    Subscription.findOne = shouldNotQuery;
    SubscriptionSeat.find = shouldNotQuery;

    const quoteRes = createResponse();
    await quoteBookingPrice({ user: client, body }, quoteRes);

    const createRes = createResponse();
    await createBooking({
      user: client,
      body: { ...body, clientId, bookingDate, time: "10:00", clientName: "Client" },
    }, createRes);

    assert.equal(quoteRes.statusCode, 400);
    assert.equal(createRes.statusCode, 400);
    assert.deepEqual(quoteRes.body, { message: "Invalid booking identifiers" });
    assert.deepEqual(createRes.body, quoteRes.body);
    assert.equal(modelCalls, 0);
  }
});

test("booking readiness normalizes only canonical strings and genuine ObjectIds", () => {
  assert.deepEqual(
    normalizeScopedBookingReadinessIds({ barberId, serviceId, salonId: null }),
    { barberId, serviceId, salonId: null }
  );

  const objectIds = normalizeScopedBookingReadinessIds({
    barberId: new mongoose.Types.ObjectId(barberId),
    serviceId: new mongoose.Types.ObjectId(serviceId),
    salonId: new mongoose.Types.ObjectId(salonId),
  });
  assert.deepEqual(objectIds, { barberId, serviceId, salonId });
});

test("quoteBookingPrice and createBooking make the same readiness decisions", async () => {
  for (const { name, resolvedBarber, schedule } of [
    {
      name: "non-specialist salon",
      resolvedBarber: {
        ...barber,
        salons: [{
          salon: salonId,
          status: "approved",
          relationshipStatus: "accepted",
          worksAsSpecialist: false,
        }],
      },
      schedule: { weeklySchedule: { mon: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" } } },
    },
    {
      name: "missing independent schedule",
      resolvedBarber: {
        ...barber,
        specialistOnboarding: {
          version: 1,
          status: "completed",
          currentStep: "review",
          workplace: "independent",
          completedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
      schedule: null,
    },
  ]) {
    const createdBookings = [];
    mockSuccessfulCreateDependencies(createdBookings, resolvedBarber);
    Schedule.findOne = async () => schedule;

    const body = name === "non-specialist salon"
      ? { barberId, serviceId, salonId }
      : { barberId, serviceId };

    const quoteRes = createResponse();
    await quoteBookingPrice({ user: client, body }, quoteRes);

    const createRes = createResponse();
    await createBooking(
      {
        user: client,
        body: {
          ...body,
          clientId,
          bookingDate,
          time: "10:00",
          clientName: "Client",
        },
      },
      createRes
    );

    assert.equal(quoteRes.statusCode, 403);
    assert.equal(createRes.statusCode, 403);
    assert.deepEqual(quoteRes.body, createRes.body);
    assert.equal(createdBookings.length, 0);
  }
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

test("contract: quote service discount fields match create persisted pricing fields", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Discounted Cut",
    duration: 30,
    price: 100,
    discountType: "percent",
    discountValue: 20,
  });

  const quoteRes = createResponse();
  await quoteBookingPrice(
    {
      user: client,
      body: {
        barberId,
        serviceId,
        salonId,
      },
    },
    quoteRes
  );

  const createRes = createResponse();
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
    createRes
  );

  assert.equal(quoteRes.statusCode, 200);
  assert.deepEqual(Object.keys(quoteRes.body), [
    "originalPrice",
    "serviceDiscountAmount",
    "serviceDiscountedPrice",
    "voucherDiscountAmount",
    "loyaltyDiscountApplied",
    "loyaltyDiscountPercent",
    "loyaltyDiscountAmount",
    "loyaltyEligibleCompletedBookings",
    "loyaltyTierIndex",
    "loyaltyRuleSnapshot",
    "finalPrice",
  ]);
  assert.deepEqual(
    {
      originalPrice: quoteRes.body.originalPrice,
      serviceDiscountAmount: quoteRes.body.serviceDiscountAmount,
      serviceDiscountedPrice: quoteRes.body.serviceDiscountedPrice,
      finalPrice: quoteRes.body.finalPrice,
    },
    {
      originalPrice: 100,
      serviceDiscountAmount: 20,
      serviceDiscountedPrice: 80,
      finalPrice: 80,
    }
  );

  assert.equal(createRes.statusCode, 201);
  assert.equal(createdBookings[0].serviceOriginalPrice, quoteRes.body.originalPrice);
  assert.equal(createdBookings[0].serviceDiscountAmount, quoteRes.body.serviceDiscountAmount);
  assert.equal(createdBookings[0].price, quoteRes.body.finalPrice);
  assert.equal(createdBookings[0].originalPrice, undefined);
  assert.equal(createdBookings[0].finalPrice, undefined);
  assert.equal(createdBookings[0].discountAmount, undefined);
  assert.equal(createdBookings[0].discountType, undefined);
  assert.equal(createdBookings[0].discountValue, undefined);
  assert.equal(createRes.body.price, quoteRes.body.finalPrice);
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

test("contract: voucher quote preview matches create pricing and create claims voucher", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);

  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Voucher Cut",
    duration: 30,
    price: 120,
    discountType: "fixed",
    discountValue: 20,
  });

  const voucher = {
    _id: "voucher-contract",
    ownerType: "barber",
    ownerId: barberId,
    code: "SAVE25",
    title: "Save 25%",
    type: "amount",
    discountType: "percentage",
    amount: 25,
    maxUses: 5,
    currentUses: 0,
    active: true,
    expiresAt: null,
    redemptionBookingIds: [],
  };
  let claimCalls = 0;
  const redemptionUpdates = [];
  Voucher.findOne = async () => voucher;
  Voucher.findOneAndUpdate = async () => {
    claimCalls += 1;
    return voucher;
  };
  Voucher.findByIdAndUpdate = async (voucherId, update) => {
    redemptionUpdates.push({ voucherId, update });
    return voucher;
  };

  const quoteRes = createResponse();
  await quoteBookingPrice(
    {
      user: client,
      body: {
        barberId,
        serviceId,
        salonId,
        voucherCode: "SAVE25",
      },
    },
    quoteRes
  );

  assert.equal(quoteRes.statusCode, 200);
  assert.equal(quoteRes.body.serviceDiscountedPrice, 100);
  assert.equal(quoteRes.body.voucherDiscountAmount, 25);
  assert.equal(quoteRes.body.finalPrice, 75);
  assert.equal(claimCalls, 0);

  const createRes = createResponse();
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
        voucherCode: "SAVE25",
      },
    },
    createRes
  );

  assert.equal(createRes.statusCode, 201);
  assert.equal(claimCalls, 1);
  assert.equal(redemptionUpdates.length, 1);
  assert.deepEqual(redemptionUpdates[0], {
    voucherId: "voucher-contract",
    update: { $addToSet: { redemptionBookingIds: "booking-1" } },
  });
  assert.equal(createdBookings[0].serviceOriginalPrice, quoteRes.body.originalPrice);
  assert.equal(createdBookings[0].serviceDiscountAmount, quoteRes.body.serviceDiscountAmount);
  assert.equal(createdBookings[0].originalPrice, quoteRes.body.serviceDiscountedPrice);
  assert.equal(createdBookings[0].voucherDiscount, quoteRes.body.voucherDiscountAmount);
  assert.equal(createdBookings[0].discountAmount, quoteRes.body.voucherDiscountAmount);
  assert.equal(createdBookings[0].finalPrice, quoteRes.body.finalPrice);
  assert.equal(createdBookings[0].price, quoteRes.body.finalPrice);
  assert.equal(createRes.body.price, quoteRes.body.finalPrice);
});

test("createBooking applies loyalty discount after service discount", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barberWithSalon,
    loyaltyDiscountSettings: {
      enabled: true,
      thresholdCompletedBookings: 5,
      discountPercent: 10,
      maxDiscountPercent: 30,
    },
  });

  let countQuery = null;
  Booking.countDocuments = async (query) => {
    countQuery = query;
    return 5;
  };
  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Discounted Cut",
    duration: 30,
    price: 100,
    discountType: "percent",
    discountValue: 20,
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
  assert.deepEqual(countQuery, {
    barberId,
    clientId,
    status: "completed",
  });
  assert.equal(createdBookings[0].price, 72);
  assert.equal(createdBookings[0].serviceOriginalPrice, 100);
  assert.equal(createdBookings[0].serviceDiscountAmount, 20);
  assert.equal(createdBookings[0].originalPrice, 80);
  assert.equal(createdBookings[0].finalPrice, 72);
  assert.equal(createdBookings[0].discountAmount, 8);
  assert.equal(createdBookings[0].loyaltyDiscountApplied, true);
  assert.equal(createdBookings[0].loyaltyDiscountPercent, 10);
  assert.equal(createdBookings[0].loyaltyDiscountAmount, 8);
  assert.equal(createdBookings[0].loyaltyEligibleCompletedBookings, 5);
  assert.equal(createdBookings[0].loyaltyTierIndex, 0);
  assert.deepEqual(createdBookings[0].loyaltyRuleSnapshot, {
    thresholdCompletedBookings: 5,
    discountPercent: 10,
    maxDiscountPercent: 30,
    growthSteps: 4,
    scope: "barber",
  });
});

test("createBooking skips loyalty discount when client is below threshold", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barberWithSalon,
    loyaltyDiscountSettings: {
      enabled: true,
      thresholdCompletedBookings: 5,
      discountPercent: 10,
      maxDiscountPercent: 30,
    },
  });
  Booking.countDocuments = async () => 4;

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
  assert.equal(createdBookings[0].price, 100);
  assert.equal(createdBookings[0].loyaltyDiscountApplied, false);
  assert.equal(createdBookings[0].loyaltyDiscountPercent, 0);
  assert.equal(createdBookings[0].loyaltyDiscountAmount, 0);
  assert.equal(createdBookings[0].loyaltyEligibleCompletedBookings, 4);
});

test("createBooking does not stack loyalty discount with voucher", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barberWithSalon,
    loyaltyDiscountSettings: {
      enabled: true,
      thresholdCompletedBookings: 5,
      discountPercent: 10,
      maxDiscountPercent: 30,
    },
  });
  let countDocumentsCalled = false;
  Booking.countDocuments = async () => {
    countDocumentsCalled = true;
    return 5;
  };

  const voucher = {
    _id: "voucher-loyalty",
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
        voucherCode: "WELCOME10",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(countDocumentsCalled, false);
  assert.equal(createdBookings[0].price, 90);
  assert.equal(createdBookings[0].voucherDiscount, 10);
  assert.equal(createdBookings[0].loyaltyDiscountApplied, false);
  assert.equal(createdBookings[0].loyaltyDiscountPercent, 0);
  assert.equal(createdBookings[0].loyaltyDiscountAmount, 0);
});

test("createBooking calculates deposit from loyalty-discounted final price", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barberWithSalon,
    loyaltyDiscountSettings: {
      enabled: true,
      thresholdCompletedBookings: 5,
      discountPercent: 10,
      maxDiscountPercent: 30,
    },
  });
  Booking.countDocuments = async () => 5;
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
  assert.equal(createdBookings[0].price, 90);
  assert.equal(createdBookings[0].finalPrice, 90);
  assert.equal(createdBookings[0].depositRequired, true);
  assert.equal(createdBookings[0].depositAmount, 45);
});

const createLoyaltyTierBooking = async ({ completedBookings, service = {} }) => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barberWithSalon,
    loyaltyDiscountSettings: {
      enabled: true,
      thresholdCompletedBookings: 5,
      discountPercent: 50,
      maxDiscountPercent: 80,
    },
  });
  Booking.countDocuments = async (query) => {
    assert.deepEqual(query, {
      barberId,
      clientId,
      status: "completed",
    });
    return completedBookings;
  };
  const serviceDoc = {
    _id: serviceId,
    barberId,
    name: "Loyalty Cut",
    duration: 30,
    price: 100,
    discountType: "none",
    discountValue: 0,
    ...service,
  };
  Service.findOne = async () => serviceDoc;

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
  return { booking: createdBookings[0], serviceDoc };
};

test("createBooking does not mutate service price or discount fields for loyalty", async () => {
  const { booking, serviceDoc } = await createLoyaltyTierBooking({
    completedBookings: 5,
    service: {
      price: 100,
      discountType: "percent",
      discountValue: 20,
    },
  });

  assert.equal(booking.price, 40);
  assert.equal(serviceDoc.price, 100);
  assert.equal(serviceDoc.discountType, "percent");
  assert.equal(serviceDoc.discountValue, 20);
});

test("createBooking applies progressive loyalty tiers", async () => {
  const cases = [
    { completedBookings: 4, percent: 0, amount: 0, finalPrice: 100, tierIndex: undefined },
    { completedBookings: 5, percent: 50, amount: 50, finalPrice: 50, tierIndex: 0 },
    { completedBookings: 6, percent: 0, amount: 0, finalPrice: 100, tierIndex: undefined },
    { completedBookings: 9, percent: 0, amount: 0, finalPrice: 100, tierIndex: undefined },
    { completedBookings: 10, percent: 57.5, amount: 58, finalPrice: 42, tierIndex: 1 },
    { completedBookings: 11, percent: 0, amount: 0, finalPrice: 100, tierIndex: undefined },
    { completedBookings: 15, percent: 65, amount: 65, finalPrice: 35, tierIndex: 2 },
    { completedBookings: 20, percent: 72.5, amount: 73, finalPrice: 27, tierIndex: 3 },
    { completedBookings: 25, percent: 80, amount: 80, finalPrice: 20, tierIndex: 4 },
    { completedBookings: 30, percent: 80, amount: 80, finalPrice: 20, tierIndex: 5 },
  ];

  for (const expected of cases) {
    const { booking } = await createLoyaltyTierBooking({
      completedBookings: expected.completedBookings,
    });

    assert.equal(booking.price, expected.finalPrice);
    assert.equal(booking.finalPrice, expected.percent > 0 ? expected.finalPrice : undefined);
    assert.equal(booking.loyaltyDiscountApplied, expected.percent > 0);
    assert.equal(booking.loyaltyDiscountPercent, expected.percent);
    assert.equal(booking.loyaltyDiscountAmount, expected.amount);
    assert.equal(booking.loyaltyEligibleCompletedBookings, expected.completedBookings);
    assert.equal(booking.loyaltyTierIndex, expected.tierIndex);
  }
});

test("createBooking stores immutable loyalty rule snapshot", async () => {
  const createdBookings = [];
  const barberDoc = {
    ...barberWithSalon,
    loyaltyDiscountSettings: {
      enabled: true,
      thresholdCompletedBookings: 5,
      discountPercent: 50,
      maxDiscountPercent: 80,
    },
  };
  mockSuccessfulCreateDependencies(createdBookings, barberDoc);
  Booking.countDocuments = async () => 10;

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

  barberDoc.loyaltyDiscountSettings.discountPercent = 5;
  barberDoc.loyaltyDiscountSettings.maxDiscountPercent = 10;

  assert.deepEqual(createdBookings[0].loyaltyRuleSnapshot, {
    thresholdCompletedBookings: 5,
    discountPercent: 50,
    maxDiscountPercent: 80,
    growthSteps: 4,
    scope: "barber",
  });
});

test("createBooking uses threshold setting as loyalty interval", async () => {
  const cases = [
    { completedBookings: 3, percent: 50, finalPrice: 50, tierIndex: 0 },
    { completedBookings: 4, percent: 0, finalPrice: 100, tierIndex: undefined },
    { completedBookings: 6, percent: 57.5, finalPrice: 42, tierIndex: 1 },
  ];

  for (const expected of cases) {
    const createdBookings = [];
    mockSuccessfulCreateDependencies(createdBookings, {
      ...barberWithSalon,
      loyaltyDiscountSettings: {
        enabled: true,
        thresholdCompletedBookings: 3,
        discountPercent: 50,
        maxDiscountPercent: 80,
      },
    });
    Booking.countDocuments = async () => expected.completedBookings;

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
    assert.equal(createdBookings[0].price, expected.finalPrice);
    assert.equal(createdBookings[0].loyaltyDiscountPercent, expected.percent);
    assert.equal(createdBookings[0].loyaltyTierIndex, expected.tierIndex);
  }
});

test("quoteBookingPrice and createBooking use the same final price", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, {
    ...barberWithSalon,
    loyaltyDiscountSettings: {
      enabled: true,
      thresholdCompletedBookings: 5,
      discountPercent: 50,
      maxDiscountPercent: 80,
    },
  });
  Booking.countDocuments = async () => 10;
  Service.findOne = async () => ({
    _id: serviceId,
    barberId,
    name: "Discounted Cut",
    duration: 30,
    price: 100,
    discountType: "percent",
    discountValue: 20,
  });

  const quoteRes = createResponse();
  await quoteBookingPrice(
    {
      user: client,
      body: {
        barberId,
        serviceId,
        salonId,
      },
    },
    quoteRes
  );

  const createRes = createResponse();
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
        finalPrice: 9999,
        price: 9999,
        discountAmount: 9999,
      },
    },
    createRes
  );

  assert.equal(quoteRes.statusCode, 200);
  assert.equal(createRes.statusCode, 201);
  assert.equal(quoteRes.body.originalPrice, 100);
  assert.equal(quoteRes.body.serviceDiscountAmount, 20);
  assert.equal(quoteRes.body.serviceDiscountedPrice, 80);
  assert.equal(quoteRes.body.loyaltyDiscountApplied, true);
  assert.equal(quoteRes.body.loyaltyDiscountPercent, 57.5);
  assert.equal(quoteRes.body.loyaltyDiscountAmount, 46);
  assert.equal(quoteRes.body.finalPrice, 34);
  assert.equal(createdBookings[0].price, quoteRes.body.finalPrice);
  assert.equal(createdBookings[0].originalPrice, quoteRes.body.serviceDiscountedPrice);
  assert.equal(createdBookings[0].finalPrice, quoteRes.body.finalPrice);
  assert.equal(createdBookings[0].discountAmount, quoteRes.body.loyaltyDiscountAmount);
  assert.equal(createdBookings[0].loyaltyDiscountApplied, true);
  assert.equal(createdBookings[0].loyaltyDiscountPercent, quoteRes.body.loyaltyDiscountPercent);
  assert.equal(createdBookings[0].loyaltyDiscountAmount, quoteRes.body.loyaltyDiscountAmount);
  assert.equal(createdBookings[0].loyaltyTierIndex, quoteRes.body.loyaltyTierIndex);
  assert.deepEqual(createdBookings[0].loyaltyRuleSnapshot, quoteRes.body.loyaltyRuleSnapshot);
  assert.equal(createdBookings[0].depositAmount, 0);
});
