import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../src/models/Salon.js";
import User from "../src/models/User.js";
import fixWorkHistory from "./fixWorkHistory.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/aud013_history_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.deleteMany({}), Salon.deleteMany({})]);
};
afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

test("real Mongo work history migration persists once and leaves ambiguity untouched", { skip: !enabled }, async () => {
  await connect();
  const salon = await Salon.create({ name: "One", ownerId: new mongoose.Types.ObjectId() });
  const barber = await User.create({ name: "Barber", phone: "+37490000001", password: "fixture-password", email: `history-${process.pid}@test.invalid`, role: "barber", salons: [{ salon: salon._id, status: "approved", joinedAt: new Date("2020-01-01") }] });
  await fixWorkHistory();
  const migrated = await User.findById(barber._id);
  assert.equal(migrated.workHistory.length, 1);
  const rerun = await fixWorkHistory();
  assert.equal(rerun.skippedAlreadyMigrated, 1);
  const ambiguous = await User.create({ name: "Ambiguous", phone: "+37490000002", password: "fixture-password", email: `history-ambiguous-${process.pid}@test.invalid`, role: "barber", salons: [{ salon: salon._id, status: "approved" }], workHistory: [{ salon: salon._id }, { salon: salon._id }] });
  await assert.rejects(() => fixWorkHistory());
  assert.equal((await User.findById(ambiguous._id)).workHistory.length, 2);
});

test("real Mongo forced write failure is surfaced", { skip: !enabled }, async () => {
  await connect();
  const salon = await Salon.create({ name: "One", ownerId: new mongoose.Types.ObjectId() });
  const barber = await User.create({ name: "Failure", phone: "+37490000003", password: "fixture-password", email: `history-failure-${process.pid}@test.invalid`, role: "barber", salons: [{ salon: salon._id, status: "approved" }] });
  barber.save = async () => { throw new Error("forced write failure"); };
  await assert.rejects(() => fixWorkHistory({ UserModel: { find: async () => [barber] } }));
});
