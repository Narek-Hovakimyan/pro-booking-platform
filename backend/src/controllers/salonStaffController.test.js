import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import {
  removeBarberFromSalon,
  respondToRelationshipType,
  updateMemberRelationshipType,
  updateStaffPaymentSettings,
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

test("owner request sets pending relationshipType", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
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
      return barber;
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
  assert.equal(res.body.barber.relationshipStatus, "pending");
  assert.equal(barber.salons[0].relationshipType, "chair_renter");
  assert.equal(barber.salons[0].relationshipStatus, "pending");
  assert.equal(String(barber.salons[0].relationshipRequestedBy), String(ownerId));
  assert.ok(barber.salons[0].relationshipRequestedAt instanceof Date);
  assert.equal(barber.salons[0].relationshipRespondedAt, null);
});

test("admin request sets pending relationshipType", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
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
      return barber;
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
  assert.equal(res.body.barber.relationshipStatus, "pending");
  assert.equal(barber.salons[0].relationshipStatus, "pending");
  assert.equal(String(barber.salons[0].relationshipRequestedBy), String(adminId));
});

test("owner cannot update own relationshipType as salon staff", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const owner = {
    _id: ownerId,
    name: "Salon Owner",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [] });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return {
        select: async () => ({ _id: ownerId, role: "barber" }),
        ...owner,
      };
    }

    return null;
  };

  const res = createResponse();
  await updateMemberRelationshipType(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(ownerId) },
      body: { relationshipType: "chair_renter" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /owner relationship type cannot be changed/);
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

test("owner can update staff payment settings", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
    _id: barberId,
    name: "Salon Staff",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [] });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return { select: async () => ({ _id: ownerId, role: "barber" }) };
    }
    if (String(id) === String(barberId)) return barber;
    return null;
  };

  const res = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: {
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 70,
          commissionSalonPercent: 30,
          notes: "Internal",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(barber.salons[0].staffPayment.type, "commission");
  assert.equal(barber.salons[0].staffPayment.commissionStaffPercent, 70);
  assert.equal(barber.salons[0].staffPayment.commissionSalonPercent, 30);
  assert.ok(barber.salons[0].staffPayment.updatedAt instanceof Date);
  assert.equal(String(barber.salons[0].staffPayment.updatedBy), String(ownerId));
});

test("owner cannot update own staff payment settings", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const owner = {
    _id: ownerId,
    name: "Salon Owner",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [] });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return {
        select: async () => ({ _id: ownerId, role: "barber" }),
        ...owner,
      };
    }
    return null;
  };

  const res = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(ownerId) },
      body: {
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 70,
          commissionSalonPercent: 30,
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /owner cannot receive staff payment/i);
  assert.equal(owner.salons[0].staffPayment, undefined);
});

test("admin can update staff payment settings", async () => {
  const adminId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
    _id: barberId,
    name: "Salon Staff",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({
    _id: salonId,
    ownerId: new mongoose.Types.ObjectId(),
    admins: [adminId],
  });
  User.findById = (id) => {
    if (String(id) === String(adminId)) {
      return { select: async () => ({ _id: adminId, role: "barber" }) };
    }
    if (String(id) === String(barberId)) return barber;
    return null;
  };

  const res = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: adminId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: {
        staffPayment: {
          type: "fixed",
          fixedAmount: 100000,
          fixedPeriod: "monthly",
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(barber.salons[0].staffPayment.type, "fixed");
  assert.equal(barber.salons[0].staffPayment.fixedAmount, 100000);
  assert.equal(barber.salons[0].staffPayment.fixedPeriod, "monthly");
});

test("non-owner/admin cannot update staff payment settings", async () => {
  const memberId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({
    _id: salonId,
    ownerId: new mongoose.Types.ObjectId(),
    admins: [],
  });
  User.findById = (id) => {
    if (String(id) === String(memberId)) {
      return { select: async () => ({ _id: memberId, role: "barber" }) };
    }
    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        role: "barber",
        salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
        async save() {
          return this;
        },
      };
    }
    return null;
  };

  const res = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: memberId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { staffPayment: { type: "none" } },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Only salon owner or admin/);
});

test("chair renter cannot receive staff payment settings", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [] });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return { select: async () => ({ _id: ownerId, role: "barber" }) };
    }
    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        role: "barber",
        salons: [{ salon: salonId, status: "approved", relationshipType: "chair_renter" }],
        async save() {
          return this;
        },
      };
    }
    return null;
  };

  const res = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { staffPayment: { type: "fixed", fixedAmount: 100, fixedPeriod: "daily" } },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /only to staff/);
});

test("pending member cannot receive staff payment settings", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [] });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return { select: async () => ({ _id: ownerId, role: "barber" }) };
    }
    if (String(id) === String(barberId)) {
      return {
        _id: barberId,
        role: "barber",
        salons: [{ salon: salonId, status: "pending", relationshipType: "staff" }],
        async save() {
          return this;
        },
      };
    }
    return null;
  };

  const res = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { staffPayment: { type: "none" } },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /approved member/);
});

test("staff payment validation rejects bad commission and fixed payloads", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
    _id: barberId,
    role: "barber",
    salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [] });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return { select: async () => ({ _id: ownerId, role: "barber" }) };
    }
    if (String(id) === String(barberId)) return barber;
    return null;
  };

  const commissionRes = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: {
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 60,
          commissionSalonPercent: 30,
        },
      },
    },
    commissionRes
  );

  assert.equal(commissionRes.statusCode, 400);
  assert.match(commissionRes.body.message, /add up to 100/);

  const fixedRes = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { staffPayment: { type: "fixed", fixedAmount: 0 } },
    },
    fixedRes
  );

  assert.equal(fixedRes.statusCode, 400);
  assert.match(fixedRes.body.message, /amount greater than 0/);
});

test("staff payment update is isolated to matching salon entry", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const otherSalonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
    _id: barberId,
    name: "Multi Salon Staff",
    role: "barber",
    salons: [
      { salon: otherSalonId, status: "approved", relationshipType: "staff" },
      { salon: salonId, status: "approved", relationshipType: "staff" },
    ],
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [] });
  User.findById = (id) => {
    if (String(id) === String(ownerId)) {
      return { select: async () => ({ _id: ownerId, role: "barber" }) };
    }
    if (String(id) === String(barberId)) return barber;
    return null;
  };

  const res = createResponse();
  await updateStaffPaymentSettings(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(barberId) },
      body: { staffPayment: { type: "none" } },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(barber.salons[0].staffPayment, undefined);
  assert.equal(barber.salons[1].staffPayment.type, "none");
});

test("barber can accept pending relationship", async () => {
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
    _id: barberId,
    name: "Salon Member",
    role: "barber",
    salons: [
      {
        salon: salonId,
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "pending",
        relationshipRequestedAt: new Date("2026-06-01T10:00:00.000Z"),
      },
    ],
    salon: salonId,
    salonStatus: "approved",
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId });
  User.findById = async (id) => (String(id) === String(barberId) ? barber : null);

  const res = createResponse();
  await respondToRelationshipType(
    {
      user: { _id: barberId, role: "barber" },
      params: { salonId: String(salonId) },
      body: { response: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barber.relationshipStatus, "accepted");
  assert.equal(barber.salons[0].relationshipStatus, "accepted");
  assert.ok(barber.salons[0].relationshipRespondedAt instanceof Date);
});

test("barber can reject pending relationship", async () => {
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
    _id: barberId,
    name: "Salon Member",
    role: "barber",
    salons: [
      {
        salon: salonId,
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "pending",
      },
    ],
    salon: salonId,
    salonStatus: "approved",
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId });
  User.findById = async (id) => (String(id) === String(barberId) ? barber : null);

  const res = createResponse();
  await respondToRelationshipType(
    {
      user: { _id: barberId, role: "barber" },
      params: { salonId: String(salonId) },
      body: { response: "rejected" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.barber.relationshipStatus, "rejected");
  assert.equal(barber.salons[0].relationshipStatus, "rejected");
  assert.equal(barber.salons[0].relationshipType, "staff");
});

test("non-target barber cannot respond", async () => {
  const salonId = new mongoose.Types.ObjectId();
  const targetBarberId = new mongoose.Types.ObjectId();
  const otherBarberId = new mongoose.Types.ObjectId();

  Salon.findById = async () => ({ _id: salonId });
  User.findById = async (id) => {
    if (String(id) !== String(otherBarberId)) return null;
    return {
      _id: otherBarberId,
      name: "Other Barber",
      role: "barber",
      salons: [],
      async save() {
        return this;
      },
    };
  };

  const res = createResponse();
  await respondToRelationshipType(
    {
      user: { _id: otherBarberId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(targetBarberId) },
      body: { response: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /approved member/);
});

test("cannot respond when no pending request", async () => {
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const barber = {
    _id: barberId,
    name: "Salon Member",
    role: "barber",
    salons: [
      {
        salon: salonId,
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "accepted",
      },
    ],
    salon: salonId,
    salonStatus: "approved",
    async save() {
      return this;
    },
  };

  Salon.findById = async () => ({ _id: salonId });
  User.findById = async (id) => (String(id) === String(barberId) ? barber : null);

  const res = createResponse();
  await respondToRelationshipType(
    {
      user: { _id: barberId, role: "barber" },
      params: { salonId: String(salonId) },
      body: { response: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /No pending relationship request/);
});
