import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";

import fixWorkHistory, { runFixWorkHistoryMigration } from "./fixWorkHistory.js";

const salons = (rows) => ({ find: () => ({ select: async () => rows }) });
const userModel = (rows) => ({ find: async () => rows });
const barber = (overrides = {}) => ({
  _id: "barber-1", role: "barber", createdAt: new Date("2020-01-01"), updatedAt: new Date("2021-01-01"),
  salons: [{ salon: "salon-1", status: "approved", joinedAt: new Date("2020-02-01") }], workHistory: [],
  saves: 0, async save() { this.saves += 1; }, ...overrides,
});

test("work history migration is deterministic, rerunnable, and preserves finalized dates", async () => {
  const row = barber();
  const models = { UserModel: userModel([row]), SalonModel: salons([{ _id: "salon-1", name: "One" }]) };
  const first = await fixWorkHistory(models);
  assert.equal(first.migrated, 1);
  assert.equal(row.workHistory[0].salonName, "One");
  const second = await fixWorkHistory(models);
  assert.equal(second.skippedAlreadyMigrated, 1);
  assert.equal(row.saves, 1);
});

test("work history conflicts and malformed rows fail closed without saving", async () => {
  for (const row of [
    barber({ workHistory: [{ salon: "salon-1" }, { salon: "salon-1" }] }),
    barber({ workHistory: [{ salon: null, salonName: "Guessed" }] }),
  ]) {
    await assert.rejects(() => fixWorkHistory({ UserModel: userModel([row]), SalonModel: salons([{ _id: "salon-1", name: "One" }]) }));
    assert.equal(row.saves, 0);
  }
});

test("work history query or record failure fails the run", async () => {
  await assert.rejects(() => fixWorkHistory({ UserModel: { find: async () => { throw new Error("query failed"); } } }));
  const row = barber({ save: async () => { throw new Error("write failed"); } });
  await assert.rejects(() => fixWorkHistory({ UserModel: userModel([row]), SalonModel: salons([{ _id: "salon-1", name: "One" }]) }));
});

test("direct runner disconnects on success and failure, preserving non-zero failure semantics", async () => {
  const calls = [];
  await runFixWorkHistoryMigration({ connect: async () => calls.push("connect"), disconnect: async () => calls.push("disconnect"), execute: async () => ({ migrated: 1 }), setExitCode: () => {}, logError: () => {} });
  assert.deepEqual(calls, ["connect", "disconnect"]);
  await assert.rejects(() => runFixWorkHistoryMigration({ connect: async () => {}, disconnect: async () => calls.push("failed-disconnect"), execute: async () => { throw new Error("failed"); }, setExitCode: (code) => calls.push(code), logError: () => {} }));
  assert.deepEqual(calls.slice(-2), [1, "failed-disconnect"]);
});

test("default connection failure reaches the runner without terminating imported execution", async () => {
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
      () => runFixWorkHistoryMigration({ disconnect: async () => { disconnected += 1; }, execute: async () => { executed = true; }, logError: () => {} }),
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
