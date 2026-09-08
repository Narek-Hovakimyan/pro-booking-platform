import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { listPlatformAuditLogs } from "./platformAuditReadService.js";
import { serializePlatformAuditChanges } from "./platformAuditSerializer.js";

const originals = {
  countDocuments: PlatformAuditLog.countDocuments,
  find: PlatformAuditLog.find,
  userFind: User.find,
  salonFind: Salon.find,
};

const query = (value) => ({ select: () => ({ lean: async () => value }) });

afterEach(() => {
  PlatformAuditLog.countDocuments = originals.countDocuments;
  PlatformAuditLog.find = originals.find;
  User.find = originals.userFind;
  Salon.find = originals.salonFind;
});

test("serializes only allowlisted scalar audit changes", () => {
  const changes = serializePlatformAuditChanges({
    action: "salon_subscription.payment_confirm",
    oldValue: { status: "pending", paidAt: new Date("2026-01-01"), secret: "no" },
    newValue: {
      status: "paid",
      paidAt: new Date("2026-01-02"),
      confirmedAt: new Date("2026-01-02"),
      subscriptionStatus: "active",
      providerPayload: { token: "no" },
    },
  });

  assert.deepEqual(changes, {
    before: { status: "pending", paidAt: "2026-01-01T00:00:00.000Z" },
    after: {
      status: "paid",
      paidAt: "2026-01-02T00:00:00.000Z",
      confirmedAt: "2026-01-02T00:00:00.000Z",
      subscriptionStatus: "active",
    },
  });
  assert.equal(serializePlatformAuditChanges({ action: "legacy.action", oldValue: { email: "x" } }), null);
  assert.equal(
    serializePlatformAuditChanges({ action: "salon_subscription.activate", oldValue: "bad" }),
    null
  );
});

test("lists a minimized, paginated audit DTO with batched references", async () => {
  const actorId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  const auditId = new mongoose.Types.ObjectId();
  let capturedFilter;
  let capturedSort;
  let capturedSkip;
  let capturedLimit;

  PlatformAuditLog.countDocuments = async (filter) => {
    capturedFilter = filter;
    return 1;
  };
  PlatformAuditLog.find = (filter) => {
    capturedFilter = filter;
    return {
      sort(sort) {
        capturedSort = sort;
        return this;
      },
      skip(skip) {
        capturedSkip = skip;
        return this;
      },
      limit(limit) {
        capturedLimit = limit;
        return this;
      },
      lean: async () => [{
        _id: auditId,
        actorId,
        targetUserId,
        salonId,
        action: "salon_subscription.seat_assign",
        oldValue: { token: "hidden" },
        newValue: { seatId: new mongoose.Types.ObjectId(), barberId: targetUserId, email: "hidden" },
        note: "Required operational reason",
        requestIp: "127.0.0.1",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      }],
    };
  };
  User.find = () => query([{ _id: actorId, name: "Actor" }]);
  Salon.find = () => query([]);

  const result = await listPlatformAuditLogs({
    action: "salon_subscription.seat_assign",
    actorId: String(actorId),
    page: "2",
    limit: "500",
  });

  assert.equal(result.total, 1);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 100);
  assert.deepEqual(capturedSort, { createdAt: -1, _id: -1 });
  assert.equal(capturedSkip, 100);
  assert.equal(capturedLimit, 100);
  assert.equal(String(capturedFilter.actorId), String(actorId));
  const log = result.auditLogs[0];
  assert.deepEqual(log.actor, { id: String(actorId), name: "Actor" });
  assert.deepEqual(log.targetUser, { id: String(targetUserId), name: null, missing: true });
  assert.deepEqual(log.salon, { id: String(salonId), name: null, missing: true });
  assert.deepEqual(Object.keys(log).sort(), ["action", "actor", "changes", "createdAt", "id", "note", "salon", "targetUser"]);
  assert.equal(log.requestIp, undefined);
  assert.equal(log.oldValue, undefined);
  assert.equal(log.newValue, undefined);
  assert.equal(log.changes.after.email, undefined);

  const ordinaryPage = await listPlatformAuditLogs({ page: "1", limit: "20" });
  assert.equal(ordinaryPage.page, 1);
  assert.equal(ordinaryPage.limit, 20);
  assert.equal(capturedSkip, 0);
  assert.equal(capturedLimit, 20);
});

test("rejects invalid audit filters and accepts an empty action", async () => {
  await assert.rejects(
    () => listPlatformAuditLogs({ actorId: "not-an-id" }),
    { statusCode: 400 }
  );
  await assert.rejects(
    () => listPlatformAuditLogs({ from: "invalid-date" }),
    { statusCode: 400 }
  );
  await assert.rejects(
    () => listPlatformAuditLogs({ from: "2026-02-02", to: "2026-02-01" }),
    { statusCode: 400 }
  );

  PlatformAuditLog.countDocuments = async () => 0;
  PlatformAuditLog.find = () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) });
  const result = await listPlatformAuditLogs({ action: "   " });
  assert.deepEqual(result.auditLogs, []);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
});

test("rejects malformed audit pagination before querying Mongo", async () => {
  const invalidValues = [
    ["page", ""], ["limit", ""],
    ["page", " "], ["limit", " "],
    ["page", "1.0"], ["limit", "20.0"],
    ["page", "1.5"], ["limit", "20.5"],
    ["page", "Infinity"], ["limit", "Infinity"],
    ["page", "-Infinity"], ["limit", "-Infinity"],
    ["page", "NaN"], ["limit", "NaN"],
    ["page", "0"], ["limit", "0"],
    ["page", "-1"], ["limit", "-1"],
    ["page", "1e2"], ["limit", "1e2"],
    ["page", "10abc"], ["limit", "20abc"],
    ["page", "999999999999999999999999999999999999999999999999999999"],
    ["limit", "999999999999999999999999999999999999999999999999999999"],
    ["page", String(Number.MAX_SAFE_INTEGER)],
  ];
  let queryCount = 0;
  PlatformAuditLog.countDocuments = async () => { queryCount++; return 0; };
  PlatformAuditLog.find = () => { queryCount++; throw new Error("query must not run"); };

  for (const [field, value] of invalidValues) {
    await assert.rejects(
      () => listPlatformAuditLogs({ [field]: value }),
      { statusCode: 400, message: "Pagination page and limit must be positive integers" }
    );
  }
  assert.equal(queryCount, 0);
});
