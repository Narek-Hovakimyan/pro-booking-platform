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
  salonId: createSalon({ _id: pendingSalonId, name: "Pending Salon" }),
  barberId,
  status: "pending",
  ...overrides,
});

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
  SalonJoinRequest.find = () => ({
    populate: async () => [],
  });

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.salonStatus, "approved");
  assert.deepEqual(status.salon, { ...secondSalon, id: salonBId });
  assert.deepEqual(status.salons, [
    {
      ...firstSalon,
      id: salonAId,
      status: "approved",
      isPrimary: false,
      joinedAt,
      defaultSchedule,
      relationshipType: "staff",
      relationshipStatus: "accepted",
      relationshipRequestedBy: null,
      relationshipRequestedAt: null,
      relationshipRespondedAt: null,
    },
    {
      ...secondSalon,
      id: salonBId,
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
      relationshipType: "staff",
      relationshipStatus: "accepted",
      relationshipRequestedBy: null,
      relationshipRequestedAt: null,
      relationshipRespondedAt: null,
    },
  ]);
  assert.deepEqual(status.pendingEntries, []);
  assert.equal(status.pendingRequest, null);
  assert.deepEqual(status.ownedSalons, [{ ...managedSalon, id: "managed-1" }]);
  assert.deepEqual(status.managedSalons, [{ ...managedSalon, id: "managed-1" }]);
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
    assert.deepEqual(query, { barberId, status: "pending" });
    return {
      populate: async (path) => {
        assert.equal(path, "salonId");
        return [pendingRequest];
      },
    };
  };

  const status = await getSalonStatusForBarber(barberId);

  assert.equal(status.salonStatus, "pending");
  assert.equal(status.salon, null);
  assert.deepEqual(status.pendingEntries, [
    {
      ...pendingSalon,
      id: pendingSalonId,
      status: "pending",
      isPrimary: false,
      joinedAt,
      requestId: "request-1",
    },
  ]);
  assert.deepEqual(status.pendingRequest, {
    ...pendingRequest,
    id: "request-1",
    salon: { ...pendingSalon, id: pendingSalonId },
  });
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
  SalonJoinRequest.find = () => ({
    populate: async () => [],
  });

  const status = await getSalonStatusForBarber(barberId);

  assert.deepEqual(status.salon, { ...legacySalon, id: salonAId });
  assert.deepEqual(status.salons, []);
});

test("missing barber preserves empty status response", async () => {
  User.findById = async () => null;
  createFindMock({ managedSalons: [] });
  SalonJoinRequest.find = () => ({
    populate: async () => [],
  });

  const status = await getSalonStatusForBarber(barberId);

  assert.deepEqual(status, {
    salonStatus: "none",
    salon: null,
    salons: [],
    pendingEntries: [],
    pendingRequest: null,
    ownedSalons: [],
    managedSalons: [],
  });
});
