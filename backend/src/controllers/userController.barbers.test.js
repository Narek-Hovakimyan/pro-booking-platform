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
  const salonSeatBarber = makeBarber({ name: "Seat Covered" });
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
        status: "active",
        subscriptionId: {
          _id: activeSalonSubscriptionId,
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
