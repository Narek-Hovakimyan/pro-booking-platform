import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../src/models/Salon.js";
import Schedule from "../src/models/Schedule.js";
import User from "../src/models/User.js";
import migrateScheduleToPerSalon from "./migrateScheduleToPerSalon.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/aud013_schedule_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Schedule.deleteMany({}), User.deleteMany({}), Salon.deleteMany({}), Schedule.createIndexes()]);
};
afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

const setup = async ({ phone = "+37490000011" } = {}) => {
  const first = await Salon.create({ name: "One", ownerId: new mongoose.Types.ObjectId() });
  const second = await Salon.create({ name: "Two", ownerId: new mongoose.Types.ObjectId() });
  const barber = await User.create({ name: "Barber", phone, password: "fixture-password", email: `schedule-${process.pid}-${Date.now()}@test.invalid`, role: "barber", salons: [{ salon: first._id, status: "approved", isPrimary: true }, { salon: second._id, status: "approved" }] });
  const payload = { barberId: barber._id, weeklySchedule: { mon: { working: true } }, dateSchedules: { "2026-01-01": {} }, scheduleOverrides: { "2026-01-02": { isWorking: false } }, nonWorkingDays: ["2026-01-03"], defaultSchedule: { startTime: "10:00", endTime: "19:00" } };
  const legacySource = { ...payload, _id: new mongoose.Types.ObjectId() };
  await Schedule.collection.insertOne(legacySource);
  return { barber, first, second, payload, legacySourceId: legacySource._id };
};

test("real Mongo schedule migration preserves payload, reruns, and rejects conflicts", { skip: !enabled }, async () => {
  await connect();
  const { barber, second, payload } = await setup();
  await migrateScheduleToPerSalon();
  const schedules = await Schedule.find({ barberId: barber._id });
  assert.equal(schedules.length, 2);
  assert.deepEqual(schedules.find((row) => String(row.salonId) === String(second._id)).defaultSchedule, payload.defaultSchedule);
  assert.equal((await migrateScheduleToPerSalon()).inspected, 0);
  const conflicting = await setup({ phone: "+37490000012" });
  await Schedule.collection.insertOne({
    ...conflicting.payload,
    _id: new mongoose.Types.ObjectId(),
    salonId: conflicting.second._id,
    weeklySchedule: { mon: { working: false } },
  });
  await assert.rejects(() => migrateScheduleToPerSalon());
  const retained = await Schedule.findOne({ barberId: conflicting.barber._id, salonId: conflicting.second._id });
  assert.equal(retained.weeklySchedule.mon.working, false);
  assert.equal(await Schedule.collection.countDocuments({ _id: conflicting.legacySourceId, salonId: { $exists: false } }), 1);
});

test("real Mongo target-write failure leaves the legacy row resumable", { skip: !enabled }, async () => {
  await connect();
  const { barber } = await setup();
  const failingModel = { ...Schedule, find: Schedule.find.bind(Schedule), create: async () => { throw new Error("forced target failure"); } };
  await assert.rejects(() => migrateScheduleToPerSalon({ ScheduleModel: failingModel }));
  assert.equal((await Schedule.collection.countDocuments({ barberId: barber._id, salonId: { $exists: false } })), 1);
});
