import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { listManageableSalons, updateSalonDefaultSchedule } from "./salonController.js";
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

test("listManageableSalons returns every approved salon membership", async () => {
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

  SalonJoinRequest.find = () => ({
    distinct: async () => [],
  });

  Salon.find = (query) => {
    foundQueries.push(query);

    return {
      sort: async () => [
        { _id: salonAId, name: "First Salon", ownerId: "owner-a", admins: [] },
        { _id: salonBId, name: "Second Salon", ownerId: "owner-b", admins: [] },
      ],
    };
  };

  await listManageableSalons(
    { user: { _id: barberId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(
    res.body.map((salon) => String(salon._id)),
    [salonAId, salonBId]
  );
  assert.deepEqual(foundQueries[0].$or[2], {
    _id: { $in: [salonAId, salonBId] },
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
    barberId,
    salonId: salonAId,
    defaultSchedule: selectedDefaultSchedule,
  });
  assert.deepEqual(scheduleOptions, {
    returnDocument: "after",
    runValidators: true,
    upsert: true,
  });
  assert.deepEqual(res.body.defaultSchedule, selectedDefaultSchedule);
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
