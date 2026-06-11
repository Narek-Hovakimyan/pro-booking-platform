import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { listManageableSalons, listSalons, updateSalonDefaultSchedule, __salonControllerTestHooks } from "./salonController.js";
import { getSalonStaff } from "./salonStaffController.js";
import BarberProfile from "../models/BarberProfile.js";
import Schedule from "../models/Schedule.js";
import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import User from "../models/User.js";

const originalMethods = {
  barberProfileFind: BarberProfile.find,
  scheduleFindOneAndUpdate: Schedule.findOneAndUpdate,
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

afterEach(() => {
  BarberProfile.find = originalMethods.barberProfileFind;
  Schedule.findOneAndUpdate = originalMethods.scheduleFindOneAndUpdate;
  Salon.find = originalMethods.salonFind;
  Salon.findById = originalMethods.salonFindById;
  SalonJoinRequest.find = originalMethods.joinRequestFind;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
  User.findOneAndUpdate = originalMethods.userFindOneAndUpdate;
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
    sort: async () => [{ _id: salonId, name: "Test Salon", city: "Yerevan" }],
  });
  SalonJoinRequest.find = () => ({ distinct: async () => [] });

  const makeBarber = (id, name) => ({
    _id: id,
    name,
    role: "barber",
    avatarUrl: "",
    specialty: "unisex",
    city: "Yerevan",
    salons: [{ salon: salonId, status: "approved" }],
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

  await listSalons({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 1, "one salon returned");

  const salonResult = res.body[0];
  assert.equal(Array.isArray(salonResult.barbers), true);
  assert.equal(salonResult.barbers.length, 1, "only paid barber included");
  assert.equal(salonResult.barbers[0].id || salonResult.barbers[0]._id, paidBarberId);

  __salonControllerTestHooks.resetGetPaidAccessByBarberIds();
  __salonControllerTestHooks.resetGetSalonReviewStats();
});
