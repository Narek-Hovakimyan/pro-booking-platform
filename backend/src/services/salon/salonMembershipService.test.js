import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import {
  canUserCreateEventForSalon,
  findManageableSalonsForUser,
  getApprovedUserSalonIds,
  getManageableSalonQuery,
  getPrimaryApprovedSalonId,
  isUserApprovedForSalon,
  userHasAnyManageableSalon,
} from "./salonMembershipService.js";

const originalMethods = {
  salonFindOne: Salon.findOne,
  salonFind: Salon.find,
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
  Salon.find = originalMethods.salonFind;
  SalonJoinRequest.findOne = originalMethods.joinRequestFindOne;
});

const salon = {
  _id: salonId,
  ownerId,
  admins: [adminId],
};

test("canonical same-salon status takes precedence over legacy approval", () => {
  for (const status of ["pending", "rejected", "cancelled"]) {
    const user = {
      salon: salonId,
      salonStatus: "approved",
      salons: [{ salon: salonId, status }],
    };

    assert.deepEqual(getApprovedUserSalonIds(user), [], status);
    assert.equal(isUserApprovedForSalon(user, salonId), false, status);
    assert.equal(getPrimaryApprovedSalonId(user), null, status);
  }

  const approved = {
    salon: salonId,
    salonStatus: "approved",
    salons: [{ salon: salonId, status: "approved" }],
  };
  assert.deepEqual(getApprovedUserSalonIds(approved), [salonId]);
  assert.equal(getPrimaryApprovedSalonId(approved), salonId);
});

test("distinct and legacy-only approved salon fallbacks remain compatible", () => {
  const distinct = {
    salon: salonId,
    salonStatus: "approved",
    salons: [{ salon: otherSalonId, status: "pending" }],
  };
  const legacyOnly = {
    salon: salonId,
    salonStatus: "approved",
    salons: [],
  };

  assert.deepEqual(getApprovedUserSalonIds(distinct), [salonId]);
  assert.equal(isUserApprovedForSalon(distinct, salonId), true);
  assert.equal(getPrimaryApprovedSalonId(distinct), salonId);
  assert.deepEqual(getApprovedUserSalonIds(legacyOnly), [salonId]);
  assert.equal(getPrimaryApprovedSalonId(legacyOnly), salonId);
});

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

test("historical accepted join request alone cannot create salon events", async () => {
  const staleAcceptedRequest = {
    _id: "64b000000000000000000009",
    salonId,
    barberId: fallbackMemberId,
    status: "accepted",
  };
  SalonJoinRequest.findOne = async () => staleAcceptedRequest;

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

  assert.equal(allowed, false);
});

test("unrelated user has no access", async () => {
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

test("getManageableSalonQuery returns owner/admin only, not membership salons", async () => {
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
    ],
  });
});

test("owner is included in manageable salons", async () => {
  const salonDoc = { _id: salonId, name: "Test Salon", ownerId, admins: [] };
  Salon.find = () => ({
    sort: () => [salonDoc],
  });

  const salons = await findManageableSalonsForUser(ownerId);
  assert.equal(salons.length, 1);
  assert.equal(String(salons[0]._id), salonId);
});

test("admin is included in manageable salons", async () => {
  const salonDoc = { _id: salonId, name: "Test Salon", ownerId, admins: [adminId] };
  Salon.find = () => ({
    sort: () => [salonDoc],
  });

  const salons = await findManageableSalonsForUser(adminId);
  assert.equal(salons.length, 1);
  assert.equal(String(salons[0]._id), salonId);
});

test("approved staff does NOT get salon in manageable list", async () => {
  const salonDoc = { _id: salonId, name: "Test Salon", ownerId, admins: [] };
  Salon.find = () => ({
    sort: () => [],
  });

  const salons = await findManageableSalonsForUser(memberId);
  assert.equal(salons.length, 0);
});

test("chair_renter does NOT get salon in manageable list", async () => {
  const salonDoc = { _id: salonId, name: "Test Salon", ownerId, admins: [] };
  Salon.find = () => ({
    sort: () => [],
  });

  const salons = await findManageableSalonsForUser(legacyMemberId);
  assert.equal(salons.length, 0);
});

test("accepted join request alone does NOT make salon manageable", async () => {
  Salon.find = () => ({
    sort: () => [],
  });

  const salons = await findManageableSalonsForUser(fallbackMemberId);
  assert.equal(salons.length, 0);
});

test("userHasAnyManageableSalon returns false for client", async () => {
  const result = await userHasAnyManageableSalon({ _id: unrelatedUserId, role: "client" });
  assert.equal(result, false);
});

test("userHasAnyManageableSalon returns true for owner", async () => {
  Salon.findOne = () => ({
    select: () => ({ _id: salonId }),
  });

  const result = await userHasAnyManageableSalon({ _id: ownerId, role: "barber" });
  assert.equal(result, true);
});

test("userHasAnyManageableSalon returns false for staff without owner/admin", async () => {
  Salon.findOne = () => ({
    select: () => null,
  });

  const result = await userHasAnyManageableSalon({ _id: memberId, role: "barber" });
  assert.equal(result, false);
});
