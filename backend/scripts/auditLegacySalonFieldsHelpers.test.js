import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacySalonMigrationAudit,
  classifyLegacySalonMembership,
} from "./auditLegacySalonFieldsHelpers.js";

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
  ...overrides,
});

test("migration classifier maps only a proven legacy staff membership", () => {
  const decision = classifyLegacySalonMembership({ user: user(), salons: [salon] });
  assert.equal(decision.state, "eligible");
  assert.deepEqual(decision.membership, {
    salon: salonId,
    status: "approved",
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    isPrimary: true,
    relationshipType: "staff",
    relationshipStatus: "accepted",
    worksAsSpecialist: true,
  });
  assert.equal(decision.snapshot.version, 0);
});

test("migration classifier preserves none and rejects owner, admin, duplicate, and request ambiguity", () => {
  assert.equal(
    classifyLegacySalonMembership({ user: user({ salonStatus: "none" }), salons: [salon] }).reason,
    "legacyNoneCannotMigrate"
  );
  assert.equal(
    classifyLegacySalonMembership({ user: user({ salons: [{ salon: salonId }, { salon: salonId }] }), salons: [salon] }).reason,
    "duplicateOrMalformedCanonicalMembership"
  );
  assert.equal(
    classifyLegacySalonMembership({ user: user(), salons: [{ ...salon, ownerId: userId }] }).reason,
    "legacyOwnerBoundary"
  );
  assert.equal(
    classifyLegacySalonMembership({ user: user(), salons: [{ ...salon, admins: [userId] }] }).reason,
    "legacyAdminBoundary"
  );
  assert.equal(
    classifyLegacySalonMembership({
      user: user(), salons: [salon],
      joinRequests: [{ _id: "64b000000000000000000004", barberId: userId, salonId, status: "pending", createdAt: new Date(), updatedAt: new Date() }],
    }).reason,
    "latestJoinRequestStateMismatch"
  );
  assert.equal(
    classifyLegacySalonMembership({
      user: user(), salons: [salon],
      joinRequests: [{ barberId: userId, salonId, status: "accepted", createdAt: new Date(), updatedAt: new Date() }],
    }).reason,
    "ambiguousLatestJoinRequest"
  );
});

test("migration audit exposes blockers without weakening legacy findings", () => {
  const report = buildLegacySalonMigrationAudit({
    users: [user(), user({ _id: "64b000000000000000000005", salon: "bad" })],
    salons: [salon],
  });
  assert.deepEqual(report, {
    scanned: 2,
    eligible: 1,
    existing: 0,
    skipped: 0,
    malformed: 1,
    orphan: 0,
    ambiguous: 0,
    conflicts: 0,
    hasBlockingIssues: true,
    blockers: [{
      userId: "64b000000000000000000005",
      salonId: null,
      requestId: null,
      reasons: ["malformedLegacySalonId"],
    }],
  });
});

test("migration classifier uses the latest deterministic join-request state", () => {
  const older = {
    _id: "64b000000000000000000004", barberId: userId, salonId, status: "pending",
    createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
  };
  const newer = {
    _id: "64b000000000000000000005", barberId: userId, salonId, status: "accepted",
    createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02"),
  };
  assert.equal(
    classifyLegacySalonMembership({ user: user(), salons: [salon], joinRequests: [older, newer] }).state,
    "eligible"
  );
  assert.equal(
    classifyLegacySalonMembership({ user: user(), salons: [salon], joinRequests: [newer, older] }).state,
    "eligible"
  );
});

test("migration audit emits deterministic opaque blocker records without losing reasons", () => {
  const accepted = {
    _id: "64b000000000000000000020", barberId: "64b000000000000000000011", salonId, status: "accepted",
    createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02"),
  };
  const ambiguous = {
    barberId: "64b000000000000000000016", salonId, status: "accepted",
    createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02"),
  };
  const records = [
    user({ _id: "64b000000000000000000010", salons: [{ salon: salonId }, { salon: salonId }], name: "private", email: "private@example.test", phone: "private" }),
    user({ _id: "64b000000000000000000011", salonStatus: "pending" }),
    user({ _id: "64b000000000000000000012", salon: "bad" }),
    user({ _id: "64b000000000000000000013", salon: "64b000000000000000000099" }),
    user({ _id: "64b000000000000000000014", salons: [{ salon: salonId, status: "approved", isPrimary: true }, { salon: "64b000000000000000000015", status: "approved", isPrimary: true }] }),
    user({ _id: "64b000000000000000000016" }),
    user({ _id: "64b000000000000000000017" }),
  ];
  const report = buildLegacySalonMigrationAudit({
    users: records,
    salons: [{ ...salon, ownerId: "64b000000000000000000010", admins: ["64b000000000000000000017"] }, { ...salon, _id: "64b000000000000000000015" }],
    joinRequests: [accepted, ambiguous],
  });
  assert.equal(report.blockers.length, report.malformed + report.orphan + report.ambiguous + report.conflicts);
  const byUser = new Map(report.blockers.map((entry) => [entry.userId, entry]));
  assert.deepEqual(byUser.get("64b000000000000000000010").reasons, ["duplicateOrMalformedCanonicalMembership", "legacyOwnerBoundary"]);
  assert.deepEqual(byUser.get("64b000000000000000000011").reasons, ["acceptedJoinRequestMismatch"]);
  assert.deepEqual(byUser.get("64b000000000000000000012").reasons, ["malformedLegacySalonId"]);
  assert.deepEqual(byUser.get("64b000000000000000000013").reasons, ["orphanLegacySalonReference"]);
  assert.ok(byUser.get("64b000000000000000000014").reasons.includes("multiplePrimaryApprovedMemberships"));
  assert.deepEqual(byUser.get("64b000000000000000000016").reasons, ["ambiguousLatestJoinRequest"]);
  assert.deepEqual(byUser.get("64b000000000000000000017").reasons, ["legacyAdminBoundary"]);
  assert.deepEqual(report.blockers, [...report.blockers].sort((left, right) => String(left.userId).localeCompare(String(right.userId))));
  const serialized = JSON.stringify(report.blockers);
  for (const value of ["private@example.test", "private"]) assert.equal(serialized.includes(value), false);
});
