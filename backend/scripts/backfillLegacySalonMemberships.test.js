import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackfillPlan,
  runBackfill,
  writeBackfillPlan,
} from "./backfillLegacySalonMemberships.js";

const salonId = "64b000000000000000000001";
const userId = "64b000000000000000000002";
const salon = { _id: salonId, ownerId: "64b000000000000000000003", admins: [] };
const user = (overrides = {}) => ({
  _id: userId,
  __v: 0,
  role: "barber",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  salon: salonId,
  salonStatus: "approved",
  salons: [],
  city: "unchanged",
  ...overrides,
});
const exactMembership = {
  salon: salonId,
  status: "approved",
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  isPrimary: true,
  relationshipType: "staff",
  relationshipStatus: "accepted",
  worksAsSpecialist: true,
};

test("plan is dry-run-safe for empty, exact, none, malformed, orphan, and conflicting records", () => {
  const records = [
    user({ salon: null, salonStatus: "none", salons: [] }),
    user({ _id: "64b000000000000000000009", salon: null, salonStatus: "pending", salons: [] }),
    user({ _id: "64b000000000000000000004", salons: [exactMembership] }),
    user({ _id: "64b000000000000000000005", salonStatus: "none", salons: [] }),
    user({ _id: "64b000000000000000000006", salon: "bad", salons: [] }),
    user({ _id: "64b000000000000000000007", salon: "64b000000000000000000099", salons: [] }),
    user({ _id: "64b000000000000000000008", salons: [{ salon: salonId }, { salon: salonId }] }),
  ];
  const { result, plans } = buildBackfillPlan({ users: records, salons: [salon] });
  assert.equal(plans.length, 0);
  assert.deepEqual(result, {
    mode: "dry-run", scanned: 7, eligible: 0, wouldCreate: 0, created: 0, existing: 1,
    skipped: 1, malformed: 2, orphan: 1, ambiguous: 1, conflicts: 1, concurrentChanged: 0,
  });
});

test("plan rejects multiple primary, accepted mismatch, newer canonical state, and ambiguous latest request", () => {
  const primary = { ...exactMembership, salon: "64b000000000000000000010" };
  const cases = [
    user({ salons: [exactMembership, primary] }),
    user({ salonStatus: "pending" }),
    user({ salons: [{ ...exactMembership, status: "pending", relationshipStatus: "pending", isPrimary: false }] }),
  ];
  const requests = [{
    _id: "64b000000000000000000011", barberId: userId, salonId, status: "accepted",
    createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02"),
  }];
  const [multiplePrimary, acceptedMismatch, canonicalNewer] = cases;
  const allSalons = [salon, { ...salon, _id: primary.salon }];
  const first = buildBackfillPlan({ users: [multiplePrimary], salons: allSalons }).result;
  const second = buildBackfillPlan({ users: [acceptedMismatch], salons: allSalons, joinRequests: requests }).result;
  const third = buildBackfillPlan({ users: [canonicalNewer], salons: allSalons }).result;
  assert.equal(first.ambiguous, 1);
  assert.equal(second.conflicts, 1);
  assert.equal(third.conflicts, 1);
  const result = buildBackfillPlan({ users: cases, salons: allSalons, joinRequests: requests }).result;
  assert.equal(result.ambiguous, 1);
  assert.equal(result.conflicts, 2);
});

test("admin-boundary records are blocked and cannot be planned as staff", () => {
  const { result, plans } = buildBackfillPlan({
    users: [user()],
    salons: [{ ...salon, admins: [userId] }],
    mode: "write",
  });
  assert.equal(result.ambiguous, 1);
  assert.equal(result.wouldCreate, 0);
  assert.equal(plans.length, 0);
});

test("write uses the exact snapshot CAS and changes only salons plus version", async () => {
  const { plans } = buildBackfillPlan({ users: [user()], salons: [salon], mode: "write" });
  const calls = [];
  const session = { async withTransaction(callback) { await callback(); }, async endSession() {} };
  const writes = await writeBackfillPlan({
    plans,
    UserModel: { updateOne: async (...args) => { calls.push(args); return { modifiedCount: 1 }; } },
    startSession: async () => session,
  });
  assert.equal(writes, 1);
  assert.deepEqual(calls[0][1], { $set: { salons: [exactMembership] }, $inc: { __v: 1 } });
  assert.equal(Object.hasOwn(calls[0][1].$set, "city"), false);
  assert.equal(calls[0][0].salon, salonId);
  assert.equal(calls[0][0].salonStatus, "approved");
});

test("CAS loss aborts the transaction and runBackfill performs zero writes in dry-run", async () => {
  const { plans } = buildBackfillPlan({ users: [user()], salons: [salon] });
  const session = { async withTransaction(callback) { await callback(); }, async endSession() {} };
  await assert.rejects(
    writeBackfillPlan({ plans, UserModel: { updateOne: async () => ({ modifiedCount: 0 }) }, startSession: async () => session }),
    (error) => error.code === "CONCURRENT_CHANGED"
  );
  let writes = 0;
  const result = await runBackfill({
    argv: [], environment: { MONGO_URI: "mongodb://127.0.0.1/test" },
    connect: async () => {}, disconnect: async () => {}, getUsers: async () => [user()],
    getSalons: async () => [salon], getJoinRequests: async () => [],
    writePlan: async () => { writes += 1; },
  });
  assert.equal(result.wouldCreate, 1);
  assert.equal(result.created, 0);
  assert.equal(writes, 0);
});

test("write mode creates once, preserves legacy fields, and second run is idempotent", async () => {
  const record = user();
  let writes = 0;
  const execute = async (argv) => runBackfill({
    argv, environment: { MONGO_URI: "mongodb://127.0.0.1/test" }, connect: async () => {}, disconnect: async () => {},
    getUsers: async () => [record], getSalons: async () => [salon], getJoinRequests: async () => [],
    writePlan: async ({ plans }) => {
      if (plans.length === 0) return 0;
      writes += 1;
      record.salons = [plans[0].membership];
      record.__v += 1;
      return 1;
    },
  });
  const first = await execute(["--write"]);
  const second = await execute(["--write"]);
  assert.equal(first.created, 1);
  assert.equal(second.existing, 1);
  assert.equal(second.created, 0);
  assert.equal(writes, 1);
  assert.equal(record.salon, salonId);
  assert.equal(record.salonStatus, "approved");
});
