import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Schedule from "../models/Schedule.js";
import { createCanonicalPersonalSchedule } from "../utils/personalScheduleUtils.js";
import {
  getPersonalScheduleByBarber,
  upsertPersonalScheduleByBarber,
} from "./schedules/personalScheduleController.js";

const barberId = "64b000000000000000000001";
const otherBarberId = "64b000000000000000000002";
const originalMethods = {
  findOne: Schedule.findOne,
  findOneAndUpdate: Schedule.findOneAndUpdate,
};

const createResponse = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const barberRequest = (overrides = {}) => ({
  user: { _id: barberId, role: "barber" },
  params: { barberId },
  ...overrides,
});

afterEach(() => {
  Schedule.findOne = originalMethods.findOne;
  Schedule.findOneAndUpdate = originalMethods.findOneAndUpdate;
});

test("personal GET returns an unsaved canonical default without writing", async () => {
  let query;
  Schedule.findOne = async (nextQuery) => { query = nextQuery; return null; };
  const res = createResponse();

  await getPersonalScheduleByBarber(barberRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.exists, false);
  assert.equal(res.body.schedule.updatedAt, null);
  assert.equal(res.body.schedule.weeklySchedule.mon.working, true);
  assert.deepEqual(query, { barberId, salonId: null });
});

test("personal GET returns only the personal schedule response allowlist", async () => {
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  Schedule.findOne = async (query) => {
    assert.deepEqual(query, { barberId, salonId: null });
    return {
      weeklySchedule,
      salonId: null,
      barberId,
      arbitrary: "hidden",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  };
  const res = createResponse();

  await getPersonalScheduleByBarber(barberRequest(), res);

  assert.equal(res.body.exists, true);
  assert.deepEqual(Object.keys(res.body.schedule), [
    "weeklySchedule", "defaultSchedule", "nonWorkingDays", "updatedAt",
  ]);
  assert.equal(JSON.stringify(res.body).includes("arbitrary"), false);
  assert.equal(JSON.stringify(res.body).includes("barberId"), false);
});

test("personal schedule endpoints require the authenticated target barber", async () => {
  for (const request of [
    barberRequest({ user: { _id: barberId, role: "client" } }),
    barberRequest({ params: { barberId: otherBarberId } }),
  ]) {
    const res = createResponse();
    await getPersonalScheduleByBarber(request, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "FORBIDDEN_PERSONAL_SCHEDULE_ACCESS");
  }
});

test("personal PUT rejects mass assignment and validates before writing", async () => {
  let called = false;
  Schedule.findOneAndUpdate = async () => { called = true; };
  const res = createResponse();

  await upsertPersonalScheduleByBarber(
    barberRequest({ body: { weeklySchedule: createCanonicalPersonalSchedule().weeklySchedule, salonId: null } }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_PERSONAL_SCHEDULE");
  assert.equal(called, false);
});

test("personal PUT stores only the authenticated barber null-salon schedule", async () => {
  let received;
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  Schedule.findOneAndUpdate = async (filter, update, options) => {
    received = { filter, update, options };
    return { weeklySchedule: update.$set.weeklySchedule, updatedAt: new Date("2026-01-01T00:00:00.000Z") };
  };
  const res = createResponse();

  await upsertPersonalScheduleByBarber(barberRequest({ body: { weeklySchedule } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.exists, true);
  assert.deepEqual(received.filter, { barberId, salonId: null });
  assert.deepEqual(received.update.$setOnInsert, { barberId, salonId: null });
  assert.equal(received.options.upsert, true);
});

test("personal PUT returns a generic server error for unrelated persistence failures", async () => {
  Schedule.findOneAndUpdate = async () => { throw new Error("database details"); };
  const res = createResponse();

  await upsertPersonalScheduleByBarber(
    barberRequest({ body: { weeklySchedule: createCanonicalPersonalSchedule().weeklySchedule } }),
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not save personal schedule" });
});
