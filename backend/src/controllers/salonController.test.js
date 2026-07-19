import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createSalon, getSalonProfile, listManageableSalons, listSalons, updateSalonDefaultSchedule, __salonControllerTestHooks } from "./salons/salonController.js";
import { getSalonStaff } from "./salons/salonStaffController.js";
import BarberProfile from "../models/BarberProfile.js";
import Schedule from "../models/Schedule.js";
import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { explicitAllDaysOffMarker } from "../utils/scheduleUtils.js";

const originalMethods = {
  barberProfileFind: BarberProfile.find,
  scheduleFind: Schedule.find,
  scheduleFindOneAndUpdate: Schedule.findOneAndUpdate,
  serviceFind: Service.find,
  salonCreate: Salon.create,
  salonFind: Salon.find,
  salonFindById: Salon.findById,
  joinRequestFind: SalonJoinRequest.find,
  userFind: User.find,
  userFindById: User.findById,
  userFindOneAndUpdate: User.findOneAndUpdate,
};

const barberId = "64b000000000000000000010";
const salonAId = "64b000000000000000000011";
const salonBId = "64b000000000000000000012";

const ownerId = "64b000000000000000000020";
const adminId = "64b000000000000000000021";
const approvedMemberId = "64b000000000000000000022";
const unrelatedBarberId = "64b000000000000000000023";
const clientId = "64b000000000000000000024";
const staffUserId = "64b000000000000000000030";

const completedSalonOnboarding = {
  version: 1,
  status: "completed",
  currentStep: null,
  workplace: "salon",
  completedAt: new Date("2026-07-16T10:00:00.000Z"),
};

afterEach(() => {
  BarberProfile.find = originalMethods.barberProfileFind;
  Schedule.find = originalMethods.scheduleFind;
  Schedule.findOneAndUpdate = originalMethods.scheduleFindOneAndUpdate;
  Service.find = originalMethods.serviceFind;
  Salon.create = originalMethods.salonCreate;
  Salon.find = originalMethods.salonFind;
  Salon.findById = originalMethods.salonFindById;
  SalonJoinRequest.find = originalMethods.joinRequestFind;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
  User.findOneAndUpdate = originalMethods.userFindOneAndUpdate;
  __salonControllerTestHooks.resetGetPaidAccessByBarberIds();
  __salonControllerTestHooks.resetGetPublicBarberReadinessByIds();
  __salonControllerTestHooks.resetGetSalonReviewStats();
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

const selectedDefaultSchedule = {
  startTime: "10:30",
  endTime: "18:00",
  hasBreak: true,
  breakStart: "14:00",
  breakEnd: "15:00",
};
const allDaysOffWeeklySchedule = {
  sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  tue: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  wed: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  thu: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  fri: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
};

test("listManageableSalons returns only owner/admin salons, not approved memberships", async () => {
  const res = createResponse();
  const foundQueries = [];

  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      salon: null,
      salonStatus: "none",
      salons: [
        { salon: salonAId, status: "approved" },
        { salon: salonBId, status: "approved" },
      ],
    }),
  });

  SalonJoinRequest.find = () => {
    throw new Error("should not query join requests for manageable");
  };

  Salon.find = (query) => {
    foundQueries.push(query);

    // Barber is not owner/admin of either salon, so return empty
    return {
      sort: async () => [],
    };
  };

  await listManageableSalons(
    { user: { _id: barberId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  // Approved membership alone does NOT grant management access
  assert.equal(res.body.length, 0);
  // Query uses owner/admin only, no membership $in clause
  assert.deepEqual(foundQueries[0], {
    $or: [
      { ownerId: barberId },
      { admins: barberId },
    ],
  });
});

test("createSalon lets an owner create a second salon without changing primary legacy fields", async () => {
  const createdSalons = [];
  const savedUsers = [];
  const user = {
    _id: ownerId,
    role: "barber",
    salon: null,
    salonStatus: "none",
    salons: [],
    workHistory: [],
    save: async () => {
      savedUsers.push({
        salon: user.salon,
        salonStatus: user.salonStatus,
        salons: user.salons.map((entry) => ({ ...entry })),
      });
      return user;
    },
  };

  Salon.create = async (payload) => {
    const salon = {
      _id: createdSalons.length === 0 ? salonAId : salonBId,
      ...payload,
    };
    createdSalons.push(salon);
    return salon;
  };
  User.findById = async () => user;

  const firstRes = createResponse();
  await createSalon(
    {
      user: { _id: ownerId, role: "barber" },
      body: { name: "First Salon" },
    },
    firstRes
  );

  const secondRes = createResponse();
  await createSalon(
    {
      user: { _id: ownerId, role: "barber" },
      body: { name: "Second Salon" },
    },
    secondRes
  );

  assert.equal(firstRes.statusCode, 201);
  assert.equal(secondRes.statusCode, 201);
  assert.equal(user.salons.length, 2);
  assert.deepEqual(
    user.salons.map((entry) => String(entry.salon)),
    [salonAId, salonBId]
  );
  assert.equal(user.salons[0].isPrimary, true);
  assert.equal(user.salons[1].isPrimary, false);
  assert.equal(user.salons[0].worksAsSpecialist, true);
  assert.equal(user.salons[1].worksAsSpecialist, true);
  assert.equal(user.salons[0].relationshipType, "staff");
  assert.equal(user.salons[0].relationshipStatus, "accepted");
  assert.equal(String(user.salon), salonAId);
  assert.equal(user.salonStatus, "approved");
  assert.equal(new Set(user.salons.map((entry) => String(entry.salon))).size, 2);
  assert.equal(savedUsers.length, 2);

  const manageableRes = createResponse();
  let manageableQuery = null;
  Salon.find = (query) => {
    manageableQuery = query;
    return { sort: async () => createdSalons };
  };

  await listManageableSalons(
    { user: { _id: ownerId, role: "barber" } },
    manageableRes
  );

  assert.equal(manageableRes.statusCode, 200);
  assert.deepEqual(manageableQuery, {
    $or: [{ ownerId }, { admins: ownerId }],
  });
  assert.deepEqual(
    manageableRes.body.map((salon) => String(salon.id || salon._id)),
    [salonAId, salonBId]
  );
});

test("createSalon can keep owner out of working specialist membership", async () => {
  const user = {
    _id: ownerId,
    role: "barber",
    salon: null,
    salonStatus: "none",
    salons: [],
    workHistory: [],
    save: async () => user,
  };

  Salon.create = async (payload) => ({ _id: salonAId, ...payload });
  User.findById = async () => user;

  const res = createResponse();
  await createSalon(
    {
      user: { _id: ownerId, role: "barber" },
      body: {
        name: "Owner Only Salon",
        ownerWorksAsSpecialist: false,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(String(res.body.salon.ownerId), ownerId);
  assert.equal(user.salons.length, 1);
  assert.equal(user.salons[0].relationshipType, "staff");
  assert.equal(user.salons[0].relationshipStatus, "accepted");
  assert.equal(user.salons[0].worksAsSpecialist, false);
  assert.equal(user.workHistory.length, 0);

  const manageableRes = createResponse();
  Salon.find = (query) => {
    assert.deepEqual(query, {
      $or: [{ ownerId }, { admins: ownerId }],
    });
    return { sort: async () => [{ _id: salonAId, ownerId, admins: [] }] };
  };

  await listManageableSalons(
    { user: { _id: ownerId, role: "barber" } },
    manageableRes
  );

  assert.equal(manageableRes.statusCode, 200);
  assert.equal(manageableRes.body.length, 1);
});

test("updateSalonDefaultSchedule creates salon-specific schedule document", async () => {
  const res = createResponse();
  let scheduleQuery = null;
  let schedulePayload = null;
  let scheduleOptions = null;

  User.findOneAndUpdate = async (query, update, options) => {
    assert.deepEqual(query, { _id: barberId, "salons.salon": salonAId });
    assert.deepEqual(update.$set["salons.$.defaultSchedule"], selectedDefaultSchedule);
    assert.deepEqual(options, { returnDocument: "after" });

    return {
      _id: barberId,
      salons: [
        {
          salon: {
            toString: () => salonAId,
          },
          defaultSchedule: selectedDefaultSchedule,
        },
      ],
    };
  };

  Schedule.findOneAndUpdate = async (query, payload, options) => {
    scheduleQuery = query;
    schedulePayload = payload;
    scheduleOptions = options;

    return { _id: "schedule-a", ...payload };
  };

  await updateSalonDefaultSchedule(
    {
      user: { _id: barberId, role: "barber" },
      params: { salonId: salonAId },
      body: selectedDefaultSchedule,
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(scheduleQuery, { barberId, salonId: salonAId });
  assert.deepEqual(schedulePayload, {
    $set: {
      defaultSchedule: selectedDefaultSchedule,
    },
    $setOnInsert: {
      barberId,
      salonId: salonAId,
    },
  });
  assert.deepEqual(scheduleOptions, {
    returnDocument: "after",
    runValidators: true,
    upsert: true,
  });
  assert.deepEqual(res.body.defaultSchedule, selectedDefaultSchedule);
});

test("updateSalonDefaultSchedule saves Sunday as a weekly day off", async () => {
  const res = createResponse();
  let schedulePayload = null;
  const weeklySchedule = {
    sun: { working: false },
  };
  const sanitizedWeeklySchedule = {
    sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  };

  User.findOneAndUpdate = async () => ({
    _id: barberId,
    salons: [
      {
        salon: {
          toString: () => salonAId,
        },
        defaultSchedule: selectedDefaultSchedule,
      },
    ],
  });

  Schedule.findOneAndUpdate = async (query, payload) => {
    assert.deepEqual(query, { barberId, salonId: salonAId });
    schedulePayload = payload;

    return {
      _id: "schedule-a",
      weeklySchedule: sanitizedWeeklySchedule,
    };
  };

  await updateSalonDefaultSchedule(
    {
      user: { _id: barberId, role: "barber" },
      params: { salonId: salonAId },
      body: {
        ...selectedDefaultSchedule,
        weeklySchedule,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(schedulePayload.$set.weeklySchedule, sanitizedWeeklySchedule);
  assert.deepEqual(res.body.defaultSchedule, selectedDefaultSchedule);
  assert.deepEqual(res.body.weeklySchedule, sanitizedWeeklySchedule);
});

test("updateSalonDefaultSchedule preserves explicit all-days-off weekly schedule", async () => {
  const res = createResponse();
  let schedulePayload = null;
  const sanitizedWeeklySchedule = {
    ...allDaysOffWeeklySchedule,
    [explicitAllDaysOffMarker]: true,
  };

  User.findOneAndUpdate = async () => ({
    _id: barberId,
    salons: [
      {
        salon: {
          toString: () => salonAId,
        },
        defaultSchedule: selectedDefaultSchedule,
      },
    ],
  });

  Schedule.findOneAndUpdate = async (query, payload) => {
    assert.deepEqual(query, { barberId, salonId: salonAId });
    schedulePayload = payload;

    return {
      _id: "schedule-a",
      weeklySchedule: sanitizedWeeklySchedule,
    };
  };

  await updateSalonDefaultSchedule(
    {
      user: { _id: barberId, role: "barber" },
      params: { salonId: salonAId },
      body: {
        ...selectedDefaultSchedule,
        weeklySchedule: allDaysOffWeeklySchedule,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(schedulePayload.$set.weeklySchedule, sanitizedWeeklySchedule);
  assert.deepEqual(res.body.weeklySchedule, sanitizedWeeklySchedule);
});

// ─── Salon staff tests ───────────────────────────────────────────────

/**
 * Helper: set up mocks for the salon, requester, staff users, and barber profiles.
 * `requesterOverrides` is merged into the requester user object.
 * `staffOverrides` is merged into the staff user object.
 */
const setupStaffMocks = ({
  requesterOverrides = {},
  salonAdmins = [],
  salonOwnerId = ownerId,
  staffPhone = "+374111111",
  staffEmail = "staff@example.com",
  staffUserOverrides = {},
  includeProfile = true,
} = {}) => {
  Salon.findById = async () => ({
    _id: salonAId,
    ownerId: salonOwnerId,
    admins: salonAdmins,
  });

  User.findById = (id) => {
    const idStr = String(id);
    if (idStr === String(clientId)) {
      return {
        _id: clientId,
        role: "client",
        salons: [],
        salonStatus: "none",
      };
    }

    // Default requester
    return {
      _id: id,
      role: "barber",
      salons: [{ salon: salonAId, status: "approved" }],
      salonStatus: "approved",
      salon: salonAId,
      ...requesterOverrides,
    };
  };

  User.find = (query) => {
    assert.ok(query.role === "barber");
    assert.ok(Array.isArray(query.$or));
    return {
      select: async () => [
        {
          _id: staffUserId,
          name: "Staff Barber",
          avatarUrl: "staff-avatar.jpg",
          specialty: "unisex",
          city: "Yerevan",
          role: "barber",
          salons: [{ salon: salonAId, status: "approved" }],
          salon: salonAId,
          salonStatus: "approved",
          phone: staffPhone,
          email: staffEmail,
          password: "secret-hash",
          workHistory: [],
          ...staffUserOverrides,
        },
      ],
    };
  };


  BarberProfile.find = async () => {
    if (!includeProfile) return [];
    return [
      {
        barberId: staffUserId,
        imageUrl: "profile-image.jpg",
        bio: "Expert barber",
        city: "Yerevan",
      },
    ];
  };
};

test("getSalonStaff — approved member can view staff", async () => {
  const res = createResponse();

  setupStaffMocks();

  await getSalonStaff(
    { user: { _id: approvedMemberId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, staffUserId);
  assert.equal(res.body[0].name, "Staff Barber");
  assert.equal(res.body[0].roleInSalon, "staff");
});

test("getSalonStaff — owner can view staff", async () => {
  const res = createResponse();

  setupStaffMocks({ requesterOverrides: { _id: ownerId } });

  await getSalonStaff(
    { user: { _id: ownerId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test("getSalonStaff — excludes owner membership with worksAsSpecialist false", async () => {
  const res = createResponse();

  setupStaffMocks({
    requesterOverrides: { _id: ownerId },
    staffUserOverrides: {
      _id: ownerId,
      salons: [
        {
          salon: salonAId,
          status: "approved",
          relationshipType: "staff",
          relationshipStatus: "accepted",
          worksAsSpecialist: false,
        },
      ],
    },
  });

  await getSalonStaff(
    { user: { _id: ownerId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("getSalonStaff — admin can view staff", async () => {
  const res = createResponse();

  setupStaffMocks({
    requesterOverrides: { _id: adminId },
    salonAdmins: [adminId],
  });

  await getSalonStaff(
    { user: { _id: adminId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test("getSalonStaff — client gets 403", async () => {
  const res = createResponse();

  setupStaffMocks();

  await getSalonStaff(
    { user: { _id: clientId, role: "client" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only barbers can view salon staff");
});

test("getSalonStaff — unrelated barber gets 403", async () => {
  const res = createResponse();

  setupStaffMocks({
    requesterOverrides: {
      _id: unrelatedBarberId,
      salons: [],
      salon: null,
      salonStatus: "none",
    },
  });

  await getSalonStaff(
    { user: { _id: unrelatedBarberId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "You are not a member of this salon");
});

test("getSalonStaff — missing salon returns 404", async () => {
  const res = createResponse();

  Salon.findById = async () => null;
  User.findById = () => ({ _id: approvedMemberId, role: "barber" });

  await getSalonStaff(
    { user: { _id: approvedMemberId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Salon not found");
});

test("getSalonStaff — response excludes private fields", async () => {
  const res = createResponse();

  setupStaffMocks();

  await getSalonStaff(
    { user: { _id: approvedMemberId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  const staff = res.body[0];
  assert.equal(staff.phone, undefined);
  assert.equal(staff.email, undefined);
  assert.equal(staff.password, undefined);
  assert.equal(staff.workHistory, undefined);

  // Allowed fields present
  assert.ok(staff.id);
  assert.ok(staff.name);
  assert.ok(staff.avatarUrl);
  assert.ok(staff.imageUrl);
  assert.ok(staff.specialty);
  assert.ok(staff.city);
  assert.ok(staff.bio);
  assert.ok(staff.roleInSalon);
  assert.equal(staff.relationshipType, "staff");
});

test("getSalonStaff — only approved barbers returned", async () => {
  const res = createResponse();

  // Staff user has pending status - should not be returned by the query
  Salon.findById = async () => ({
    _id: salonAId,
    ownerId,
    admins: [],
  });

  User.findById = () => ({
    _id: approvedMemberId,
    role: "barber",
    salons: [{ salon: salonAId, status: "approved" }],
    salonStatus: "approved",
    salon: salonAId,
  });

  // Only return staff that are approved
  User.find = () => ({
    select: async () => [],
  });

  BarberProfile.find = async () => [];


  await getSalonStaff(
    { user: { _id: approvedMemberId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("getSalonStaff — legacy approved salon member also has access", async () => {
  const res = createResponse();

  Salon.findById = async () => ({
    _id: salonAId,
    ownerId,
    admins: [],
  });

  User.findById = () => ({
    _id: approvedMemberId,
    role: "barber",
    salons: [],
    salonStatus: "approved",
    salon: salonAId,
  });

  User.find = () => ({
    select: async () => [
      {
        _id: staffUserId,
        name: "Legacy Staff",
        avatarUrl: "",
        specialty: "unisex",
        city: "",
        role: "barber",
        salons: [],
        salon: salonAId,
        salonStatus: "approved",
      },
    ],
  });


  BarberProfile.find = async () => [];

  await getSalonStaff(
    { user: { _id: approvedMemberId, role: "barber" }, params: { salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, "Legacy Staff");
});

// ── ReDoS prevention: salon search ──

test("listSalons search with regex metacharacters treats them as literal text", async () => {
  const res = createResponse();
  let capturedQuery;

  Salon.find = (query) => {
    capturedQuery = query;
    return { sort: async () => [] };
  };
  SalonJoinRequest.find = () => ({ distinct: async () => [] });
  User.find = () => ({ select: async () => [] });
  BarberProfile.find = async () => [];

  await listSalons(
    { query: { search: ".*+" } },
    res
  );

  assert.equal(res.statusCode, 200);
  const regexPattern = capturedQuery.$or[0].name.$regex;
  assert.equal(regexPattern, "\\.\\*\\+", "regex metacharacters are escaped");
});

test("listSalons search longer than 100 chars returns 400", async () => {
  const res = createResponse();
  const longSearch = "a".repeat(101);

  await listSalons(
    { query: { search: longSearch } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Search term is too long");
});

test("listSalons empty/whitespace search does not add search filter and still succeeds", async () => {
  const res = createResponse();
  let capturedQuery;

  Salon.find = (query) => {
    capturedQuery = query;
    return { sort: async () => [] };
  };
  SalonJoinRequest.find = () => ({ distinct: async () => [] });
  User.find = () => ({ select: async () => [] });
  BarberProfile.find = async () => [];

  await listSalons(
    { query: { search: "   " } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(capturedQuery.$or, undefined, "no $or filter for whitespace-only search");
});

test("listSalons rejects unauthenticated excludeForBarber filtering", async () => {
  const res = createResponse();

  await listSalons(
    { query: { excludeForBarber: barberId } },
    res
  );

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Authentication required");
});

test("listSalons applies authenticated self-scoped excludeForBarber filtering", async () => {
  const res = createResponse();
  const ownedSalonId = "64b000000000000000000031";
  const pendingRequestSalonId = "64b000000000000000000032";
  let capturedQuery;

  User.findById = async (id) => {
    assert.equal(String(id), barberId);
    return {
      _id: barberId,
      salons: [{ salon: salonAId, status: "approved" }],
    };
  };
  Salon.find = (query) => {
    if (query?.$or) {
      assert.deepEqual(query.$or, [{ ownerId: barberId }, { admins: barberId }]);
      return { distinct: async () => [ownedSalonId] };
    }
    capturedQuery = query;
    return { sort: async () => [] };
  };
  SalonJoinRequest.find = (query) => {
    assert.deepEqual(query, { barberId, status: "pending" });
    return { distinct: async () => [pendingRequestSalonId] };
  };
  User.find = () => ({ select: async () => [] });
  BarberProfile.find = async () => [];

  await listSalons(
    {
      user: { _id: barberId, role: "barber" },
      query: { excludeForBarber: barberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedQuery._id.$nin.map(String).sort(), [
    salonAId,
    ownedSalonId,
    pendingRequestSalonId,
  ].sort());
});

test("listSalons keeps rejected and cancelled salons selectable", async () => {
  const res = createResponse();
  const approvedSalonId = "64b000000000000000000041";
  const ownerSalonId = "64b000000000000000000042";
  const activePendingSalonId = "64b000000000000000000043";
  const rejectedSalonId = "64b000000000000000000044";
  const cancelledSalonId = "64b000000000000000000045";
  const salons = [
    approvedSalonId,
    ownerSalonId,
    activePendingSalonId,
    rejectedSalonId,
    cancelledSalonId,
  ].map((id) => ({
    _id: id,
    name: id,
    city: "Yerevan",
    address: "Public address",
    phone: "Public phone",
    imageUrl: "https://example.test/salon.jpg",
    ownerId: barberId,
    admins: [ownerId],
    staffPayment: { enabled: true },
  }));
  let capturedQuery;

  User.findById = async (id) => {
    assert.equal(String(id), barberId);
    return {
      _id: barberId,
      salons: [
        { salon: approvedSalonId, status: "approved" },
        { salon: activePendingSalonId, status: "pending" },
        { salon: rejectedSalonId, status: "pending" },
        { salon: cancelledSalonId, status: "pending" },
      ],
    };
  };
  Salon.find = (query) => {
    if (query?.$or) {
      assert.deepEqual(query.$or, [{ ownerId: barberId }, { admins: barberId }]);
      return { distinct: async () => [ownerSalonId] };
    }
    capturedQuery = query;
    return { sort: async () => salons };
  };
  SalonJoinRequest.find = (query) => {
    assert.deepEqual(query, { barberId, status: "pending" });
    return { distinct: async () => [activePendingSalonId] };
  };
  User.find = () => ({ select: async () => [] });
  BarberProfile.find = async () => [];
  __salonControllerTestHooks.setGetPaidAccessByBarberIds(async () => new Map());
  __salonControllerTestHooks.setGetPublicBarberReadinessByIds(async () => new Map());
  __salonControllerTestHooks.setGetSalonReviewStats(async () => new Map());

  await listSalons({
    user: { _id: barberId, role: "barber" },
    query: { excludeForBarber: barberId },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedQuery._id.$nin.map(String).sort(), [
    approvedSalonId,
    ownerSalonId,
    activePendingSalonId,
  ].sort());
  assert.deepEqual(Object.keys(res.body[0]).sort(), [
    "_id",
    "address",
    "averageRating",
    "barbers",
    "city",
    "id",
    "image",
    "imageUrl",
    "latestReviews",
    "name",
    "phone",
    "reviewsCount",
    "totalReviews",
  ].sort());
  assert.equal(res.body[0].ownerId, undefined);
  assert.equal(res.body[0].admins, undefined);
  assert.equal(res.body[0].staffPayment, undefined);
});

test("listSalons rejects authenticated foreign excludeForBarber filtering", async () => {
  const res = createResponse();

  User.findById = () => {
    throw new Error("foreign excludeForBarber should stop before barber lookup");
  };

  await listSalons(
    {
      user: { _id: barberId, role: "barber" },
      query: { excludeForBarber: unrelatedBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "You can only filter your own salons");
});

test("listSalons malicious pattern is escaped, not passed raw", async () => {
  const res = createResponse();
  let capturedQuery;

  Salon.find = (query) => {
    capturedQuery = query;
    return { sort: async () => [] };
  };
  SalonJoinRequest.find = () => ({ distinct: async () => [] });
  User.find = () => ({ select: async () => [] });
  BarberProfile.find = async () => [];

  await listSalons(
    { query: { search: "(a+)+aaaaaaaaab" } },
    res
  );

  assert.equal(res.statusCode, 200);
  const regexPattern = capturedQuery.$or[0].name.$regex;
  assert.ok(regexPattern.includes("\\("), "parentheses are escaped");
  assert.ok(regexPattern.includes("\\)"), "parentheses are escaped");
  assert.ok(regexPattern.includes("\\+"), "plus signs are escaped");
});

// ── Paid access filter ──

test("listSalons excludes unpaid barbers from salon barbers list", async () => {
  const res = createResponse();

  const paidBarberId = "64b000000000000000001101";
  const unpaidBarberId = "64b000000000000000001102";
  const salonId = "64b000000000000000001100";

  __salonControllerTestHooks.setGetPaidAccessByBarberIds(async (ids) => {
    const map = new Map();
    ids.forEach((id) => {
      map.set(String(id), String(id) === String(paidBarberId));
    });
    return map;
  });

  __salonControllerTestHooks.setGetSalonReviewStats(async () => {
    const map = new Map();
    map.set(String(salonId), { averageRating: 4.5, totalReviews: 10 });
    return map;
  });

  Salon.find = () => ({
    sort: async () => [
      {
        _id: salonId,
        name: "Test Salon",
        city: "Yerevan",
        ownerId,
        admins: [adminId],
      },
    ],
  });
  SalonJoinRequest.find = () => ({ distinct: async () => [] });

  const makeBarber = (id, name) => ({
    _id: id,
    name,
    role: "barber",
    platformRole: "superuser",
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: "555-PRIVATE",
    avatarUrl: "",
    specialty: "unisex",
    city: "Yerevan",
    salons: [
      {
        salon: salonId,
        status: "approved",
        relationshipType: "chair_renter",
        relationshipStatus: "accepted",
        worksAsSpecialist: true,
        staffPayment: { type: "fixed", fixedAmount: 1000 },
      },
    ],
    salon: salonId,
    salonStatus: "approved",
    toObject() {
      const { toObject, ...rest } = this;
      return { ...rest };
    },
  });

  User.find = () => ({
    select: async () => [
      makeBarber(paidBarberId, "Paid Barber"),
      makeBarber(unpaidBarberId, "Unpaid Barber"),
    ],
  });

  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Service.find = async () => [
    { barberId: paidBarberId },
    { barberId: unpaidBarberId },
  ];

  await listSalons({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 1, "one salon returned");

  const salonResult = res.body[0];
  assert.equal(Array.isArray(salonResult.barbers), true);
  assert.equal(salonResult.barbers.length, 1, "only paid barber included");
  assert.equal(salonResult.barbers[0].id || salonResult.barbers[0]._id, paidBarberId);
  assert.equal(salonResult.ownerId, undefined);
  assert.equal(salonResult.admins, undefined);
  assert.equal(salonResult.barbers[0].platformRole, undefined);
  assert.equal(salonResult.barbers[0].email, undefined);
  assert.equal(salonResult.barbers[0].phone, undefined);
  assert.equal(salonResult.barbers[0].salons, undefined);
  assert.equal(salonResult.barbers[0].approvedSalons, undefined);
  assert.equal(salonResult.barbers[0].staffPayment, undefined);

  __salonControllerTestHooks.resetGetPaidAccessByBarberIds();
  __salonControllerTestHooks.resetGetSalonReviewStats();
});

test("listSalons excludes explicit non-working owner from salon barbers list", async () => {
  const res = createResponse();
  const salonId = "64b000000000000000001200";

  __salonControllerTestHooks.setGetPaidAccessByBarberIds(async (ids) => {
    return new Map(ids.map((id) => [String(id), true]));
  });
  __salonControllerTestHooks.setGetSalonReviewStats(async () => new Map());

  Salon.find = () => ({
    sort: async () => [{ _id: salonId, name: "Owner Salon", city: "Yerevan" }],
  });
  SalonJoinRequest.find = () => ({ distinct: async () => [] });
  User.find = () => ({
    select: async () => [
      {
        _id: ownerId,
        name: "Owner Only",
        role: "barber",
        salons: [
          {
            salon: salonId,
            status: "approved",
            relationshipType: "staff",
            relationshipStatus: "accepted",
            worksAsSpecialist: false,
          },
        ],
        toObject() {
          const { toObject, ...rest } = this;
          return { ...rest };
        },
      },
    ],
  });
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Service.find = async () => [{ barberId: ownerId }];

  await listSalons({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].barbers.length, 0);
});

const makePublicSalonEndpointBarber = ({
  id,
  name,
  salonId = salonAId,
  salons,
  onboarding = completedSalonOnboarding,
} = {}) => ({
  _id: id,
  name,
  role: "barber",
  specialistOnboarding: onboarding,
  platformRole: "superuser",
  email: `${name || id}@example.com`,
  phone: "555-PRIVATE",
  salons: salons || [
    {
      salon: salonId,
      status: "approved",
      relationshipStatus: "accepted",
      worksAsSpecialist: true,
      staffPayment: { type: "fixed", fixedAmount: 1000 },
    },
  ],
  toObject() {
    const { toObject, ...rest } = this;
    return { ...rest };
  },
});

const setupPublicSalonReadinessMocks = ({
  salons = [
    { _id: salonAId, name: "Alpha Salon", city: "Yerevan", ownerId, admins: [adminId] },
    { _id: salonBId, name: "Empty Salon", city: "Gyumri", ownerId, admins: [adminId] },
  ],
  requestedSalon = salons[0],
  barbers,
  activeServiceIds,
} = {}) => {
  const serviceIds = new Set(activeServiceIds.map(String));

  __salonControllerTestHooks.setGetPaidAccessByBarberIds(async (ids) =>
    new Map(ids.map((id) => [String(id), true]))
  );
  __salonControllerTestHooks.setGetSalonReviewStats(async () => new Map());

  Salon.find = () => ({ sort: async () => salons });
  Salon.findById = async () => requestedSalon;
  SalonJoinRequest.find = () => ({ distinct: async () => [] });
  User.find = (query) => ({
    select: async () => {
      if (query?._id?.$in) {
        const ids = new Set(query._id.$in.map(String));
        return barbers.filter((barber) => ids.has(String(barber._id)));
      }
      return barbers;
    },
  });
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Service.find = async () =>
    barbers
      .filter((barber) => serviceIds.has(String(barber._id)))
      .map((barber) => ({ barberId: barber._id }));
};

test("listSalons includes only barbers ready and eligible for that exact salon", async () => {
  const readyId = "64b000000000000000002001";
  const unfinalizedId = "64b000000000000000002002";
  const noServiceId = "64b000000000000000002003";
  const pendingId = "64b000000000000000002004";
  const rejectedId = "64b000000000000000002005";
  const nonSpecialistId = "64b000000000000000002006";
  const crossSalonId = "64b000000000000000002007";
  const res = createResponse();

  setupPublicSalonReadinessMocks({
    barbers: [
      makePublicSalonEndpointBarber({ id: readyId, name: "Ready Specialist" }),
      makePublicSalonEndpointBarber({
        id: unfinalizedId,
        name: "Unfinalized",
        onboarding: {
          ...completedSalonOnboarding,
          status: "in_progress",
          currentStep: "review",
          completedAt: null,
        },
      }),
      makePublicSalonEndpointBarber({ id: noServiceId, name: "No Service" }),
      makePublicSalonEndpointBarber({
        id: pendingId,
        name: "Pending Specialist",
        salons: [{ salon: salonAId, status: "pending", relationshipStatus: "pending", worksAsSpecialist: true }],
      }),
      makePublicSalonEndpointBarber({
        id: rejectedId,
        name: "Rejected Specialist",
        salons: [{ salon: salonAId, status: "rejected", relationshipStatus: "rejected", worksAsSpecialist: true }],
      }),
      makePublicSalonEndpointBarber({
        id: nonSpecialistId,
        name: "Admin Only",
        salons: [{ salon: salonAId, status: "approved", relationshipStatus: "accepted", worksAsSpecialist: false }],
      }),
      makePublicSalonEndpointBarber({ id: crossSalonId, name: "Other Salon", salonId: salonBId }),
    ],
    activeServiceIds: [readyId, unfinalizedId, pendingId, rejectedId, nonSpecialistId, crossSalonId],
  });

  await listSalons({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2, "salons remain listed even when no eligible barber remains");
  assert.deepEqual(res.body[0].barbers.map((barber) => barber.id), [readyId]);
  assert.deepEqual(res.body[1].barbers.map((barber) => barber.id), [crossSalonId]);
  assert.equal(res.body[0].ownerId, undefined);
  assert.equal(res.body[0].admins, undefined);
  assert.equal(res.body[0].barbers[0].email, undefined);
  assert.equal(res.body[0].barbers[0].phone, undefined);
  assert.equal(res.body[0].barbers[0].salons, undefined);
  assert.equal(res.body[0].barbers[0].staffPayment, undefined);
});

test("getSalonProfile includes only ready barbers eligible for the requested salon", async () => {
  const readyId = "64b000000000000000003001";
  const crossSalonId = "64b000000000000000003002";
  const noServiceId = "64b000000000000000003003";
  const res = createResponse();

  setupPublicSalonReadinessMocks({
    requestedSalon: { _id: salonAId, name: "Alpha Salon", city: "Yerevan", ownerId, admins: [adminId] },
    barbers: [
      makePublicSalonEndpointBarber({ id: readyId, name: "Ready Detail" }),
      makePublicSalonEndpointBarber({ id: crossSalonId, name: "Cross Detail", salonId: salonBId }),
      makePublicSalonEndpointBarber({ id: noServiceId, name: "No Service Detail" }),
    ],
    activeServiceIds: [readyId, crossSalonId],
  });

  await getSalonProfile({ params: { salonId: salonAId } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.barbers.map((barber) => barber.id), [readyId]);
  assert.equal(res.body.ownerId, undefined);
  assert.equal(res.body.admins, undefined);
  assert.equal(res.body.barbers[0].email, undefined);
  assert.equal(res.body.barbers[0].phone, undefined);
  assert.equal(res.body.barbers[0].salons, undefined);
});

test("getSalonProfile handles an empty eligible-barber list without removing salon data", async () => {
  const res = createResponse();

  setupPublicSalonReadinessMocks({
    requestedSalon: { _id: salonAId, name: "Alpha Salon", city: "Yerevan", address: "Safe St" },
    barbers: [
      makePublicSalonEndpointBarber({
        id: "64b000000000000000004001",
        name: "Non Specialist Detail",
        salons: [{ salon: salonAId, status: "approved", relationshipStatus: "accepted", worksAsSpecialist: false }],
      }),
    ],
    activeServiceIds: ["64b000000000000000004001"],
  });

  await getSalonProfile({ params: { salonId: salonAId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, salonAId);
  assert.equal(res.body.name, "Alpha Salon");
  assert.deepEqual(res.body.barbers, []);
});
