import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../src/models/Salon.js";
import User from "../src/models/User.js";
import { buildBackfillPlan, writeBackfillPlan } from "./backfillLegacySalonMemberships.js";

const configuredUri = process.env.MONGO_URI || "";
const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" &&
  /^mongodb:\/\/(127\.0\.0\.1|localhost):27018\//.test(configuredUri);

const connect = async () => {
  const uri = new URL(configuredUri);
  uri.pathname = `/legacy_salon_memberships_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.createIndexes(), Salon.createIndexes()]);
};

const makeBarber = (salonId, suffix) => User.create({
  name: `Legacy ${suffix}`,
  phone: `7${String(suffix).padStart(7, "0")}`,
  password: "password123",
  role: "barber",
  salon: salonId,
  salonStatus: "approved",
  salons: [],
});

afterEach(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
});

test("real Mongo backfill writes one exact canonical membership and preserves legacy fields", { skip: !enabled }, async () => {
  await connect();
  const owner = await User.create({ name: "Owner", phone: "70000001", password: "password123", role: "barber" });
  const salon = await Salon.create({ name: "Legacy Salon", ownerId: owner._id });
  const barber = await makeBarber(salon._id, 2);
  const source = await User.findById(barber._id).lean();
  const { plans } = buildBackfillPlan({ users: [source], salons: [salon], mode: "write" });
  assert.equal(plans.length, 1);
  assert.equal(await writeBackfillPlan({ plans }), 1);
  const saved = await User.findById(barber._id).lean();
  assert.equal(String(saved.salon), String(salon._id));
  assert.equal(saved.salonStatus, "approved");
  assert.equal(saved.salons.length, 1);
  assert.equal(saved.salons[0].status, "approved");
  assert.equal(saved.salons[0].relationshipType, "staff");
  const rerun = buildBackfillPlan({ users: [saved], salons: [salon], mode: "write" });
  assert.equal(rerun.result.existing, 1);
  assert.equal(rerun.plans.length, 0);
});

test("real Mongo CAS rejects a concurrent membership change without overwriting it", { skip: !enabled }, async () => {
  await connect();
  const owner = await User.create({ name: "Owner", phone: "70000003", password: "password123", role: "barber" });
  const salon = await Salon.create({ name: "Concurrent Salon", ownerId: owner._id });
  const barber = await makeBarber(salon._id, 4);
  const { plans } = buildBackfillPlan({ users: [await User.findById(barber._id).lean()], salons: [salon], mode: "write" });
  await User.updateOne({ _id: barber._id }, { $set: { salonStatus: "pending" }, $inc: { __v: 1 } });
  await assert.rejects(writeBackfillPlan({ plans }), (error) => error.code === "CONCURRENT_CHANGED");
  const saved = await User.findById(barber._id).lean();
  assert.equal(saved.salonStatus, "pending");
  assert.equal(saved.salons.length, 0);
});

test("real Mongo write plan cannot materialize a salon admin as staff", { skip: !enabled }, async () => {
  await connect();
  const owner = await User.create({ name: "Owner", phone: "70000005", password: "password123", role: "barber" });
  const admin = await User.create({ name: "Admin", phone: "70000006", password: "password123", role: "barber" });
  const salon = await Salon.create({ name: "Admin Salon", ownerId: owner._id, admins: [admin._id] });
  await User.updateOne({ _id: admin._id }, { $set: { salon: salon._id, salonStatus: "approved", salons: [] } });
  const source = await User.findById(admin._id).lean();
  const { result, plans } = buildBackfillPlan({ users: [source], salons: [salon], mode: "write" });
  assert.equal(result.ambiguous, 1);
  assert.equal(plans.length, 0);
  assert.equal(await writeBackfillPlan({ plans }), 0);
  assert.equal((await User.findById(admin._id).lean()).salons.length, 0);
});
