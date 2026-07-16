import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import { getBarbers } from "./userController.js";
import BarberProfile from "../models/BarberProfile.js";
import Salon from "../models/Salon.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import User from "../models/User.js";

const originalUserFind = User.find;
const originalBarberProfileFind = BarberProfile.find;
const originalSalonFind = Salon.find;
const originalSubscriptionFind = Subscription.find;
const originalSubscriptionSeatFind = SubscriptionSeat.find;

afterEach(() => {
  User.find = originalUserFind;
  BarberProfile.find = originalBarberProfileFind;
  Salon.find = originalSalonFind;
  Subscription.find = originalSubscriptionFind;
  SubscriptionSeat.find = originalSubscriptionSeatFind;
});

const chainableQuery = (result) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  lean() {
    return result;
  },
  then(resolve) {
    return Promise.resolve(result).then(resolve);
  },
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

const makeBarber = (overrides = {}) => {
  const barber = {
    _id: new mongoose.Types.ObjectId(),
    name: "Barber",
    role: "barber",
    email: "private@example.com",
    phone: "+37400000000",
    salons: [],
    salon: null,
    salonStatus: "none",
    specialty: "unisex",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };

  return {
    ...barber,
    toObject: () => ({ ...barber }),
  };
};

test("getBarbers hides unpaid barbers and shows paid individual or salon-seat covered barbers", async () => {
  const paidIndividualBarber = makeBarber({ name: "Paid Individual" });
  const salonId = new mongoose.Types.ObjectId();
  const salonSeatBarber = makeBarber({
    name: "Seat Covered",
    salons: [{ salon: salonId, status: "approved" }],
  });
  const unpaidBarber = makeBarber({ name: "Unpaid Barber" });
  const activeSalonSubscriptionId = new mongoose.Types.ObjectId();

  User.find = () =>
    chainableQuery([paidIndividualBarber, salonSeatBarber, unpaidBarber]);
  Subscription.find = () =>
    chainableQuery([
      {
        ownerId: paidIndividualBarber._id,
        status: "active",
      },
    ]);
  SubscriptionSeat.find = () =>
    chainableQuery([
      {
        barberId: salonSeatBarber._id,
        salonId,
        status: "active",
        subscriptionId: {
          _id: activeSalonSubscriptionId,
          ownerId: salonId,
          status: "trialing",
        },
      },
    ]);
  BarberProfile.find = async () => [];
  Salon.find = async () => [];

  const res = createResponse();
  await getBarbers({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.body.map((barber) => barber.name),
    ["Paid Individual", "Seat Covered"]
  );
  assert.equal(res.body.some((barber) => barber.name === "Unpaid Barber"), false);
});

test("getBarbers allowlists public fields and omits private profile data", async () => {
  const salonId = new mongoose.Types.ObjectId();
  const paidBarber = makeBarber({
    name: "Deposit Barber",
    platformRole: "superuser",
    salons: [{
      salon: salonId,
      status: "approved",
      isPrimary: true,
      joinedAt: new Date("2025-01-01"),
      relationshipType: "chair_renter",
      staffPayment: { fixedAmount: 5000 },
    }],
  });

  User.find = () => chainableQuery([paidBarber]);
  Subscription.find = () =>
    chainableQuery([
      {
        ownerId: paidBarber._id,
        status: "active",
      },
    ]);
  SubscriptionSeat.find = () => chainableQuery([]);
  BarberProfile.find = async () => [
    {
      barberId: paidBarber._id,
      address: "Private Street 1",
      city: "Yerevan",
      bio: "Public bio",
      depositSettings: {
        enabled: true,
        mode: "percentage",
        value: 25,
        minimumBookingPrice: 5000,
        noShowPolicyText: "Deposit applies before booking.",
      },
    },
  ];
  Salon.find = async () => [{
    _id: salonId,
    name: "Public Salon",
    city: "Yerevan",
    address: "Salon Street 1",
    ownerId: "owner-private",
    admins: ["admin-private"],
    toObject() {
      return { ...this };
    },
  }];

  const res = createResponse();
  await getBarbers({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].city, "Yerevan");
  assert.equal(res.body[0].bio, "Public bio");
  assert.equal(res.body[0].address, undefined);
  assert.equal(res.body[0].depositSettings, undefined);
  assert.equal(res.body[0].phone, undefined);
  assert.equal(res.body[0].favoriteBarbers, undefined);
  assert.equal(res.body[0].specialistOnboarding, undefined);
  assert.equal(res.body[0].email, undefined);
  assert.equal(res.body[0].platformRole, undefined);
  assert.equal(res.body[0].approvedSalons[0].isPrimary, true);
  assert.equal(res.body[0].approvedSalons[0].status, undefined);
  assert.equal(res.body[0].approvedSalons[0].joinedAt, undefined);
  assert.equal(res.body[0].approvedSalons[0].relationshipType, undefined);
  assert.equal(res.body[0].approvedSalons[0].staffPayment, undefined);
  assert.equal(res.body[0].approvedSalons[0].ownerId, undefined);
});

test("getBarbers hides barber with stale salon seat", async () => {
  const salonId = new mongoose.Types.ObjectId();
  const staleSeatBarber = makeBarber({
    name: "Stale Seat",
    salons: [{ salon: salonId, status: "rejected" }],
  });

  User.find = () => chainableQuery([staleSeatBarber]);
  Subscription.find = () => chainableQuery([]);
  SubscriptionSeat.find = () =>
    chainableQuery([
      {
        barberId: staleSeatBarber._id,
        salonId,
        status: "active",
        subscriptionId: {
          _id: new mongoose.Types.ObjectId(),
          ownerId: salonId,
          status: "active",
        },
      },
    ]);
  BarberProfile.find = async () => [];
  Salon.find = async () => [];

  const res = createResponse();
  await getBarbers({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("getBarbers returns barber with grace-granted active subscription", async () => {
  const graceBarber = makeBarber({ name: "Grace Barber" });

  User.find = () => chainableQuery([graceBarber]);
  Subscription.find = () =>
    chainableQuery([
      {
        ownerId: graceBarber._id,
        status: "active",
        provider: "manual",
      },
    ]);
  SubscriptionSeat.find = () => chainableQuery([]);
  BarberProfile.find = async () => [];
  Salon.find = async () => [];

  const res = createResponse();
  await getBarbers({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.body.map((barber) => barber.name),
    ["Grace Barber"]
  );
});
