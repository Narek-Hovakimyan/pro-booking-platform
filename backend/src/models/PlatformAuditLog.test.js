import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import mongoose from "mongoose";
import PlatformAuditLogModel from "./PlatformAuditLog.js";

const TEST_MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/hairbook_test";

let connection;
let PlatformAuditLog;

before(async () => {
  connection = await mongoose.createConnection(TEST_MONGO_URI).asPromise();
  PlatformAuditLog = connection.model(
    "PlatformAuditLog",
    PlatformAuditLogModel.schema,
    "platformauditlogs"
  );
});

after(async () => {
  await connection.close();
});

test("creates a valid audit log entry", async () => {
  const entry = await PlatformAuditLog.create({
    actorId: new mongoose.Types.ObjectId(),
    action: "subscription_activated",
    salonId: new mongoose.Types.ObjectId(),
    targetUserId: new mongoose.Types.ObjectId(),
    oldValue: { status: "expired" },
    newValue: { status: "active", seatCount: 5 },
    note: "Manual activation after payment confirmation",
  });

  assert.ok(entry._id);
  assert.equal(entry.action, "subscription_activated");
  assert.equal(entry.note, "Manual activation after payment confirmation");
  assert.deepStrictEqual(entry.oldValue, { status: "expired" });
  assert.deepStrictEqual(entry.newValue, { status: "active", seatCount: 5 });
  assert.ok(entry.createdAt);
  assert.ok(entry.updatedAt);

  await PlatformAuditLog.deleteOne({ _id: entry._id });
});

test("requires actorId", async () => {
  await assert.rejects(
    () =>
      PlatformAuditLog.create({
        action: "seat_assigned",
      }),
    { name: "ValidationError" }
  );
});

test("requires action", async () => {
  await assert.rejects(
    () =>
      PlatformAuditLog.create({
        actorId: new mongoose.Types.ObjectId(),
      }),
    { name: "ValidationError" }
  );
});

test("allows minimal entry with only required fields", async () => {
  const entry = await PlatformAuditLog.create({
    actorId: new mongoose.Types.ObjectId(),
    action: "test_action",
  });

  assert.ok(entry._id);
  assert.equal(entry.salonId, null);
  assert.equal(entry.targetUserId, null);
  assert.equal(entry.oldValue, null);
  assert.equal(entry.newValue, null);
  assert.equal(entry.note, "");

  await PlatformAuditLog.deleteOne({ _id: entry._id });
});

test("supports all known action values", async () => {
  const actions = [
    "subscription_activated",
    "subscription_extended",
    "seat_count_updated",
    "seat_assigned",
    "seat_revoked",
    "payment_confirmed_manual",
    "payment_marked_paid",
  ];

  for (const action of actions) {
    const entry = await PlatformAuditLog.create({
      actorId: new mongoose.Types.ObjectId(),
      action,
      note: `test ${action}`,
    });

    assert.equal(entry.action, action);
    await PlatformAuditLog.deleteOne({ _id: entry._id });
  }
});

test("has expected indexes", () => {
  const indexes = PlatformAuditLog.schema.indexes();

  const indexFields = indexes.map(([fields]) => Object.keys(fields).sort());

  const hasActorIndex = indexFields.some(
    (keys) => keys.includes("actorId") && keys.includes("createdAt")
  );
  const hasSalonIndex = indexFields.some(
    (keys) => keys.includes("salonId") && keys.includes("createdAt")
  );
  const hasActionIndex = indexFields.some(
    (keys) => keys.includes("action") && keys.includes("createdAt")
  );

  assert.ok(hasActorIndex, "Missing actorId+createdAt index");
  assert.ok(hasSalonIndex, "Missing salonId+createdAt index");
  assert.ok(hasActionIndex, "Missing action+createdAt index");
});
