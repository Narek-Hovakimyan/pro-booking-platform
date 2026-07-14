import test from "node:test";
import assert from "node:assert/strict";

import {
  auditIssueTypes,
  buildLegacySalonAuditReport,
} from "./auditLegacySalonFieldsHelpers.js";

const salonA = "64b000000000000000000001";
const salonB = "64b000000000000000000002";
const salonC = "64b000000000000000000003";
const salons = [{ _id: salonA }, { _id: salonB }];

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

const report = (users, availableSalons = salons, generatedAt = "2026-07-14T00:00:00.000Z") =>
  buildLegacySalonAuditReport({ users, salons: availableSalons, generatedAt });

const cases = [
  ["legacySalonWithoutCanonicalMatch", user("1", { salons: [] }), {}, { legacySalon: salonA }],
  ["legacyStatusWithoutSalon", user("2", { salon: null, salonStatus: "pending", salons: [] }), {}, { legacyStatus: "pending" }],
  ["salonWithNoneStatus", user("3", { salonStatus: "none", salons: [] }), {}, { legacyStatus: "none" }],
  [
    "conflictingLegacyAndCanonicalSalon",
    user("4", { salons: [entry(salonB)] }),
    {},
    { canonicalSalon: salonB, canonicalStatus: "approved" },
  ],
  [
    "conflictingLegacyAndCanonicalStatus",
    user("5", { salons: [entry(salonA, { status: "pending" })] }),
    {},
    { canonicalSalon: salonA, canonicalStatus: "pending" },
  ],
  [
    "duplicateCanonicalMemberships",
    user("6", { salons: [entry(salonA, { isPrimary: false }), entry(salonA)] }),
    {},
    { canonicalSalon: salonA, duplicateCount: 2 },
  ],
  [
    "multiplePrimaryApprovedMemberships",
    user("7", { salons: [entry(salonA), entry(salonB)] }),
    {},
    { primaryApprovedCount: 2 },
  ],
  ["malformedLegacySalonId", user("8", { salon: "malformed", salons: [] }), {}, { legacySalon: "malformed" }],
  ["malformedCanonicalSalonId", user("9", { salons: [entry(null)] }), {}, { canonicalSalon: null }],
  ["orphanLegacySalonReference", user("10", { salon: salonC, salons: [] }), {}, { legacySalon: salonC }],
  [
    "orphanCanonicalSalonReference",
    user("11", { salons: [entry(salonC)] }),
    {},
    { canonicalSalon: salonC },
  ],
  [
    "missingOrInvalidRelationshipType",
    user("12", { salons: [entry(salonA, { relationshipType: undefined })] }),
    {},
    { relationshipType: null },
  ],
  [
    "legacyApprovedChairRenterConflict",
    user("13", { salons: [entry(salonA, { relationshipType: "chair_renter" })] }),
    {},
    { relationshipType: "chair_renter" },
  ],
  ["nonBarberLegacyMembership", user("14", { role: "client", salons: [] }), {}, { role: "client" }],
  [
    "legacyOnlyAuthorizationCandidate",
    user("15", { salons: [entry(salonA, { status: "pending" })] }),
    {},
    { legacyStatus: "approved" },
  ],
  [
    "canonicalLegacyDisagreement",
    user("16", { salons: [entry(salonA, { worksAsSpecialist: false })] }),
    {},
    { reason: "legacy approved status ignores canonical worksAsSpecialist" },
  ],
  ["safeEquivalentRecord", user("17"), {}, { legacySalon: salonA, canonicalSalon: salonA }],
];

for (const [issueType, fixture, options, expected] of cases) {
  test(`classifies ${issueType} from its own intended condition`, () => {
    const result = report([fixture], options.salons || salons);
    const finding = result.findings[issueType][0];

    assert.ok(finding, issueType);
    for (const [key, value] of Object.entries(expected)) assert.equal(finding[key], value);
    assert.equal(result.summary[issueType], result.findings[issueType].length);

    if (issueType === "safeEquivalentRecord") {
      assert.equal(result.totalIssueCount, 0);
      assert.equal(result.hasBlockingIssues, false);
    }
  });
}

test("preserves none without mapping it to pending", () => {
  const result = report([user("18", { salonStatus: "none", salons: [] })]);

  assert.equal(result.findings.salonWithNoneStatus[0].legacyStatus, "none");
  assert.equal(result.findings.conflictingLegacyAndCanonicalStatus.length, 0);
});

test("generatedAt is the only variable report field", () => {
  const fixtures = [user("19", { salons: [entry(salonA, { worksAsSpecialist: false })] })];
  const first = report(fixtures, salons, "2026-07-14T00:00:00.000Z");
  const second = report(fixtures, salons, "2026-07-15T00:00:00.000Z");
  const { generatedAt: firstGeneratedAt, ...firstRest } = first;
  const { generatedAt: secondGeneratedAt, ...secondRest } = second;

  assert.notEqual(firstGeneratedAt, secondGeneratedAt);
  assert.deepEqual(firstRest, secondRest);
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.findings, second.findings);
});

test("all category keys remain available to table-driven verification", () => {
  assert.equal(auditIssueTypes.length, 17);
  assert.deepEqual(new Set(cases.map(([issueType]) => issueType)), new Set(auditIssueTypes));
});

test("specific disagreement categories do not create redundant catch-all findings", () => {
  const overlapCases = [
    {
      issueType: "conflictingLegacyAndCanonicalSalon",
      fixture: user("20", { salons: [entry(salonB)] }),
    },
    {
      issueType: "conflictingLegacyAndCanonicalStatus",
      fixture: user("21", { salons: [entry(salonA, { status: "pending" })] }),
    },
    {
      issueType: "missingOrInvalidRelationshipType",
      fixture: user("22", { salons: [entry(salonA, { relationshipType: undefined })] }),
    },
    {
      issueType: "legacyApprovedChairRenterConflict",
      fixture: user("23", { salons: [entry(salonA, { relationshipType: "chair_renter" })] }),
    },
  ];

  for (const { issueType, fixture } of overlapCases) {
    const result = report([fixture]);
    assert.equal(result.findings[issueType].length, 1, issueType);
    assert.equal(result.findings.canonicalLegacyDisagreement.length, 0, issueType);
  }
});

test("catch-all disagreements retain deterministic reason data", () => {
  const unknownStatus = report([user("24", {
    salonStatus: "unknown",
    salons: [entry(salonA, { status: "unknown" })],
  })]);
  const specialistState = report([user("25", {
    salons: [entry(salonA, { worksAsSpecialist: false })],
  })]);

  assert.deepEqual(
    unknownStatus.findings.canonicalLegacyDisagreement.map(({ reason }) => reason),
    ["missing or unrecognized matching status"]
  );
  assert.deepEqual(
    specialistState.findings.canonicalLegacyDisagreement.map(({ reason }) => reason),
    ["legacy approved status ignores canonical worksAsSpecialist"]
  );
});
