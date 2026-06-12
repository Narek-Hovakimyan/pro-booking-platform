import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import PlatformAuditLog from "./PlatformAuditLog.js";

test("creates a valid audit log entry shape", () => {
  const entry = new PlatformAuditLog({
    actorId: new mongoose.Types.ObjectId(),
    action: "subscription_activated",
    salonId: new mongoose.Types.ObjectId(),
    targetUserId: new mongoose.Types.ObjectId(),
    subscriptionId: new mongoose.Types.ObjectId(),
    paymentAttemptId: new mongoose.Types.ObjectId(),
    oldValue: { status: "expired" },
    newValue: { status: "active", seatCount: 5 },
    note: "Manual activation after payment confirmation",
    requestIp: "127.0.0.1",
  });

  assert.equal(entry.validateSync(), undefined);
  assert.equal(entry.action, "subscription_activated");
  assert.equal(entry.note, "Manual activation after payment confirmation");
  assert.ok(entry.subscriptionId);
  assert.ok(entry.paymentAttemptId);
  assert.equal(entry.requestIp, "127.0.0.1");
  assert.deepStrictEqual(entry.oldValue, { status: "expired" });
  assert.deepStrictEqual(entry.newValue, { status: "active", seatCount: 5 });
});

test("requires actorId", () => {
  const entry = new PlatformAuditLog({
    action: "seat_assigned",
  });

  const error = entry.validateSync();
  assert.ok(error?.errors?.actorId);
});

test("requires action", () => {
  const entry = new PlatformAuditLog({
    actorId: new mongoose.Types.ObjectId(),
  });

  const error = entry.validateSync();
  assert.ok(error?.errors?.action);
});

test("allows minimal entry with only required fields", () => {
  const entry = new PlatformAuditLog({
    actorId: new mongoose.Types.ObjectId(),
    action: "test_action",
  });

  assert.equal(entry.validateSync(), undefined);
  assert.equal(entry.salonId, null);
  assert.equal(entry.targetUserId, null);
  assert.equal(entry.subscriptionId, null);
  assert.equal(entry.paymentAttemptId, null);
  assert.equal(entry.oldValue, null);
  assert.equal(entry.newValue, null);
  assert.equal(entry.note, "");
  assert.equal(entry.requestIp, "");
});

test("supports all known action values", () => {
  const actions = [
    "subscription_activated",
    "subscription_extended",
    "seat_count_updated",
    "seat_assigned",
    "seat_revoked",
    "payment_confirmed_manual",
    "payment_marked_paid",
    "salon_subscription.activate",
    "salon_subscription.seat_count_update",
    "salon_subscription.seat_assign",
    "salon_subscription.seat_revoke",
    "salon_subscription.payment_confirm",
  ];

  for (const action of actions) {
    const entry = new PlatformAuditLog({
      actorId: new mongoose.Types.ObjectId(),
      action,
      note: `test ${action}`,
    });

    assert.equal(entry.validateSync(), undefined);
    assert.equal(entry.action, action);
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
  const hasSubscriptionIndex = indexFields.some(
    (keys) => keys.includes("subscriptionId") && keys.includes("createdAt")
  );
  const hasPaymentAttemptIndex = indexFields.some(
    (keys) => keys.includes("paymentAttemptId") && keys.includes("createdAt")
  );
  const hasActionIndex = indexFields.some(
    (keys) => keys.includes("action") && keys.includes("createdAt")
  );

  assert.ok(hasActorIndex, "Missing actorId+createdAt index");
  assert.ok(hasSalonIndex, "Missing salonId+createdAt index");
  assert.ok(hasSubscriptionIndex, "Missing subscriptionId+createdAt index");
  assert.ok(hasPaymentAttemptIndex, "Missing paymentAttemptId+createdAt index");
  assert.ok(hasActionIndex, "Missing action+createdAt index");
});
