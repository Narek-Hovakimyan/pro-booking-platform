import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Service from "../models/Service.js";
import { updateService } from "../controllers/services/serviceController.js";

const mongoUri = process.env.MONGO_URI;
const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(mongoUri);
const originalSave = Service.prototype.save;
let isolatedDb;
let failpointAdmin;
let failpointArmed = false;

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const connectIsolatedDb = async (suffix) => {
  if (!mongoUri) throw new Error("RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI");
  const uri = new URL(mongoUri);
  uri.pathname = `/package_retry_${suffix}_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  isolatedDb = mongoose.connection.db;
  await Service.deleteMany({});
  await Service.createIndexes();
};

const disableCommitFailpoint = async () => {
  if (!failpointArmed || !failpointAdmin) return;
  try {
    await failpointAdmin.command({ configureFailPoint: "failCommand", mode: "off" });
  } finally {
    failpointArmed = false;
  }
};

const armTransientCommitFailure = async (t) => {
  failpointAdmin = mongoose.connection.db.admin();
  const hello = await failpointAdmin.command({ hello: 1 });
  if (!hello.setName) {
    t.skip("requires a MongoDB replica set");
    return false;
  }
  try {
    await failpointAdmin.command({
      configureFailPoint: "failCommand",
      mode: { times: 1 },
      data: {
        failCommands: ["commitTransaction"],
        errorCode: 251,
        errorLabels: ["TransientTransactionError"],
      },
    });
    failpointArmed = true;
    return true;
  } catch (error) {
    if (error?.code === 13 || error?.code === 59 || /configureFailPoint|not authorized/i.test(error?.message || "")) {
      t.skip(`MongoDB test commands unavailable: ${error.message}`);
      return false;
    }
    throw error;
  }
};

const instrumentTargetRetry = (targetId, assertRolledBack) => {
  let targetSaves = 0;
  let rollbackObserved = false;
  Service.prototype.save = async function instrumentedSave(...args) {
    if (String(this._id) === String(targetId)) {
      targetSaves += 1;
      if (targetSaves === 2) {
        // No session is supplied: this observes the state after the failed commit
        // and before the retry's real target persistence.
        await assertRolledBack();
        rollbackObserved = true;
      }
    }
    return originalSave.apply(this, args);
  };
  return {
    rollbackObserved: () => rollbackObserved,
    targetSaves: () => targetSaves,
  };
};

afterEach(async () => {
  try {
    await disableCommitFailpoint();
  } finally {
    Service.prototype.save = originalSave;
    try {
      if (mongoose.connection.readyState !== 0 && isolatedDb) await isolatedDb.dropDatabase();
    } finally {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      isolatedDb = undefined;
      failpointAdmin = undefined;
      failpointArmed = false;
    }
  }
});

test("real commit failpoint retries package and child lifecycle persistence", { skip: !enabled }, async (t) => {
  await connectIsolatedDb("integrity");
  const barberId = new mongoose.Types.ObjectId();
  const [first, second, packageService, child] = await Service.create([
    { barberId, name: "First", price: 1000, duration: 20 },
    { barberId, name: "Second", price: 2000, duration: 30 },
    {
      barberId, name: "Package", price: 3000, duration: 50, type: "package",
      includedServiceIds: [], packagePriceMode: "manual", packageDurationMode: "manual",
    },
    { barberId, name: "Child", price: 1500, duration: 25 },
  ]);
  await Service.updateOne(
    { _id: packageService._id },
    { $set: { includedServiceIds: [first._id, second._id] } }
  );

  let retry = instrumentTargetRetry(packageService._id, async () => {
    const rolledBack = await Service.findById(packageService._id).lean();
    assert.equal(rolledBack.name, "Package");
  });
  if (!await armTransientCommitFailure(t)) return;
  const packageResponse = response();
  try {
    await updateService(
      { user: { _id: barberId, role: "barber" }, params: { id: packageService._id }, body: { name: "Retried package" } },
      packageResponse
    );
  } finally {
    await disableCommitFailpoint();
  }
  assert.equal(packageResponse.statusCode, 200);
  assert.equal(retry.rollbackObserved(), true);
  assert.equal(retry.targetSaves(), 2);
  assert.equal((await Service.findById(packageService._id)).name, "Retried package");

  Service.prototype.save = originalSave;
  retry = instrumentTargetRetry(child._id, async () => {
    const rolledBack = await Service.findById(child._id).lean();
    assert.equal(rolledBack.active, true);
  });
  if (!await armTransientCommitFailure(t)) return;
  const childResponse = response();
  try {
    await updateService(
      { user: { _id: barberId, role: "barber" }, params: { id: child._id }, body: { active: false } },
      childResponse
    );
  } finally {
    await disableCommitFailpoint();
  }
  assert.equal(childResponse.statusCode, 200);
  assert.equal(retry.rollbackObserved(), true);
  assert.equal(retry.targetSaves(), 2);
  assert.equal((await Service.findById(child._id)).active, false);
});
