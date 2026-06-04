import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  getScheduleByBarber,
  getScheduleByBarberAndSalon,
  upsertSchedule,
  upsertScheduleByBarberAndSalon,
} from "./scheduleController.js";
import BarberProfile from "../models/BarberProfile.js";
import Schedule from "../models/Schedule.js";
import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import User from "../models/User.js";

const originalMethods = {
  barberProfileFindOne: BarberProfile.findOne,
  scheduleFindOne: Schedule.findOne,
  scheduleFindOneAndUpdate: Schedule.findOneAndUpdate,
  salonFindById: Salon.findById,
  joinRequestFindOne: SalonJoinRequest.findOne,
  userFindById: User.findById,
  userFindOneAndUpdate: User.findOneAndUpdate,
};

const barberId = "64b000000000000000000001";
const clientId = "64b000000000000000000003";
const salonAId = "64b000000000000000000004";
const salonBId = "64b000000000000000000005";

afterEach(() => {
  BarberProfile.findOne = originalMethods.barberProfileFindOne;
  Schedule.findOne = originalMethods.scheduleFindOne;
  Schedule.findOneAndUpdate = originalMethods.scheduleFindOneAndUpdate;
  Salon.findById = originalMethods.salonFindById;
  SalonJoinRequest.findOne = originalMethods.joinRequestFindOne;
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

const createQuery = (value) => ({
  select: async () => value,
});

const createScheduleBody = (overrides = {}) => ({
  weeklySchedule: {},
  scheduleOverrides: {},
  nonWorkingDays: [],
  ...overrides,
});

const createMongooseLikeDefaultSchedule = () => ({
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
  _doc: {
    startTime: "10:30",
    endTime: "18:00",
    hasBreak: true,
    breakStart: "14:00",
    breakEnd: "15:00",
  },
  $locals: {},
});

const assertCleanDefaultSchedule = (defaultSchedule) => {
  assert.deepEqual(defaultSchedule, {
    startTime: "10:30",
    endTime: "18:00",
    hasBreak: true,
    breakStart: "14:00",
    breakEnd: "15:00",
  });
  assert.equal(Object.hasOwn(defaultSchedule, "_doc"), false);
  assert.equal(Object.hasOwn(defaultSchedule, "$locals"), false);
};

const selectedDefaultSchedule = {
  startTime: "10:30",
  endTime: "18:00",
  hasBreak: true,
  breakStart: "14:00",
  breakEnd: "15:00",
};
const oldAutoClosedWeeklySchedule = {
  sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  tue: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  wed: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  thu: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  fri: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
};

const mockSchedulePermissionDependencies = ({
  barber = {
    _id: barberId,
    role: "barber",
    salons: [{ salon: salonAId, status: "approved" }],
    salonStatus: "none",
    salon: null,
  },
  salon = { _id: salonAId, ownerId: "owner-id", admins: [] },
  acceptedJoinRequest = null,
} = {}) => {
  User.findById = () => createQuery(barber);
  Salon.findById = () => createQuery(salon);
  SalonJoinRequest.findOne = async () => acceptedJoinRequest;
  User.findOneAndUpdate = async () => ({});
};

test("barber can update schedule for approved salon", async () => {
  const res = createResponse();
  let updateQuery;

  mockSchedulePermissionDependencies();

  Schedule.findOneAndUpdate = async (query, payload) => {
    updateQuery = query;
    return {
      ...payload,
      _id: "schedule-a",
      toObject() {
        return this;
      },
    };
  };

  await upsertScheduleByBarberAndSalon(
    {
      user: { _id: barberId, role: "barber" },
      params: { barberId, salonId: salonAId },
      body: createScheduleBody(),
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateQuery, { barberId, salonId: salonAId });
});

test("barber cannot update schedule for unrelated salon", async () => {
  const res = createResponse();
  let updateCalled = false;

  mockSchedulePermissionDependencies({
    barber: {
      _id: barberId,
      role: "barber",
      salons: [{ salon: salonAId, status: "approved" }],
      salonStatus: "none",
      salon: null,
    },
    salon: { _id: salonBId, ownerId: "owner-id", admins: [] },
  });
  Schedule.findOneAndUpdate = async () => {
    updateCalled = true;
  };

  await upsertScheduleByBarberAndSalon(
    {
      user: { _id: barberId, role: "barber" },
      params: { barberId, salonId: salonBId },
      body: createScheduleBody(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(updateCalled, false);
});

test("client cannot update schedule", async () => {
  const res = createResponse();
  let updateCalled = false;

  Schedule.findOneAndUpdate = async () => {
    updateCalled = true;
  };

  await upsertScheduleByBarberAndSalon(
    {
      user: { _id: clientId, role: "client" },
      params: { barberId: clientId, salonId: salonAId },
      body: createScheduleBody(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only barbers can edit schedules");
  assert.equal(updateCalled, false);
});

test("legacy schedule upsert requires salon route", async () => {
  const res = createResponse();
  let updateCalled = false;

  Schedule.findOneAndUpdate = async () => {
    updateCalled = true;
  };

  await upsertSchedule(
    {
      user: { _id: barberId, role: "barber" },
      body: { barberId, ...createScheduleBody() },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    "salonId is required. Use PUT /api/schedules/:barberId/:salonId"
  );
  assert.equal(updateCalled, false);
});

test("saving salon schedule persists defaultSchedule and GET returns it", async () => {
  const saveResponse = createResponse();
  const getResponse = createResponse();
  let savedSchedule = null;
  let userDefaultScheduleUpdate = null;

  mockSchedulePermissionDependencies();

  Schedule.findOneAndUpdate = async (query, payload, options) => {
    assert.deepEqual(query, { barberId, salonId: salonAId });
    assert.deepEqual(options, { returnDocument: "after", runValidators: true, upsert: true });
    savedSchedule = {
      ...payload,
      _id: "schedule-a",
      toObject() {
        return {
          barberId: this.barberId,
          salonId: this.salonId,
          weeklySchedule: this.weeklySchedule,
          dateSchedules: this.dateSchedules,
          scheduleOverrides: this.scheduleOverrides,
          nonWorkingDays: this.nonWorkingDays,
          defaultSchedule: this.defaultSchedule,
        };
      },
    };
    return savedSchedule;
  };
  User.findOneAndUpdate = async (query, update) => {
    assert.deepEqual(query, { _id: barberId, "salons.salon": salonAId });
    userDefaultScheduleUpdate = update.$set["salons.$.defaultSchedule"];
    return {};
  };

  await upsertScheduleByBarberAndSalon(
    {
      user: { _id: barberId, role: "barber" },
      params: { barberId, salonId: salonAId },
      body: createScheduleBody({ defaultSchedule: selectedDefaultSchedule }),
    },
    saveResponse
  );

  assert.equal(saveResponse.statusCode, 200);
  assert.deepEqual(savedSchedule.weeklySchedule, {});
  assert.deepEqual(savedSchedule.defaultSchedule, selectedDefaultSchedule);
  assert.deepEqual(userDefaultScheduleUpdate, selectedDefaultSchedule);

  Schedule.findOne = async (query) => {
    assert.deepEqual(query, { barberId, salonId: salonAId });
    return savedSchedule;
  };
  User.findById = () =>
    createQuery({
      _id: barberId,
      salons: [{ salon: salonAId, status: "approved" }],
    });

  await getScheduleByBarberAndSalon(
    { params: { barberId, salonId: salonAId } },
    getResponse
  );

  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(getResponse.body.defaultSchedule, selectedDefaultSchedule);
});

test("saving old all-days closed weekly schedule cleans it back to default fallback", async () => {
  const res = createResponse();
  let savedWeeklySchedule = null;

  mockSchedulePermissionDependencies();

  Schedule.findOneAndUpdate = async (query, payload) => {
    savedWeeklySchedule = payload.weeklySchedule;
    return {
      ...payload,
      _id: "schedule-a",
      toObject() {
        return this;
      },
    };
  };

  await upsertScheduleByBarberAndSalon(
    {
      user: { _id: barberId, role: "barber" },
      params: { barberId, salonId: salonAId },
      body: createScheduleBody({
        defaultSchedule: selectedDefaultSchedule,
        weeklySchedule: oldAutoClosedWeeklySchedule,
      }),
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(savedWeeklySchedule, {});
});

test("saving explicit weekly day off preserves that day", async () => {
  const res = createResponse();
  let savedWeeklySchedule = null;

  mockSchedulePermissionDependencies();

  Schedule.findOneAndUpdate = async (query, payload) => {
    savedWeeklySchedule = payload.weeklySchedule;
    return {
      ...payload,
      _id: "schedule-a",
      toObject() {
        return this;
      },
    };
  };

  await upsertScheduleByBarberAndSalon(
    {
      user: { _id: barberId, role: "barber" },
      params: { barberId, salonId: salonAId },
      body: createScheduleBody({
        weeklySchedule: {
          sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
        },
      }),
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(savedWeeklySchedule, {
    sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  });
});

test("salon A schedule save does not overwrite salon B schedule", async () => {
  const res = createResponse();
  const updateQueries = [];

  mockSchedulePermissionDependencies({
    barber: {
      _id: barberId,
      role: "barber",
      salons: [
        { salon: salonAId, status: "approved" },
        { salon: salonBId, status: "approved" },
      ],
      salonStatus: "none",
      salon: null,
    },
  });

  Schedule.findOneAndUpdate = async (query, payload) => {
    updateQueries.push(query);
    return {
      ...payload,
      _id: "schedule-a",
      toObject() {
        return this;
      },
    };
  };

  await upsertScheduleByBarberAndSalon(
    {
      user: { _id: barberId, role: "barber" },
      params: { barberId, salonId: salonAId },
      body: createScheduleBody(),
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateQueries, [{ barberId, salonId: salonAId }]);
});

test("salon schedule endpoint returns clean defaultSchedule without mongoose internals", async () => {
  const res = createResponse();

  Schedule.findOne = async () => ({
    barberId,
    salonId: salonAId,
    weeklySchedule: {
      mon: { working: true, from: "10:30", to: "18:00", breakFrom: "14:00", breakTo: "15:00" },
    },
    dateSchedules: {},
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: createMongooseLikeDefaultSchedule(),
    toObject() {
      return {
        barberId: this.barberId,
        salonId: this.salonId,
        weeklySchedule: this.weeklySchedule,
        dateSchedules: this.dateSchedules,
        scheduleOverrides: this.scheduleOverrides,
        nonWorkingDays: this.nonWorkingDays,
      };
    },
  });
  User.findById = () =>
    createQuery({
      _id: barberId,
      salons: [{ salon: salonAId, status: "approved" }],
    });

  await getScheduleByBarberAndSalon(
    { params: { barberId, salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assertCleanDefaultSchedule(res.body.defaultSchedule);
  assert.equal(JSON.stringify(res.body).includes("_doc"), false);
  assert.equal(JSON.stringify(res.body).includes("$locals"), false);
});

test("salon schedule endpoint cleans old all-days closed weekly schedule in response", async () => {
  const res = createResponse();
  let cleanupUpdate = null;

  Schedule.findOne = async () => ({
    barberId,
    salonId: salonAId,
    weeklySchedule: oldAutoClosedWeeklySchedule,
    dateSchedules: {},
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: selectedDefaultSchedule,
    toObject() {
      return {
        barberId: this.barberId,
        salonId: this.salonId,
        weeklySchedule: this.weeklySchedule,
        dateSchedules: this.dateSchedules,
        scheduleOverrides: this.scheduleOverrides,
        nonWorkingDays: this.nonWorkingDays,
      };
    },
  });
  Schedule.findOneAndUpdate = async (query, update) => {
    cleanupUpdate = { query, update };
    return {};
  };
  User.findById = () =>
    createQuery({
      _id: barberId,
      salons: [{ salon: salonAId, status: "approved" }],
    });

  await getScheduleByBarberAndSalon(
    { params: { barberId, salonId: salonAId } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.weeklySchedule, {});
  assert.deepEqual(res.body.defaultSchedule, selectedDefaultSchedule);
  assert.deepEqual(cleanupUpdate, {
    query: { barberId, salonId: salonAId },
    update: { $set: { weeklySchedule: {} } },
  });
});

test("salon schedule endpoint removes past non-working days and date overrides", async () => {
  const res = createResponse();
  let cleanupUpdate = null;

  mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-06-04T08:00:00.000Z"),
  });

  try {
    Schedule.findOne = async () => ({
      barberId,
      salonId: salonAId,
      weeklySchedule: {
        thu: { working: true, from: "09:00", to: "17:00", breakFrom: "", breakTo: "" },
      },
      dateSchedules: {
        "2026-05-16": { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
        "2026-06-04": { working: true, from: "10:00", to: "15:00", breakFrom: "", breakTo: "" },
        "2026-06-10": { working: true, from: "11:00", to: "16:00", breakFrom: "", breakTo: "" },
      },
      scheduleOverrides: {
        "2026-05-16": { isWorking: false },
        "2026-06-04": {
          isWorking: true,
          startTime: "10:00",
          endTime: "15:00",
          breakStart: "",
          breakEnd: "",
        },
        "2026-06-10": { isWorking: false },
      },
      nonWorkingDays: ["2026-05-16", "2026-06-04", "2026-06-10"],
      defaultSchedule: selectedDefaultSchedule,
      toObject() {
        return {
          barberId: this.barberId,
          salonId: this.salonId,
          weeklySchedule: this.weeklySchedule,
          dateSchedules: this.dateSchedules,
          scheduleOverrides: this.scheduleOverrides,
          nonWorkingDays: this.nonWorkingDays,
          defaultSchedule: this.defaultSchedule,
        };
      },
    });
    Schedule.findOneAndUpdate = async (query, update) => {
      cleanupUpdate = { query, update };
      return {};
    };
    User.findById = () =>
      createQuery({
        _id: barberId,
        salons: [{ salon: salonAId, status: "approved" }],
      });

    await getScheduleByBarberAndSalon(
      { params: { barberId, salonId: salonAId } },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.weeklySchedule, {
      thu: { working: true, from: "09:00", to: "17:00", breakFrom: "", breakTo: "" },
    });
    assert.deepEqual(res.body.defaultSchedule, selectedDefaultSchedule);
    assert.deepEqual(res.body.nonWorkingDays, ["2026-06-04", "2026-06-10"]);
    assert.deepEqual(res.body.scheduleOverrides, {
      "2026-06-04": {
        isWorking: true,
        startTime: "10:00",
        endTime: "15:00",
        breakStart: "",
        breakEnd: "",
      },
      "2026-06-10": { isWorking: false },
    });
    assert.deepEqual(res.body.dateSchedules, {
      "2026-06-04": { working: true, from: "10:00", to: "15:00", breakFrom: "", breakTo: "" },
      "2026-06-10": { working: true, from: "11:00", to: "16:00", breakFrom: "", breakTo: "" },
    });
    assert.deepEqual(cleanupUpdate, {
      query: { barberId, salonId: salonAId },
      update: {
        $set: {
          dateSchedules: {
            "2026-06-04": {
              working: true,
              from: "10:00",
              to: "15:00",
              breakFrom: "",
              breakTo: "",
            },
            "2026-06-10": {
              working: true,
              from: "11:00",
              to: "16:00",
              breakFrom: "",
              breakTo: "",
            },
          },
          scheduleOverrides: {
            "2026-06-04": {
              isWorking: true,
              startTime: "10:00",
              endTime: "15:00",
              breakStart: "",
              breakEnd: "",
            },
            "2026-06-10": { isWorking: false },
          },
          nonWorkingDays: ["2026-06-04", "2026-06-10"],
        },
      },
    });
  } finally {
    mock.timers.reset();
  }
});

test("legacy schedule endpoint returns clean defaultSchedule without mongoose internals", async () => {
  const res = createResponse();

  Schedule.findOne = async () => ({
    barberId,
    salonId: salonAId,
    weeklySchedule: {},
    dateSchedules: {},
    scheduleOverrides: {},
    nonWorkingDays: [],
    defaultSchedule: createMongooseLikeDefaultSchedule(),
    toObject() {
      return {
        barberId: this.barberId,
        salonId: this.salonId,
        weeklySchedule: this.weeklySchedule,
        dateSchedules: this.dateSchedules,
        scheduleOverrides: this.scheduleOverrides,
        nonWorkingDays: this.nonWorkingDays,
      };
    },
  });
  User.findById = () =>
    createQuery({
      _id: barberId,
      salons: [{ salon: salonAId, status: "approved", isPrimary: true }],
    });
  BarberProfile.findOne = async () => null;

  await getScheduleByBarber({ params: { barberId } }, res);

  assert.equal(res.statusCode, 200);
  assertCleanDefaultSchedule(res.body.defaultSchedule);
  assert.equal(JSON.stringify(res.body).includes("_doc"), false);
  assert.equal(JSON.stringify(res.body).includes("$locals"), false);
});
