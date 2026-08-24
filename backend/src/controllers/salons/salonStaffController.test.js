import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import {
  promoteToAdmin,
  removeBarberFromSalon,
  respondToRelationshipType,
  updateMemberRelationshipType,
  updateStaffPaymentSettings,
} from "./salonStaffController.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import { __notificationServiceTestHooks } from "../../services/notification/notificationService.js";

const originalNotificationCreate = Notification.create;
const originalStartSession = mongoose.startSession;
const originalSalonFindById = Salon.findById;
const originalSeatFind = SubscriptionSeat.find;
const originalUserFindById = User.findById;
const originalJoinRequestUpdateMany = SalonJoinRequest.updateMany;

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
  mongoose.startSession = originalStartSession;
  Notification.create = originalNotificationCreate;
  Salon.findById = originalSalonFindById;
  SubscriptionSeat.find = originalSeatFind;
  User.findById = originalUserFindById;
  SalonJoinRequest.updateMany = originalJoinRequestUpdateMany;
  __notificationServiceTestHooks.resetGetIO();
});

test("promotion requires approved canonical or legacy salon membership", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const otherSalonId = new mongoose.Types.ObjectId();
  const deniedCases = [
    { name: "pending canonical", salons: [{ salon: salonId, status: "pending" }] },
    { name: "rejected canonical", salons: [{ salon: salonId, status: "rejected" }] },
    { name: "pending legacy", salon: salonId, salonStatus: "pending" },
    { name: "rejected legacy", salon: salonId, salonStatus: "rejected" },
    { name: "empty legacy status", salon: salonId, salonStatus: "none" },
    { name: "outsider", salons: [] },
    { name: "another salon", salons: [{ salon: otherSalonId, status: "approved" }] },
  ];

  for (const denied of deniedCases) {
    const targetId = new mongoose.Types.ObjectId();
    const salon = {
      _id: salonId,
      name: "Promotion Salon",
      ownerId,
      admins: [],
      async save() {
        throw new Error("denied promotion must not save salon");
      },
    };
    const notifications = [];
    const barber = {
      _id: targetId,
      name: denied.name,
      role: "barber",
      salons: [],
      salon: null,
      salonStatus: "none",
      ...denied,
    };

    Salon.findById = async () => salon;
    User.findById = async () => barber;
    Notification.create = async (payload) => notifications.push(payload);

    const res = createResponse();
    await promoteToAdmin(
      {
        user: { _id: ownerId, role: "barber" },
        params: { salonId: String(salonId), barberId: String(targetId) },
      },
      res
    );

    assert.equal(res.statusCode, 400, denied.name);
    assert.deepEqual(salon.admins, [], denied.name);
    assert.deepEqual(notifications, [], denied.name);
  }
});

test("only owner can promote approved barbers and preserves approved compatibility", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const nonOwnerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const approvedMembers = [
    { name: "canonical", salons: [{ salon: salonId, status: "approved" }] },
    { name: "legacy", salons: [], salon: salonId, salonStatus: "approved" },
  ];

  for (const member of approvedMembers) {
    const targetId = new mongoose.Types.ObjectId();
    const salon = {
      _id: salonId,
      name: "Promotion Salon",
      ownerId,
      admins: [],
      async save() {
        return this;
      },
    };
    const notifications = [];
    const barber = { _id: targetId, role: "barber", ...member };

    Salon.findById = async () => salon;
    User.findById = async () => barber;
    Notification.create = async (payload) => notifications.push(payload);

    const res = createResponse();
    await promoteToAdmin(
      {
        user: { _id: ownerId, role: "barber" },
        params: { salonId: String(salonId), barberId: String(targetId) },
      },
      res
    );

    assert.equal(res.statusCode, 200, member.name);
    assert.deepEqual(salon.admins, [targetId], member.name);
    assert.equal(notifications.length, 1, member.name);
  }

  const salon = { _id: salonId, ownerId, admins: [] };
  Salon.findById = async () => salon;
  User.findById = async () => ({ _id: new mongoose.Types.ObjectId(), role: "client" });
  Notification.create = () => {
    throw new Error("denied promotion must not notify");
  };

  const nonOwnerResponse = createResponse();
  await promoteToAdmin(
    {
      user: { _id: nonOwnerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(new mongoose.Types.ObjectId()) },
    },
    nonOwnerResponse
  );
  assert.equal(nonOwnerResponse.statusCode, 403);
  assert.deepEqual(salon.admins, []);

  const nonBarberResponse = createResponse();
  await promoteToAdmin(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(new mongoose.Types.ObjectId()) },
    },
    nonBarberResponse
  );
  assert.equal(nonBarberResponse.statusCode, 404);
  assert.deepEqual(salon.admins, []);
});

test("removeBarberFromSalon revokes active subscription seat", async () => {
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      await callback();
    },
    async endSession() {},
  });
  const ownerId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const barberId = new mongoose.Types.ObjectId();
  const salon = {
    _id: salonId,
    name: "Seat Salon",
    ownerId,
    admins: [],
    async save() {
      return this;
    },
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
      _id: new mongoose.Types.ObjectId(),
      ownerId: salonId,
      status: "active",
      activeSeatCount: 1,
      async save() {
        return this;
      },
    },
    async save() {
      return this;
    },
  };
  const acceptedRequest = { salonId, barberId, status: "accepted" };

  __notificationServiceTestHooks.setGetIO(() => null);
  Notification.create = async (payload) => payload;
  Salon.findById = async () => salon;
  User.findById = async () => barber;
  SalonJoinRequest.updateMany = async (filter, update, options) => {
    assert.deepEqual(filter, { salonId, barberId, status: "accepted" });
    assert.equal(update.$set.status, "cancelled");
    assert.ok(options.session);
    acceptedRequest.status = update.$set.status;
    return { modifiedCount: 1 };
  };
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
  assert.equal(activeSeat.subscriptionId.activeSeatCount, 0);
  assert.equal(barber.salons.length, 0);
  assert.equal(barber.salonStatus, "none");
  assert.equal(acceptedRequest.status, "cancelled");
});

test("owner removal revokes promoted admin authority without affecting another salon", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const otherSalonId = new mongoose.Types.ObjectId();
  const salon = {
    _id: salonId,
    name: "Primary Salon",
    ownerId,
    admins: [adminId],
    async save() {
      return this;
    },
  };
  const otherSalon = {
    _id: otherSalonId,
    ownerId: new mongoose.Types.ObjectId(),
    admins: [adminId],
  };
  const barber = {
    _id: adminId,
    name: "Admin Barber",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", isPrimary: true }],
    salon: salonId,
    salonStatus: "approved",
    workHistory: [],
    async save() {
      return this;
    },
  };

  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      await callback();
    },
    async endSession() {},
  });
  Salon.findById = async (id) =>
    String(id) === String(salonId) ? salon : otherSalon;
  User.findById = async () => barber;
  SalonJoinRequest.updateMany = async () => ({ modifiedCount: 0 });
  SubscriptionSeat.find = () => chainableQuery([]);
  Notification.create = async (payload) => payload;
  __notificationServiceTestHooks.setGetIO(() => null);

  const res = createResponse();
  await removeBarberFromSalon(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId: String(salonId), barberId: String(adminId) },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(salon.admins, []);
  assert.deepEqual(otherSalon.admins, [adminId]);
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
