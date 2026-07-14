import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  SALON_AUDIT_PROJECTION,
  USER_AUDIT_PROJECTION,
  runAudit,
} from "./auditLegacySalonFields.js";
import {
  auditIssueTypes,
  buildLegacySalonAuditReport,
  collectSalonReferenceIds,
} from "./auditLegacySalonFieldsHelpers.js";

const salonA = "64b000000000000000000001";
const salonB = "64b000000000000000000002";
const salonC = "64b000000000000000000003";
const at = "2026-07-14T00:00:00.000Z";

const entry = (salon, overrides = {}) => ({
  salon,
  status: "approved",
  relationshipType: "staff",
  isPrimary: true,
  worksAsSpecialist: true,
  ...overrides,
});

const user = (id, overrides = {}) => ({
  _id: id.padStart(24, "0"),
  role: "barber",
  salon: salonA,
  salonStatus: "approved",
  salons: [entry(salonA)],
  ...overrides,
});

const report = (users, salons = [{ _id: salonA }, { _id: salonB }, { _id: salonC }]) =>
  buildLegacySalonAuditReport({ users, salons, generatedAt: at });

const issue = (result, issueType) => result.findings[issueType];
const safeUserIds = (result) => new Set(issue(result, "safeEquivalentRecord").map(({ userId }) => userId));

const assertReportShape = (result) => {
  assert.equal(result.generatedAt, at);
  assert.equal(result.readOnly, true);
  assert.equal(Object.hasOwn(result, "summary"), true);
  assert.equal(Object.hasOwn(result, "summaryCounts"), false);
  assert.deepEqual(Object.keys(result.findings), auditIssueTypes);
  assert.deepEqual(Object.keys(result.summary), auditIssueTypes);

  for (const issueType of auditIssueTypes) {
    assert.ok(Array.isArray(result.findings[issueType]));
    assert.equal(result.summary[issueType], result.findings[issueType].length);
  }

  const blockingCount = auditIssueTypes
    .filter((issueType) => issueType !== "safeEquivalentRecord")
    .reduce((total, issueType) => total + result.findings[issueType].length, 0);
  assert.equal(result.totalIssueCount, blockingCount);
  assert.equal(result.hasBlockingIssues, blockingCount > 0);
};

test("always creates all report categories and keeps safe equivalents non-blocking", () => {
  const result = report([user("1")]);

  assertReportShape(result);
  assert.equal(result.totalIssueCount, 0);
  assert.equal(result.hasBlockingIssues, false);
  assert.equal(issue(result, "safeEquivalentRecord").length, 1);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("classifies every required issue category without status conversion", () => {
  const result = report([
    user("1", { salons: [] }),
    user("2", { salon: null, salonStatus: "pending", salons: [] }),
    user("3", { salonStatus: "none", salons: [] }),
    user("4", { salons: [entry(salonB)] }),
    user("5", { salons: [entry(salonA, { status: "pending" })] }),
    user("6", { salons: [entry(salonA), entry(salonA, { isPrimary: false })] }),
    user("7", { salons: [entry(salonA), entry(salonB)] }),
    user("8", { salon: "not-an-object-id", salons: [] }),
    user("9", { salons: [entry(null)] }),
    user("10", { salon: salonC, salons: [entry(salonC)] }),
    user("11", { salons: [entry(salonC)] }),
    user("12", { salons: [entry(salonA, { relationshipType: undefined })] }),
    user("13", { salons: [entry(salonA, { relationshipType: "chair_renter" })] }),
    user("14", { role: "client", salons: [] }),
    user("15", { salons: [entry(salonA, { status: "pending" })] }),
    user("16", { salons: [entry(salonA, { worksAsSpecialist: false })] }),
    user("17"),
  ], [{ _id: salonA }, { _id: salonB }]);

  assertReportShape(result);
  for (const issueType of auditIssueTypes) {
    assert.ok(issue(result, issueType).length > 0, `${issueType} should have a finding`);
  }
  assert.equal(issue(result, "salonWithNoneStatus")[0].legacyStatus, "none");
  assert.ok(issue(result, "conflictingLegacyAndCanonicalStatus").some(
    (finding) => finding.canonicalStatus === "pending"
  ));
});

test("does not classify missing, unknown, none, or incomplete approved memberships as safe", () => {
  const result = report([
    user("1", { salonStatus: undefined, salons: [entry(salonA, { status: undefined })] }),
    user("2", { salonStatus: "unknown", salons: [entry(salonA, { status: "unknown" })] }),
    user("3", { salonStatus: "none", salons: [entry(salonA, { status: "pending" })] }),
    user("4", { salons: [entry(salonA, { relationshipType: undefined })] }),
    user("5", { salons: [entry(salonA, { worksAsSpecialist: undefined })] }),
    user("6", { salons: [entry(salonA, { worksAsSpecialist: false })] }),
    user("7", { salons: [entry(salonA, { relationshipType: "chair_renter" })] }),
    user("8", { salons: [entry(salonA, { relationshipType: "owner" })] }),
    user("9", { salons: [entry(salonA, { relationshipType: "admin" })] }),
  ]);
  const safeIds = safeUserIds(result);

  for (let id = 1; id <= 9; id += 1) {
    assert.equal(safeIds.has(String(id).padStart(24, "0")), false);
  }
  assert.ok(issue(result, "canonicalLegacyDisagreement").some(
    (finding) => finding.reason === "missing or unrecognized matching status"
  ));
  assert.ok(issue(result, "legacyApprovedChairRenterConflict").length > 0);
  assert.ok(issue(result, "missingOrInvalidRelationshipType").length >= 3);
});

test("preserves material duplicate details and is independent of canonical array order", () => {
  const memberships = [
    entry(salonC, { status: "pending", isPrimary: false, worksAsSpecialist: false }),
    entry(salonC, { status: "rejected", relationshipType: "chair_renter", isPrimary: true }),
  ];
  const first = report([user("1", { salons: memberships })], [{ _id: salonA }]);
  const second = report([user("1", { salons: [...memberships].reverse() })], [{ _id: salonA }]);

  assert.deepEqual(first.findings, second.findings);
  assert.deepEqual(first.summary, second.summary);
  assert.equal(issue(first, "orphanCanonicalSalonReference").length, 2);
  assert.equal(issue(first, "conflictingLegacyAndCanonicalStatus").length, 0);
  assert.equal(issue(first, "duplicateCanonicalMemberships").length, 1);
  assert.ok(issue(first, "orphanCanonicalSalonReference").some(
    (finding) => finding.relationshipType === "chair_renter"
  ));
  assert.deepEqual(
    new Set(issue(first, "orphanCanonicalSalonReference").map(({ canonicalStatus }) => canonicalStatus)),
    new Set(["pending", "rejected"])
  );
});

test("handles ObjectIds, malformed values, malformed arrays, and duplicate malformed IDs safely", () => {
  const objectId = new mongoose.Types.ObjectId(salonA);
  const fixtures = [
    user("1", { salon: objectId, salons: [entry(salonA)] }),
    user("2", { salon: { malformed: true }, salons: [] }),
    user("3", { salons: [entry({ malformed: true }), entry({ malformed: true })] }),
    user("4", { salons: null }),
    user("5", { salons: { malformed: true } }),
  ];
  const before = JSON.stringify(fixtures);
  const result = report(fixtures);

  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(JSON.stringify(fixtures), before);
  assert.ok(issue(result, "safeEquivalentRecord").some(
    (finding) => finding.userId === "000000000000000000000001" && finding.legacySalon === salonA
  ));
  assert.equal(issue(result, "malformedLegacySalonId").length, 1);
  assert.equal(issue(result, "malformedCanonicalSalonId").length, 1);
  assert.deepEqual(collectSalonReferenceIds(fixtures), [salonA]);
});

test("findings exclude sensitive fixture fields", () => {
  const result = report([user("1", {
    password: "secret",
    accessToken: "access",
    refreshToken: "refresh",
    resetPasswordToken: "reset",
    oauthSecret: "oauth",
    email: "private@example.com",
    phone: "123",
    salons: [entry(salonA, {
      defaultSchedule: { startTime: "09:00" },
      staffPayment: { type: "commission" },
      relationshipRequestedBy: "requester",
      relationshipRequestedAt: "requested-at",
      relationshipRespondedAt: "reviewed-at",
      requestedBy: "requested-by",
      requestedAt: "requested-time",
      reviewedBy: "reviewed-by",
      reviewedAt: "reviewed-time",
      rejectionReason: "private-reason",
      privateMetadata: { internal: "private-nested" },
    })],
  })]);
  const serialized = JSON.stringify(result);

  for (const value of [
    "secret", "access", "refresh", "reset", "oauth", "private@example.com", "123",
    "09:00", "commission", "requester", "requested-at", "reviewed-at", "requested-by",
    "requested-time", "reviewed-by", "reviewed-time", "private-reason", "private-nested",
  ]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("uses narrow projections and testable JSON-only orchestration", async () => {
  assert.equal(
    USER_AUDIT_PROJECTION,
    "_id role salon salonStatus salons.salon salons.status salons.relationshipType salons.isPrimary salons.worksAsSpecialist"
  );
  assert.equal(SALON_AUDIT_PROJECTION, "_id");

  const events = [];
  const stdout = [];
  const stderr = [];
  const exitCodes = [];
  await runAudit({
    connect: async () => events.push("connect"),
    disconnect: async () => events.push("disconnect"),
    getUsers: async () => [user("1", { salons: [] })],
    getSalons: async (ids) => {
      events.push(`salons:${ids.join(",")}`);
      return [{ _id: salonA }];
    },
    buildReport: ({ users, salons }) => buildLegacySalonAuditReport({ users, salons, generatedAt: at }),
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
  });

  assert.deepEqual(events, ["connect", `salons:${salonA}`, "disconnect"]);
  assert.equal(stdout.length, 1);
  const emittedReport = JSON.parse(stdout[0]);
  assert.equal(emittedReport.hasBlockingIssues, true);
  assert.deepEqual(stderr, []);
  assert.deepEqual(exitCodes, []);
});

test("orchestration sends errors to stderr, sets non-zero state, and disconnects after failures", async () => {
  const stdout = [];
  const stderr = [];
  const exitCodes = [];
  let disconnected = false;
  await runAudit({
    connect: async () => {},
    disconnect: async () => {
      disconnected = true;
    },
    getUsers: async () => {
      throw new Error("query failed");
    },
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
  });

  assert.equal(disconnected, true);
  assert.deepEqual(stdout, []);
  assert.equal(stderr.length, 1);
  assert.deepEqual(exitCodes, [1]);

  const connectionFailureCodes = [];
  await runAudit({
    connect: async () => {
      throw new Error("configuration failed");
    },
    disconnect: async () => {
      throw new Error("should not disconnect");
    },
    writeStdout: () => assert.fail("stdout must remain empty"),
    writeStderr: () => {},
    setExitCode: (code) => connectionFailureCodes.push(code),
  });
  assert.deepEqual(connectionFailureCodes, [1]);
});

test("disconnect failure preserves the single successful JSON document", async () => {
  const stdout = [];
  const stderr = [];
  const exitCodes = [];
  let disconnectCalls = 0;
  await runAudit({
    connect: async () => {},
    disconnect: async () => {
      disconnectCalls += 1;
      throw new Error("disconnect marker");
    },
    getUsers: async () => [user("1")],
    getSalons: async () => [{ _id: salonA }],
    buildReport: ({ users, salons }) => buildLegacySalonAuditReport({ users, salons, generatedAt: at }),
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
  });

  assert.equal(disconnectCalls, 1);
  assert.equal(stdout.length, 1);
  assert.doesNotThrow(() => JSON.parse(stdout[0]));
  assert.deepEqual(stderr, ["Legacy salon field audit disconnect failed: disconnect marker\n"]);
  assert.deepEqual(exitCodes, [1]);
});

test("classification failure remains identifiable after disconnect", async () => {
  const events = [];
  const stderr = [];
  const exitCodes = [];
  await runAudit({
    connect: async () => events.push("connect"),
    disconnect: async () => events.push("disconnect"),
    getUsers: async () => [],
    getSalons: async () => [],
    buildReport: () => {
      throw new Error("classification marker");
    },
    writeStdout: () => assert.fail("stdout must remain empty"),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
  });

  assert.deepEqual(events, ["connect", "disconnect"]);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(stderr.some((value) => value.includes("classification marker")));
});

test("serialization failure remains identifiable after disconnect", async () => {
  const events = [];
  const stderr = [];
  const exitCodes = [];
  await runAudit({
    connect: async () => events.push("connect"),
    disconnect: async () => events.push("disconnect"),
    getUsers: async () => [],
    getSalons: async () => [],
    buildReport: () => ({ toJSON: () => { throw new Error("serialization marker"); } }),
    writeStdout: () => assert.fail("stdout must remain empty"),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
  });

  assert.deepEqual(events, ["connect", "disconnect"]);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(stderr.some((value) => value.includes("serialization marker")));
});

test("output failure remains identifiable after disconnect", async () => {
  const events = [];
  const stderr = [];
  const exitCodes = [];
  await runAudit({
    connect: async () => events.push("connect"),
    disconnect: async () => events.push("disconnect"),
    getUsers: async () => [user("1")],
    getSalons: async () => [{ _id: salonA }],
    buildReport: ({ users, salons }) => buildLegacySalonAuditReport({ users, salons, generatedAt: at }),
    writeStdout: () => {
      throw new Error("output marker");
    },
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
  });

  assert.deepEqual(events, ["connect", "disconnect"]);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(stderr.some((value) => value.includes("output marker")));
});

test("isPrimary alone preserves distinct deterministic orphan findings", () => {
  const memberships = [
    entry(salonC, { status: "pending", isPrimary: false, worksAsSpecialist: true }),
    entry(salonC, { status: "pending", isPrimary: true, worksAsSpecialist: true }),
  ];
  const first = report([user("1", { salons: memberships })], [{ _id: salonA }]);
  const second = report([user("1", { salons: [...memberships].reverse() })], [{ _id: salonA }]);
  const findings = issue(first, "orphanCanonicalSalonReference");

  assert.deepEqual(first.findings, second.findings);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map(({ isPrimary }) => isPrimary), [false, true]);
});

test("worksAsSpecialist alone preserves distinct deterministic orphan findings", () => {
  const memberships = [
    entry(salonC, { status: "pending", isPrimary: false, worksAsSpecialist: false }),
    entry(salonC, { status: "pending", isPrimary: false, worksAsSpecialist: true }),
  ];
  const first = report([user("1", { salons: memberships })], [{ _id: salonA }]);
  const second = report([user("1", { salons: [...memberships].reverse() })], [{ _id: salonA }]);
  const findings = issue(first, "orphanCanonicalSalonReference");

  assert.deepEqual(first.findings, second.findings);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map(({ worksAsSpecialist }) => worksAsSpecialist), [false, true]);
});

test("user-array order does not alter retained findings or report totals", () => {
  const users = [
    user("1", { salons: [] }),
    user("2", { salon: null, salonStatus: "pending", salons: [] }),
  ];
  const first = report(users);
  const second = report([...users].reverse());

  assert.deepEqual(first.findings, second.findings);
  assert.deepEqual(first.summary, second.summary);
  assert.equal(first.totalIssueCount, second.totalIssueCount);
  assert.equal(first.hasBlockingIssues, second.hasBlockingIssues);
});

test("absent and undefined salons remain deterministic legacy-only candidates", () => {
  const absent = user("1");
  delete absent.salons;
  const fixtures = [absent, user("2", { salons: undefined })];
  const first = report(fixtures);
  const second = report([...fixtures].reverse());

  assert.doesNotThrow(() => JSON.stringify(first));
  assert.deepEqual(first.findings, second.findings);
  assert.equal(issue(first, "safeEquivalentRecord").length, 0);
  assert.equal(issue(first, "legacyOnlyAuthorizationCandidate").length, 2);
});
