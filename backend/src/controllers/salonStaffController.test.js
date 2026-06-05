import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import { removeBarberFromSalon } from "./salonStaffController.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import User from "../models/User.js";
import { __notificationServiceTestHooks } from "../services/notificationService.js";

const originalNotificationCreate = Notification.create;
const originalSalonFindById = Salon.findById;
const originalSeatFind = SubscriptionSeat.find;
const originalUserFindById = User.findById;

const chainableQuery = (result) => ({
  populate() {
    return this;
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

afterEach(() => {
  Notification.create = originalNotificationCreate;
  Salon.findById = originalSalonFindById;
  SubscriptionSeat.find = originalSeatFind;
  User.findById = originalUserFindById;
  __notificationServiceTestHooks.resetGetIO();
});

test("removeBarberFromSalon revokes active subscription seat", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const salon = {
    _id: salonId,
    name: "Seat Salon",
    ownerId,
    admins: [],
  };
  const barber = {
    _id: barberId,
    name: "Removed Barber",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", isPrimary: true }],
    salon: salonId,
    salonStatus: "approved",
    workHistory: [],
    async save() {
      return this;
    },
  };
  const activeSeat = {
    _id: new mongoose.Types.ObjectId(),
    salonId,
    barberId,
    status: "active",
    revokedAt: null,
    subscriptionId: {
      ownerId: salonId,
      status: "active",
    },
    async save() {
      return this;
    },
  };

  __notificationServiceTestHooks.setGetIO(() => null);
  Notification.create = async (payload) => payload;
  Salon.findById = async () => salon;
  User.findById = async () => barber;
  SubscriptionSeat.find = () => chainableQuery([activeSeat]);

  const res = createResponse();
  await removeBarberFromSalon(
    {
      user: { _id: ownerId, id: String(ownerId), role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(activeSeat.status, "revoked");
  assert.ok(activeSeat.revokedAt instanceof Date);
  assert.equal(barber.salons.length, 0);
  assert.equal(barber.salonStatus, "none");
});
