import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import {
  removeBarberFromSalon,
  updateMemberRelationshipType,
} from "./salonStaffController.js";
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

test("owner can update relationshipType", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return {
        select: async () => ({ _id: ownerId, role: "barber" }),
      };
    }

    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        name: "Salon Member",
        role: "barber",
        salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
        salon: salonId,
        salonStatus: "approved",
        async save() {
          return this;
        },
      };
    }

    return null;
  };

  const res = createResponse();
  await updateMemberRelationshipType(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { relationshipType: "chair_renter" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barber.relationshipType, "chair_renter");
});

test("admin can update relationshipType", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({
    _id: salonId,
    ownerId: new mongoose.Types.ObjectId(),
    admins: [adminId],
  });
  User.findById = (id) => {
    if (String(id) === String(adminId)) {
      return {
        select: async () => ({ _id: adminId, role: "barber" }),
      };
    }

    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        name: "Salon Member",
        role: "barber",
        salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
        salon: salonId,
        salonStatus: "approved",
        async save() {
          return this;
        },
      };
    }

    return null;
  };

  const res = createResponse();
  await updateMemberRelationshipType(
    {
      user: { _id: adminId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { relationshipType: "chair_renter" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barber.relationshipType, "chair_renter");
});

test("normal member cannot update relationshipType", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const memberId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });
  User.findById = (id) => {
    if (String(id) === String(memberId)) {
      return {
        select: async () => ({ _id: memberId, role: "barber" }),
      };
    }

    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        name: "Salon Member",
        role: "barber",
        salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
        salon: salonId,
        salonStatus: "approved",
        async save() {
          return this;
        },
      };
    }

    return null;
  };

  const res = createResponse();
  await updateMemberRelationshipType(
    {
      user: { _id: memberId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { relationshipType: "chair_renter" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Only salon owner or admin/);
});

test("non-member cannot update relationshipType", async () => {
  const outsiderId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({
    _id: salonId,
    ownerId: new mongoose.Types.ObjectId(),
    admins: [],
  });
  User.findById = (id) => {
    if (String(id) === String(outsiderId)) {
      return {
        select: async () => ({ _id: outsiderId, role: "barber" }),
      };
    }

    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        name: "Salon Member",
        role: "barber",
        salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
        salon: salonId,
        salonStatus: "approved",
        async save() {
          return this;
        },
      };
    }

    return null;
  };

  const res = createResponse();
  await updateMemberRelationshipType(
    {
      user: { _id: outsiderId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { relationshipType: "chair_renter" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Only salon owner or admin/);
});

test("invalid type rejected", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return {
        select: async () => ({ _id: ownerId, role: "barber" }),
      };
    }

    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        name: "Salon Member",
        role: "barber",
        salons: [{ salon: salonId, status: "approved" }],
        salon: salonId,
        salonStatus: "approved",
        async save() {
          return this;
        },
      };
    }

    return null;
  };

  const res = createResponse();
  await updateMemberRelationshipType(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { relationshipType: "freelancer" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /relationshipType/);
});

test("cannot update non-approved member", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return {
        select: async () => ({ _id: ownerId, role: "barber" }),
      };
    }

    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        name: "Pending Member",
        role: "barber",
        salons: [{ salon: salonId, status: "pending", relationshipType: "staff" }],
        salon: salonId,
        salonStatus: "pending",
        async save() {
          return this;
        },
      };
    }

    return null;
  };

  const res = createResponse();
  await updateMemberRelationshipType(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { relationshipType: "chair_renter" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /approved member/);
});
