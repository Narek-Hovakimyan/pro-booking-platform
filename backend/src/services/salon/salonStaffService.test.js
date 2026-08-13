import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { getSalonStaff } from "./salonStaffService.js";

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

const mockDependencies = (staffUsers) => {
  Salon.findById = async () => ({ _id: salonB, ownerId: "owner", admins: [] });
  User.findById = async () => ({
    _id: requesterId,
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
