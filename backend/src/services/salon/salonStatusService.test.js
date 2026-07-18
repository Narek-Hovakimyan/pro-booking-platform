import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import { getSalonStatusForBarber } from "./salonStatusService.js";

const originalMethods = {
  salonFind: Salon.find,
  salonFindById: Salon.findById,
  joinRequestFind: SalonJoinRequest.find,
  userFindById: User.findById,
};

const barberId = "64b000000000000000000010";
const salonAId = "64b000000000000000000011";
const salonBId = "64b000000000000000000012";
const pendingSalonId = "64b000000000000000000013";

afterEach(() => {
  Salon.find = originalMethods.salonFind;
  Salon.findById = originalMethods.salonFindById;
  SalonJoinRequest.find = originalMethods.joinRequestFind;
  User.findById = originalMethods.userFindById;
});

const createSalon = (overrides = {}) => ({
  _id: overrides._id || salonAId,
  name: overrides.name || "First Salon",
  ownerId: overrides.ownerId || "owner-id",
  admins: overrides.admins || [],
  ...overrides,
});

const createPendingRequest = (overrides = {}) => ({
  _id: "request-1",
  id: "request-1",
  salonId: createSalon({ _id: pendingSalonId, name: "Pending Salon" }),
  barberId,
  status: "pending",
  ...overrides,
});

const createJoinRequestQuery = (requests = [], onSort = () => {}) => {
  const query = {
    populate() {
      return query;
    },
    sort(sortQuery) {
      onSort(sortQuery);
      return Promise.resolve(requests);
    },
  };
  return query;
};

const publicSalon = (salon) => ({
  _id: salon._id,
  id: salon.id || salon._id,
  name: salon.name || "",
  city: salon.city || "",
  address: salon.address || "",
  phone: salon.phone || "",
  imageUrl: salon.imageUrl || salon.image || "",
  image: salon.image || salon.imageUrl || "",
});

const assertNoPrivateStatusFields = (value) => {
  const text = JSON.stringify(value);
  [
    "ownerId",
    "admins",
    "staffPayment",
    "payment",
    "chair",
    "decision",
    "decidedAt",
    "updatedAt",
    "createdAt",
    "relationshipType",
    "relationshipStatus",
    "worksAsSpecialist",
  ].forEach((field) => {
    assert.equal(text.includes(field), false, `${field} leaked`);
  });
};

const assertNoRequestIdentifierAliases = (pendingRequest) => {
  ["_id", "id", "requestId"].forEach((field) => {
    assert.equal(field in pendingRequest, false, `${field} leaked from pendingRequest`);
  });
};

const createFindMock = ({ approvedSalons = [], pendingSalons = [], managedSalons = [] }) => {
  const calls = [];

  Salon.find = (query) => {
    calls.push(query);

    if (query?._id?.$in?.includes(salonAId) || query?._id?.$in?.includes(salonBId)) {
      return approvedSalons;
    }

    if (query?._id?.$in?.includes(pendingSalonId)) {
      return pendingSalons;
    }

    if (query?.$or) {
      return {
        sort(sortQuery) {
          calls.push({ sort: sortQuery });
          return managedSalons;
        },
      };
    }

    return [];
  };

  return calls;
};

test("barber with approved salons gets same status shape", async () => {
  const joinedAt = new Date("2024-01-01T00:00:00.000Z");
  const defaultSchedule = {
    startTime: "10:00",
    endTime: "18:00",
    hasBreak: false,
    breakStart: "",
    breakEnd: "",
  };
  const firstSalon = createSalon({ _id: salonAId, name: "First Salon" });
  const secondSalon = createSalon({ _id: salonBId, name: "Second Salon" });
  const managedSalon = createSalon({ _id: "managed-1", name: "Managed Salon" });

  User.findById = async (id) => {
    assert.equal(id, barberId);
    return {
      _id: barberId,
      salon: null,
      salonStatus: "approved",
      salons: [
        {
          salon: salonAId,
          status: "approved",
          isPrimary: false,
          joinedAt,
          defaultSchedule,
        },
        {
          salon: salonBId,
          status: "approved",
          isPrimary: true,
          joinedAt,
        },
      ],
    };
  };
  createFindMock({
    approvedSalons: [firstSalon, secondSalon],
    managedSalons: [managedSalon],
  });
  SalonJoinRequest.find = () => createJoinRequestQuery();

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.salonStatus, "approved");
  assert.deepEqual(status.salon, publicSalon(secondSalon));
  assert.deepEqual(status.salons, [
    {
      ...publicSalon(firstSalon),
      status: "approved",
      isPrimary: false,
      joinedAt,
      defaultSchedule,
    },
    {
      ...publicSalon(secondSalon),
      status: "approved",
      isPrimary: true,
      joinedAt,
      defaultSchedule: {
        startTime: "09:00",
        endTime: "18:00",
        hasBreak: false,
        breakStart: "",
        breakEnd: "",
      },
    },
  ]);
  assert.deepEqual(status.pendingEntries, []);
  assert.equal(status.pendingRequest, null);
  assert.deepEqual(status.salonStates.map(({ salonId, status: state }) => ({ salonId, status: state })), [
    { salonId: salonAId, status: "accepted" },
    { salonId: salonBId, status: "accepted" },
  ]);
  assert.deepEqual(status.ownedSalons, [publicSalon(managedSalon)]);
  assert.deepEqual(status.managedSalons, [publicSalon(managedSalon)]);
});

test("pending requests and pending salon entries are serialized the same way", async () => {
  const joinedAt = new Date("2024-02-01T00:00:00.000Z");
  const pendingSalon = createSalon({ _id: pendingSalonId, name: "Pending Salon" });
  const pendingRequest = createPendingRequest({ salonId: pendingSalon });

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "pending",
    salons: [
      {
        salon: pendingSalonId,
        status: "pending",
        isPrimary: false,
        joinedAt,
      },
    ],
  });
  createFindMock({
    pendingSalons: [pendingSalon],
  });
  SalonJoinRequest.find = (query) => {
    assert.deepEqual(query, { barberId });
    return {
      populate() {
        return this;
      },
      sort() {
        return Promise.resolve([pendingRequest]);
      },
    };
  };

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.salonStatus, "pending");
  assert.equal(status.salon, null);
  assert.deepEqual(status.pendingEntries, [
    {
      ...publicSalon(pendingSalon),
      status: "pending",
      isPrimary: false,
      joinedAt,
    },
  ]);
  assert.deepEqual(status.pendingRequest, {
    status: "pending",
    salonName: "Pending Salon",
    salon: publicSalon(pendingSalon),
  });
  assertNoRequestIdentifierAliases(status.pendingRequest);
  assert.equal("requestId" in status.pendingEntries[0], false);
  assert.deepEqual(status.salonStates[0], {
    salonId: pendingSalonId,
    status: "pending",
    salon: publicSalon(pendingSalon),
  });
  assert.equal("requestId" in status.salonStates[0], false);
  assertNoPrivateStatusFields(status.salonStates);
});

const assertRequestState = async ({ requestStatus, canonicalStatus } = {}) => {
  const requestSalon = createSalon({ _id: pendingSalonId, name: "Request Salon" });
  const request = createPendingRequest({
    _id: `request-${requestStatus}`,
    salonId: requestSalon,
    status: requestStatus,
  });

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "none",
    salons: canonicalStatus
      ? [{ salon: pendingSalonId, status: canonicalStatus, isPrimary: false }]
      : [],
  });
  createFindMock({
    pendingSalons: canonicalStatus === "pending" ? [requestSalon] : [],
  });
  SalonJoinRequest.find = () => createJoinRequestQuery([request]);

  const status = await getSalonStatusForBarber(barberId);
  const state = status.salonStates.find((entry) => entry.salonId === pendingSalonId);

  assert.equal(state.status, requestStatus);
  assert.equal(status.salonStatus, requestStatus);
  if (requestStatus !== "pending") {
    assert.deepEqual(status.pendingEntries, []);
  }
};

test("latest rejected request is exposed as the authoritative salon state", async () => {
  await assertRequestState({ requestStatus: "rejected" });
});

test("latest cancelled request is exposed as the authoritative salon state", async () => {
  await assertRequestState({ requestStatus: "cancelled" });
});

test("latest closed request overrides stale canonical pending membership state", async () => {
  await assertRequestState({
    requestStatus: "cancelled",
    canonicalStatus: "pending",
  });
});

test("canonical approved membership wins over a contradictory latest request", async () => {
  const requestSalon = createSalon({ _id: salonAId, name: "Approved Salon" });
  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "none",
    salons: [
      { salon: salonAId, status: "pending", isPrimary: false },
      { salon: salonAId, status: "approved", isPrimary: true },
    ],
  });
  createFindMock({
    approvedSalons: [requestSalon],
  });
  SalonJoinRequest.find = () => createJoinRequestQuery([
    createPendingRequest({ salonId: requestSalon, status: "rejected" }),
  ]);

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.salonStates[0].status, "accepted");
  assert.equal(status.salonStatus, "approved");
  assert.equal(status.pendingRequest, null);
});

const assertHistoricalPendingDoesNotCreatePendingRequest = async (latestStatus) => {
  const requestSalon = createSalon({ _id: pendingSalonId, name: "Closed Salon" });

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "none",
    salons: [],
  });
  createFindMock({ managedSalons: [] });
  SalonJoinRequest.find = () =>
    createJoinRequestQuery([
      createPendingRequest({
        _id: `request-${latestStatus}`,
        id: `request-${latestStatus}`,
        salonId: requestSalon,
        status: latestStatus,
        updatedAt: new Date("2026-07-18T11:00:00.000Z"),
        createdAt: new Date("2026-07-18T11:00:00.000Z"),
      }),
      createPendingRequest({
        _id: "request-old-pending",
        id: "request-old-pending",
        salonId: requestSalon,
        status: "pending",
        updatedAt: new Date("2026-07-18T10:00:00.000Z"),
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      }),
    ]);

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.pendingRequest, null);
  assert.deepEqual(status.pendingEntries, []);
  assert.equal(status.salonStates[0].status, latestStatus);
};

test("older pending request is not exposed when latest same-salon request is cancelled", async () => {
  await assertHistoricalPendingDoesNotCreatePendingRequest("cancelled");
});

test("older pending request is not exposed when latest same-salon request is rejected", async () => {
  await assertHistoricalPendingDoesNotCreatePendingRequest("rejected");
});

test("stale pending request is not exposed when canonical membership is accepted", async () => {
  const approvedSalon = createSalon({ _id: salonAId, name: "Approved Salon" });

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "none",
    salons: [{ salon: salonAId, status: "approved", isPrimary: true }],
  });
  createFindMock({
    approvedSalons: [approvedSalon],
  });
  SalonJoinRequest.find = () =>
    createJoinRequestQuery([
      createPendingRequest({
        _id: "request-old-pending",
        id: "request-old-pending",
        salonId: approvedSalon,
        status: "pending",
      }),
    ]);

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.pendingRequest, null);
  assert.deepEqual(status.pendingEntries, []);
  assert.equal(status.salonStates[0].status, "accepted");
});

test("singular pendingRequest selects the first authoritative pending request deterministically", async () => {
  const firstSalon = createSalon({ _id: salonAId, name: "First Pending Salon" });
  const secondSalon = createSalon({ _id: salonBId, name: "Second Pending Salon" });
  let sortQuery = null;

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "none",
    salons: [],
  });
  createFindMock({ managedSalons: [] });
  SalonJoinRequest.find = () =>
    createJoinRequestQuery(
      [
        createPendingRequest({
          _id: "request-z",
          id: "request-z",
          salonId: secondSalon,
          status: "pending",
          updatedAt: new Date("2026-07-18T10:00:00.000Z"),
          createdAt: new Date("2026-07-18T10:00:00.000Z"),
        }),
        createPendingRequest({
          _id: "request-a",
          id: "request-a",
          salonId: firstSalon,
          status: "pending",
          updatedAt: new Date("2026-07-18T10:00:00.000Z"),
          createdAt: new Date("2026-07-18T10:00:00.000Z"),
        }),
      ],
      (query) => {
        sortQuery = query;
      }
    );

  const status = await getSalonStatusForBarber(barberId);

  assert.deepEqual(sortQuery, { updatedAt: -1, createdAt: -1, _id: -1 });
  assert.deepEqual(status.pendingRequest, {
    status: "pending",
    salonName: "Second Pending Salon",
    salon: publicSalon(secondSalon),
  });
  assertNoPrivateStatusFields(status.pendingRequest);
  assertNoRequestIdentifierAliases(status.pendingRequest);
});

test("legacy approved salon fallback is preserved", async () => {
  const legacySalon = createSalon({ _id: salonAId, name: "Legacy Salon" });

  User.findById = async () => ({
    _id: barberId,
    salon: salonAId,
    salonStatus: "approved",
    salons: [],
  });
  createFindMock({ managedSalons: [] });
  Salon.findById = async (id) => {
    assert.equal(id, salonAId);
    return legacySalon;
  };
  SalonJoinRequest.find = () => createJoinRequestQuery();

  const status = await getSalonStatusForBarber(barberId);

  assert.deepEqual(status.salon, publicSalon(legacySalon));
  assert.deepEqual(status.salons, []);
  assert.equal(status.salonStates[0].status, "accepted");
});

test("canonical pending entry wins over contradictory legacy approved salon", async () => {
  User.findById = async () => ({
    _id: barberId,
    salon: salonAId,
    salonStatus: "approved",
    salons: [{ salon: salonAId, status: "pending", isPrimary: false }],
  });
  createFindMock({
    pendingSalons: [createSalon({ _id: salonAId, name: "Canonical Pending" })],
  });
  Salon.findById = () => {
    throw new Error("legacy salon should not be loaded over canonical pending");
  };
  SalonJoinRequest.find = () => createJoinRequestQuery();

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.salonStatus, "pending");
  assert.equal(status.salon, null);
  assert.deepEqual(status.salons, []);
  assert.equal(status.salonStates[0].status, "pending");
});

test("canonical rejected entry wins over contradictory legacy approved salon", async () => {
  User.findById = async () => ({
    _id: barberId,
    salon: salonAId,
    salonStatus: "approved",
    salons: [{ salon: salonAId, status: "rejected", isPrimary: false }],
  });
  createFindMock({ managedSalons: [] });
  Salon.findById = () => {
    throw new Error("legacy salon should not be loaded over canonical rejected");
  };
  SalonJoinRequest.find = () => createJoinRequestQuery();

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.salonStatus, "rejected");
  assert.equal(status.salon, null);
  assert.deepEqual(status.salons, []);
  assert.equal(status.salonStates[0].status, "rejected");
});

test("latest request ordering includes _id as deterministic tie breaker", async () => {
  const requestSalon = createSalon({ _id: pendingSalonId, name: "Tie Salon" });
  let sortQuery = null;

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "none",
    salons: [],
  });
  createFindMock({ managedSalons: [] });
  SalonJoinRequest.find = () =>
    createJoinRequestQuery(
      [
        createPendingRequest({
          _id: "request-z",
          id: "request-z",
          salonId: requestSalon,
          status: "cancelled",
          updatedAt: new Date("2026-07-18T10:00:00.000Z"),
          createdAt: new Date("2026-07-18T10:00:00.000Z"),
        }),
        createPendingRequest({
          _id: "request-a",
          id: "request-a",
          salonId: requestSalon,
          status: "pending",
          updatedAt: new Date("2026-07-18T10:00:00.000Z"),
          createdAt: new Date("2026-07-18T10:00:00.000Z"),
        }),
      ],
      (query) => {
        sortQuery = query;
      }
    );

  const status = await getSalonStatusForBarber(barberId);

  assert.deepEqual(sortQuery, { updatedAt: -1, createdAt: -1, _id: -1 });
  assert.equal(status.salonStates[0].status, "cancelled");
});

test("join request histories are isolated per salon", async () => {
  const firstSalon = createSalon({ _id: salonAId, name: "First Salon" });
  const secondSalon = createSalon({ _id: salonBId, name: "Second Salon" });

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "none",
    salons: [],
  });
  createFindMock({ managedSalons: [] });
  SalonJoinRequest.find = () =>
    createJoinRequestQuery([
      createPendingRequest({
        _id: "request-a2",
        salonId: firstSalon,
        status: "rejected",
      }),
      createPendingRequest({
        _id: "request-b1",
        salonId: secondSalon,
        status: "cancelled",
      }),
      createPendingRequest({
        _id: "request-a1",
        salonId: firstSalon,
        status: "pending",
      }),
    ]);

  const status = await getSalonStatusForBarber(barberId);
  const statesBySalonId = new Map(
    status.salonStates.map((entry) => [entry.salonId, entry.status])
  );

  assert.equal(statesBySalonId.get(salonAId), "rejected");
  assert.equal(statesBySalonId.get(salonBId), "cancelled");
});

test("status response compatibility fields use privacy-safe serialization", async () => {
  const approvedSalon = createSalon({
    _id: salonAId,
    name: "Approved Private Salon",
    ownerId: "private-owner",
    admins: ["private-admin"],
    paymentProviderAccountId: "acct_private",
    staffPayment: { enabled: true },
  });
  const pendingSalon = createSalon({
    _id: pendingSalonId,
    name: "Pending Private Salon",
    ownerId: "pending-owner",
    admins: ["pending-admin"],
    chairRental: { amount: 100 },
  });
  const managedSalon = createSalon({
    _id: "managed-private",
    name: "Managed Private Salon",
    ownerId: barberId,
    admins: ["managed-admin"],
    staffPayment: { enabled: true },
  });

  User.findById = async () => ({
    _id: barberId,
    salon: null,
    salonStatus: "approved",
    salons: [
      {
        salon: salonAId,
        status: "approved",
        isPrimary: true,
        relationshipType: "chair_renter",
        relationshipStatus: "pending",
        worksAsSpecialist: false,
        staffPayment: { enabled: true },
      },
      {
        salon: pendingSalonId,
        status: "pending",
        isPrimary: false,
        relationshipType: "chair_renter",
        relationshipStatus: "pending",
      },
    ],
  });
  createFindMock({
    approvedSalons: [approvedSalon],
    pendingSalons: [pendingSalon],
    managedSalons: [managedSalon],
  });
  SalonJoinRequest.find = () =>
    createJoinRequestQuery([
      createPendingRequest({
        salonId: pendingSalon,
        status: "pending",
        decidedAt: new Date("2026-07-18T10:00:00.000Z"),
        decisionMetadata: { note: "private" },
        updatedAt: new Date("2026-07-18T10:00:00.000Z"),
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      }),
    ]);

  const status = await getSalonStatusForBarber(barberId);

  assertNoPrivateStatusFields(status.salonStates);
  assertNoPrivateStatusFields(status.salon);
  assertNoPrivateStatusFields(status.ownedSalons);
  assertNoPrivateStatusFields(status.managedSalons);
  assertNoPrivateStatusFields(status.pendingRequest);
  assertNoRequestIdentifierAliases(status.pendingRequest);
  assert.equal("requestId" in status.salonStates[0], false);
  assert.equal("requestId" in status.salonStates[1], false);
  assert.equal("requestId" in status.pendingEntries[0], false);
  assert.equal("staffPayment" in status.salons[0], false);
  assert.equal("relationshipType" in status.salons[0], false);
  assert.equal("worksAsSpecialist" in status.salons[0], false);
  assert.equal("chairRental" in status.pendingEntries[0], false);
});

test("missing barber preserves empty status response", async () => {
  User.findById = async () => null;
  createFindMock({ managedSalons: [] });
  SalonJoinRequest.find = () => createJoinRequestQuery();

  const status = await getSalonStatusForBarber(barberId);

  assert.deepEqual(status, {
    salonStatus: "none",
    salon: null,
    salons: [],
    pendingEntries: [],
    pendingRequest: null,
    salonStates: [],
    ownedSalons: [],
    managedSalons: [],
  });
});
