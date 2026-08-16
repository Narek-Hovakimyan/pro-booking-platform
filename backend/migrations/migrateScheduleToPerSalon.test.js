import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";

import migrateScheduleToPerSalon, { runScheduleMigration } from "./migrateScheduleToPerSalon.js";

const payload = { weeklySchedule: { mon: { working: true } }, dateSchedules: { "2026-01-01": {} }, scheduleOverrides: { "2026-01-02": { isWorking: false } }, nonWorkingDays: ["2026-01-03"], defaultSchedule: { startTime: "10:00", endTime: "19:00" } };
const barber = { _id: "barber-1", role: "barber", salons: [{ salon: "salon-1", status: "approved", isPrimary: true }, { salon: "salon-2", status: "approved" }] };
const chain = (rows) => ({ select: async () => rows });
const createModels = ({ legacy, targets = [], createError } = {}) => {
  const created = [];
  const ScheduleModel = {
    async find(query) { return query.salonId?.$exists === false ? [legacy].filter((row) => row && !Object.hasOwn(row, "salonId")) : targets; },
    async create(row) { if (createError) throw createError; created.push(row); targets.push({ ...row }); return row; },
  };
  return { ScheduleModel, UserModel: { findById: async () => barber }, SalonModel: { find: () => chain([{ _id: "salon-1" }, { _id: "salon-2" }]) }, created };
};
const legacy = () => ({ _id: "legacy", barberId: "barber-1", ...structuredClone(payload), saves: 0, deleted: 0, async save() { this.saves += 1; }, async deleteOne() { this.deleted += 1; } });

test("schedule migration preserves every payload field and reruns without duplicates", async () => {
  const row = legacy();
  const models = createModels({ legacy: row });
  const result = await migrateScheduleToPerSalon(models);
  assert.equal(result.migrated, 1);
  assert.equal(row.salonId, "salon-1");
  assert.deepEqual(models.created[0].defaultSchedule, payload.defaultSchedule);
  assert.deepEqual(models.created[0].scheduleOverrides, payload.scheduleOverrides);
  assert.equal((await migrateScheduleToPerSalon(models)).inspected, 0);
  assert.equal(models.created.length, 1);
});

test("equivalent partial state resumes, while conflicts or duplicate targets fail closed", async () => {
  const partial = legacy();
  const equivalent = { barberId: "barber-1", salonId: "salon-2", ...structuredClone(payload) };
  const resumed = createModels({ legacy: partial, targets: [equivalent] });
  await migrateScheduleToPerSalon(resumed);
  assert.equal(partial.salonId, "salon-1");
  const conflict = legacy();
  await assert.rejects(() => migrateScheduleToPerSalon(createModels({ legacy: conflict, targets: [{ ...equivalent, weeklySchedule: {} }] })));
  assert.equal(conflict.saves, 0);
  await assert.rejects(() => migrateScheduleToPerSalon(createModels({ legacy: legacy(), targets: [equivalent, { ...equivalent }] })));
});

test("target creation failure leaves legacy source recoverable", async () => {
  const row = legacy();
  await assert.rejects(() => migrateScheduleToPerSalon(createModels({ legacy: row, createError: new Error("unique") })));
  assert.equal(row.salonId, undefined);
  assert.equal(row.saves, 0);
});

test("schedule direct runner disconnects on success and failure", async () => {
  const calls = [];
  await runScheduleMigration({ connect: async () => calls.push("connect"), disconnect: async () => calls.push("disconnect"), execute: async () => ({}), setExitCode: () => {}, logError: () => {} });
  await assert.rejects(() => runScheduleMigration({ connect: async () => {}, disconnect: async () => calls.push("failed-disconnect"), execute: async () => { throw new Error("failed"); }, setExitCode: (code) => calls.push(code), logError: () => {} }));
  assert.deepEqual(calls, ["connect", "disconnect", 1, "failed-disconnect"]);
});

test("default schedule connection failure reaches the runner without process termination", async () => {
  const originalConnect = mongoose.connect;
  const originalExit = process.exit;
  const originalExitCode = process.exitCode;
  const originalMongoUri = process.env.MONGO_URI;
  const cause = new Error("connection refused");
  const exits = [];
  let disconnected = 0;
  let executed = false;
  try {
    process.env.MONGO_URI = "mongodb://127.0.0.1/test";
    mongoose.connect = async () => { throw cause; };
    process.exit = (code) => { exits.push(code); };
    await assert.rejects(
      () => runScheduleMigration({ disconnect: async () => { disconnected += 1; }, execute: async () => { executed = true; }, logError: () => {} }),
      (error) => error.code === "connection_failed" && error.cause === cause
    );
    assert.deepEqual(exits, []);
    assert.equal(process.exitCode, 1);
    assert.equal(disconnected, 1);
    assert.equal(executed, false);
  } finally {
    mongoose.connect = originalConnect;
    process.exit = originalExit;
    process.exitCode = originalExitCode;
    if (originalMongoUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = originalMongoUri;
  }
});
