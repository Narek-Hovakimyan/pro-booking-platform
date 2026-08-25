import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import {
  getSalonStaff,
  updateSalonMemberRelationshipType,
} from "./salonStaffService.js";

const originalMethods = {
  salonFindById: Salon.findById,
  userFindById: User.findById,
  userFind: User.find,
  profileFind: BarberProfile.find,
};

afterEach(() => {
  Salon.findById = originalMethods.salonFindById;
  User.findById = originalMethods.userFindById;
  User.find = originalMethods.userFind;
  BarberProfile.find = originalMethods.profileFind;
});

const salonA = "salon-a";
const salonB = "salon-b";
const requesterId = "requester";

const hasMatchingMembership = (user, branch) => {
  if (branch.salons?.$elemMatch) {
    const { salon, status } = branch.salons.$elemMatch;
    return (user.salons || []).some(
      (entry) => String(entry.salon) === String(salon) && entry.status === status
    );
  }

  return (user.salons || []).some(
    (entry) => String(entry.salon) === String(branch["salons.salon"])
  ) && (user.salons || []).some(
    (entry) => entry.status === branch["salons.status"]
  );
};

const matchesStaffFilter = (user, filter) =>
  user.role === filter.role && filter.$or.some((branch) =>
    branch.salons
      ? hasMatchingMembership(user, branch)
      : String(user.salon) === String(branch.salon) &&
        user.salonStatus === branch.salonStatus
  );

const staffUser = (id, salons, extra = {}) => ({
  _id: id,
  role: "barber",
  name: id,
  avatarUrl: "/avatar.png",
  specialty: "unisex",
  profession: "barber",
  barberType: "",
  city: "Yerevan",
  salons,
  ...extra,
});

const mockDependencies = (staffUsers, requesterIdOverride = requesterId) => {
  Salon.findById = async () => ({ _id: salonB, ownerId: "owner", admins: [] });
  User.findById = async () => ({
    _id: requesterIdOverride,
    role: "barber",
    salons: [{ salon: salonB, status: "approved" }],
  });
  User.find = (filter) => ({
    select: async () => staffUsers.filter((user) => matchesStaffFilter(user, filter)),
  });
  BarberProfile.find = async () => [];
};

test("getSalonStaff requires salon and approved status from one membership entry", async () => {
  const users = [
    staffUser("approved-a-pending-b", [
      { salon: salonA, status: "approved" },
      { salon: salonB, status: "pending" },
    ]),
    staffUser("approved-a-rejected-b", [
      { salon: salonA, status: "approved" },
      { salon: salonB, status: "rejected" },
    ]),
    staffUser("pending-a-approved-b", [
      { salon: salonA, status: "pending" },
      { salon: salonB, status: "approved", relationshipType: "chair_renter" },
    ]),
    staffUser("approved-b", [{ salon: salonB, status: "approved" }], {
      email: "private@example.com",
      phone: "+37400000000",
    }),
    staffUser("pending-b", [{ salon: salonB, status: "pending" }]),
    staffUser("rejected-b", [{ salon: salonB, status: "rejected" }]),
    staffUser("legacy-approved-b", [], { salon: salonB, salonStatus: "approved" }),
  ];
  mockDependencies(users);

  const staff = await getSalonStaff(salonB, requesterId);
  const ids = staff.map((member) => member.id);

  assert.deepEqual(ids, ["pending-a-approved-b", "approved-b", "legacy-approved-b"]);
  assert.equal(staff[0].relationshipType, "chair_renter");
  assert.equal("email" in staff[1], false);
  assert.equal("phone" in staff[1], false);
});

test("getSalonStaff uses an elemMatch filter for approved array memberships", async () => {
  mockDependencies([]);
  let capturedFilter;
  User.find = (filter) => {
    capturedFilter = filter;
    return { select: async () => [] };
  };

  await getSalonStaff(salonB, requesterId);

  assert.deepEqual(capturedFilter.$or[0], {
    salons: { $elemMatch: { salon: salonB, status: "approved" } },
  });
  assert.deepEqual(capturedFilter.$or[1], {
    salon: salonB,
    salonStatus: "approved",
  });
});

test("getSalonStaff hides staff payment for non-accepted or non-staff relationships", async () => {
  const users = [
    staffUser("accepted-staff", [{
      salon: salonB,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
      staffPayment: { type: "fixed", fixedAmount: 100 },
    }]),
    staffUser("pending-staff", [{
      salon: salonB,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "pending",
      staffPayment: { type: "fixed", fixedAmount: 200 },
    }]),
    staffUser("rejected-staff", [{
      salon: salonB,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "rejected",
      staffPayment: { type: "fixed", fixedAmount: 300 },
    }]),
    staffUser("chair-renter", [{
      salon: salonB,
      status: "approved",
      relationshipType: "chair_renter",
      relationshipStatus: "accepted",
      staffPayment: { type: "fixed", fixedAmount: 400 },
    }]),
  ];
  mockDependencies(users, "owner");

  const staff = await getSalonStaff(salonB, "owner");
  const byId = new Map(staff.map((member) => [member.id, member]));

  assert.equal(byId.get("accepted-staff").staffPayment.type, "fixed");
  for (const id of ["pending-staff", "rejected-staff", "chair-renter"]) {
    assert.equal(Object.hasOwn(byId.get(id), "staffPayment"), false);
  }
});

test("relationship transition CAS permits one concurrent winner", async () => {
  const salonId = "salon";
  const barberId = "barber";
  const ownerId = "owner";
  const adminId = "admin";
  let arrivals = 0;
  let releaseSaves;
  const saveBarrier = new Promise((resolve) => { releaseSaves = resolve; });
  let persisted = {
    _id: barberId,
    name: "Member",
    role: "barber",
    salon: salonId,
    salonStatus: "approved",
    salons: [{
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
      staffPayment: { type: "fixed", fixedAmount: 100 },
    }],
  };

  const matches = (value, expected) => expected?.$in
    ? expected.$in.some((candidate) => candidate === null ? value == null : value === candidate)
    : String(value) === String(expected);
  const snapshot = () => ({
    ...persisted,
    salons: persisted.salons.map((entry) => ({ ...entry, staffPayment: { ...entry.staffPayment } })),
    async save() {
      arrivals += 1;
      if (arrivals === 2) releaseSaves();
      await saveBarrier;
      const current = persisted.salons[0];
      const where = this.$where;
      if (!matches(current.salon, where["salons.0.salon"]) ||
          !matches(current.status, where["salons.0.status"]) ||
          !matches(current.relationshipType, where["salons.0.relationshipType"]) ||
          !matches(current.relationshipStatus, where["salons.0.relationshipStatus"])) {
        const error = new Error("CAS miss");
        error.name = "DocumentNotFoundError";
        throw error;
      }
      persisted = {
        ...persisted,
        salon: this.salon,
        salonStatus: this.salonStatus,
        salons: this.salons.map((entry) => ({ ...entry, staffPayment: { ...entry.staffPayment } })),
      };
      return this;
    },
  });

  Salon.findById = async () => ({ _id: salonId, ownerId, admins: [adminId] });
  User.findById = (id) => {
    if (id === ownerId || id === adminId) {
      return { select: async () => ({ _id: id, role: "barber" }) };
    }
    return id === barberId ? snapshot() : null;
  };

  const results = await Promise.allSettled([
    updateSalonMemberRelationshipType(salonId, barberId, ownerId, "chair_renter"),
    updateSalonMemberRelationshipType(salonId, barberId, adminId, "staff"),
  ]);
  const winner = results.find((result) => result.status === "fulfilled");
  const loser = results.find((result) => result.status === "rejected");

  assert.ok(winner);
  assert.ok(loser);
  assert.equal(loser.reason.statusCode, 409);
  assert.equal(persisted.salons[0].relationshipType, winner.value.relationshipType);
  assert.equal(persisted.salons[0].relationshipStatus, "pending");
  assert.equal(persisted.salons[0].relationshipPreviousType, "staff");
  assert.equal(persisted.salons[0].relationshipPreviousStatus, "accepted");
  assert.equal(
    persisted.salons[0].relationshipRequestedBy,
    winner.value.relationshipType === "chair_renter" ? ownerId : adminId
  );
  assert.deepEqual(persisted.salons[0].staffPayment, { type: "fixed", fixedAmount: 100 });
});
