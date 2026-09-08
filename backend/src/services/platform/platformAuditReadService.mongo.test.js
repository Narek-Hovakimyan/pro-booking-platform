import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import { listPlatformAuditLogs } from "./platformAuditReadService.js";

const enabled =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" &&
  Boolean(process.env.MONGO_URI);

const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/audit_read_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.db.dropDatabase();
  await PlatformAuditLog.createIndexes();
};

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.db.dropDatabase().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
});

test("real Mongo audit feed filters, sorts, paginates, and retains missing references", { skip: !enabled }, async () => {
  await connect();
  const actorId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();
  const subscriptionId = new mongoose.Types.ObjectId();
  const paymentAttemptId = new mongoose.Types.ObjectId();
  const createdAt = new Date("2026-02-01T12:00:00.000Z");

  const [first, second, other] = await PlatformAuditLog.create([
    {
      actorId,
      salonId,
      targetUserId,
      subscriptionId,
      paymentAttemptId,
      action: "salon_subscription.seat_assign",
      newValue: { seatId: new mongoose.Types.ObjectId(), barberId: targetUserId, hidden: { token: "no" } },
      note: "Assigned seat",
      requestIp: "203.0.113.10",
      createdAt,
      updatedAt: createdAt,
    },
    {
      actorId,
      salonId,
      targetUserId,
      subscriptionId,
      paymentAttemptId,
      action: "salon_subscription.seat_assign",
      newValue: { seatId: new mongoose.Types.ObjectId(), barberId: targetUserId },
      note: "Assigned another seat",
      requestIp: "203.0.113.11",
      createdAt,
      updatedAt: createdAt,
    },
    {
      actorId: new mongoose.Types.ObjectId(),
      action: "legacy.action",
      oldValue: { email: "private@example.com" },
      note: "Legacy entry",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);

  const result = await listPlatformAuditLogs({
    action: "salon_subscription.seat_assign",
    actorId: String(actorId),
    salonId: String(salonId),
    targetUserId: String(targetUserId),
    subscriptionId: String(subscriptionId),
    paymentAttemptId: String(paymentAttemptId),
    from: "2026-02-01T00:00:00.000Z",
    to: "2026-02-01T23:59:59.999Z",
    page: 1,
    limit: 1,
  });

  assert.equal(result.total, 2);
  assert.equal(result.auditLogs.length, 1);
  assert.equal(
    result.auditLogs[0].id,
    String(String(second._id) > String(first._id) ? second._id : first._id)
  );
  assert.equal(result.auditLogs[0].actor.missing, true);
  assert.equal(result.auditLogs[0].salon.missing, true);
  assert.equal(result.auditLogs[0].targetUser.missing, true);
  assert.equal(result.auditLogs[0].requestIp, undefined);
  assert.equal(result.auditLogs[0].newValue, undefined);
  assert.ok(result.auditLogs[0].changes.after.seatId);

  const legacy = await listPlatformAuditLogs({ action: other.action });
  assert.equal(legacy.auditLogs[0].changes, null);
  const indexes = await PlatformAuditLog.collection.indexes();
  assert.ok(indexes.some((index) => index.key.createdAt === -1 && index.key._id === -1));
});
