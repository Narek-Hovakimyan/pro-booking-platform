import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import {
  canUserCreateEventForSalon,
  getManageableSalonQuery,
} from "./salonMembershipService.js";

const originalMethods = {
  salonFindOne: Salon.findOne,
  joinRequestFind: SalonJoinRequest.find,
  joinRequestFindOne: SalonJoinRequest.findOne,
};

const ownerId = "64b000000000000000000001";
const adminId = "64b000000000000000000002";
const memberId = "64b000000000000000000003";
const legacyMemberId = "64b000000000000000000004";
const fallbackMemberId = "64b000000000000000000005";
const unrelatedUserId = "64b000000000000000000006";
const salonId = "64b000000000000000000007";
const otherSalonId = "64b000000000000000000008";

afterEach(() => {
  Salon.findOne = originalMethods.salonFindOne;
  SalonJoinRequest.find = originalMethods.joinRequestFind;
  SalonJoinRequest.findOne = originalMethods.joinRequestFindOne;
});

const salon = {
  _id: salonId,
  ownerId,
  admins: [adminId],
};

test("owner has access", async () => {
  const allowed = await canUserCreateEventForSalon(
    { _id: ownerId, role: "barber" },
    salon
  );

  assert.equal(allowed, true);
});

test("admin has access", async () => {
  const allowed = await canUserCreateEventForSalon(
    { _id: adminId, role: "barber" },
    salon
  );

  assert.equal(allowed, true);
});

test("approved user.salons member has access", async () => {
  const allowed = await canUserCreateEventForSalon(
    {
      _id: memberId,
      role: "barber",
      salon: null,
      salonStatus: "none",
      salons: [{ salon: salonId, status: "approved" }],
    },
    salon
  );

  assert.equal(allowed, true);
});

test("legacy approved user.salon member has access", async () => {
  const allowed = await canUserCreateEventForSalon(
    {
      _id: legacyMemberId,
      role: "barber",
      salon: salonId,
      salonStatus: "approved",
      salons: [],
    },
    salon
  );

  assert.equal(allowed, true);
});

test("accepted SalonJoinRequest fallback works", async () => {
  SalonJoinRequest.findOne = async () => ({ _id: "accepted-request" });

  const allowed = await canUserCreateEventForSalon(
    {
      _id: fallbackMemberId,
      role: "barber",
      salon: null,
      salonStatus: "none",
      salons: [],
    },
    salon
  );

  assert.equal(allowed, true);
});

test("unrelated user has no access", async () => {
  SalonJoinRequest.findOne = async () => null;

  const allowed = await canUserCreateEventForSalon(
    {
      _id: unrelatedUserId,
      role: "barber",
      salon: null,
      salonStatus: "none",
      salons: [],
    },
    salon
  );

  assert.equal(allowed, false);
});

test("getManageableSalonQuery preserves approved, legacy, and accepted membership sources", async () => {
  SalonJoinRequest.find = () => ({
    distinct: async () => [otherSalonId],
  });

  const query = await getManageableSalonQuery({
    _id: memberId,
    role: "barber",
    salon: otherSalonId,
    salonStatus: "approved",
    salons: [{ salon: salonId, status: "approved" }],
  });

  assert.deepEqual(query, {
    $or: [
      { ownerId: memberId },
      { admins: memberId },
      { _id: { $in: [salonId, otherSalonId] } },
    ],
  });
});
