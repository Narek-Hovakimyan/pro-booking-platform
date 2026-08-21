const ISSUE_TYPES = [
  "legacySalonWithoutCanonicalMatch",
  "legacyStatusWithoutSalon",
  "salonWithNoneStatus",
  "conflictingLegacyAndCanonicalSalon",
  "conflictingLegacyAndCanonicalStatus",
  "duplicateCanonicalMemberships",
  "multiplePrimaryApprovedMemberships",
  "malformedLegacySalonId",
  "malformedCanonicalSalonId",
  "orphanLegacySalonReference",
  "orphanCanonicalSalonReference",
  "missingOrInvalidRelationshipType",
  "legacyApprovedChairRenterConflict",
  "nonBarberLegacyMembership",
  "legacyOnlyAuthorizationCandidate",
  "canonicalLegacyDisagreement",
  "safeEquivalentRecord",
];

const RECOGNIZED_STATUSES = new Set(["pending", "approved", "rejected"]);
const VALID_RELATIONSHIP_TYPES = new Set(["staff", "chair_renter"]);
const BLOCKING_ISSUE_TYPES = new Set(
  ISSUE_TYPES.filter((issueType) => issueType !== "safeEquivalentRecord")
);

const stableValue = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableValue(value[key])}`
    ).join(",")}}`;
  }

  return JSON.stringify(String(value));
};

const getRawId = (value) => {
  if (value === null || value === undefined) return null;

  try {
    if (typeof value === "object" && /^[a-fA-F0-9]{24}$/.test(String(value))) {
      return String(value);
    }
    if (typeof value === "object" && value._id !== undefined) return value._id;
    if (typeof value === "object" && value.id !== undefined) return value.id;
  } catch {
    return value;
  }

  return value;
};

const getIdString = (value) => {
  const rawValue = getRawId(value);
  if (rawValue === null || rawValue === undefined) return "";

  try {
    return String(rawValue);
  } catch {
    return "[unstringifiable-id]";
  }
};

const normalizeObjectId = (value) => {
  const stringId = getIdString(value);
  return /^[a-fA-F0-9]{24}$/.test(stringId) ? stringId.toLowerCase() : "";
};

const reportId = (value) => getIdString(value) || null;
const reportStatus = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return String(value);
  } catch {
    return "[unstringifiable-status]";
  }
};
const hasLegacySalon = (user) => reportId(user?.salon) !== null;
const hasMeaningfulLegacyStatus = (user) => {
  const status = reportStatus(user?.salonStatus);
  return status !== null && status !== "" && status !== "none";
};
const getEntries = (user) => Array.isArray(user?.salons) ? user.salons : [];
const idSortValue = (value) => normalizeObjectId(value) || `malformed:${reportId(value) || ""}`;
const booleanSortValue = (value) => value === true ? "true" : value === false ? "false" : "missing";

const summarizeEntry = (entry) => ({
  canonicalSalon: reportId(entry?.salon),
  canonicalStatus: reportStatus(entry?.status),
  relationshipType: reportStatus(entry?.relationshipType),
  isPrimary: entry?.isPrimary === true,
  worksAsSpecialist: entry?.worksAsSpecialist === true
    ? true
    : entry?.worksAsSpecialist === false
      ? false
      : null,
});

const membershipSortKey = (entry) => [
  idSortValue(entry?.salon),
  reportStatus(entry?.status) || "",
  reportStatus(entry?.relationshipType) || "",
  booleanSortValue(entry?.isPrimary),
  booleanSortValue(entry?.worksAsSpecialist),
].join("\u0000");

const sortEntries = (entries) => [...entries].sort((left, right) =>
  membershipSortKey(left).localeCompare(membershipSortKey(right))
);

const getApplicableEntry = (entries) => {
  const ordered = sortEntries(entries);
  return ordered.find((entry) => entry?.status === "approved" && entry?.isPrimary) ||
    ordered.find((entry) => entry?.status === "approved") ||
    ordered.find((entry) => entry?.isPrimary) ||
    ordered[0] ||
    null;
};

const findingBase = (user) => ({
  userId: reportId(user?._id) || "",
  role: reportStatus(user?.role),
  legacySalon: reportId(user?.salon),
  legacyStatus: reportStatus(user?.salonStatus),
});

const findingSortKey = (finding) => [
  finding.userId || "",
  finding.legacySalon || "",
  finding.legacyStatus || "",
  finding.canonicalSalon || "",
  finding.canonicalStatus || "",
  finding.relationshipType || "",
  String(finding.isPrimary),
  String(finding.worksAsSpecialist),
  finding.reason || "",
  stableValue(finding),
].join("\u0000");

const isRecognizedStatus = (status) => RECOGNIZED_STATUSES.has(status);

export const auditIssueTypes = ISSUE_TYPES;

export const collectSalonReferenceIds = (users = []) => {
  const ids = new Set();

  for (const user of users) {
    const legacyId = normalizeObjectId(user?.salon);
    if (legacyId) ids.add(legacyId);

    for (const entry of getEntries(user)) {
      const canonicalId = normalizeObjectId(entry?.salon);
      if (canonicalId) ids.add(canonicalId);
    }
  }

  return [...ids].sort();
};

export const buildLegacySalonAuditReport = ({
  users = [],
  salons = [],
  generatedAt = new Date().toISOString(),
} = {}) => {
  const existingSalonIds = new Set(
    salons.map((salon) => normalizeObjectId(salon?._id || salon)).filter(Boolean)
  );
  const findings = Object.fromEntries(ISSUE_TYPES.map((issueType) => [issueType, []]));
  const findingKeys = new Set();
  const usersWithLegacyFields = new Set();
  const usersWithCanonicalMemberships = new Set();

  const addFinding = (issueType, finding) => {
    const key = `${issueType}\u0000${stableValue(finding)}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings[issueType].push(finding);
  };

  for (const user of users) {
    const base = findingBase(user);
    const entries = sortEntries(getEntries(user));
    const legacySalonPresent = hasLegacySalon(user);
    const legacyStatusMeaningful = hasMeaningfulLegacyStatus(user);
    const legacyId = normalizeObjectId(user?.salon);
    const legacyStatus = reportStatus(user?.salonStatus);
    const userIssueTypes = new Set();
    const addUserFinding = (issueType, finding = {}) => {
      userIssueTypes.add(issueType);
      addFinding(issueType, { ...base, ...finding });
    };

    if (legacySalonPresent || legacyStatusMeaningful) usersWithLegacyFields.add(base.userId);
    if (entries.length > 0) usersWithCanonicalMemberships.add(base.userId);

    if (legacySalonPresent && !legacyId) addUserFinding("malformedLegacySalonId");
    if (legacyStatusMeaningful && !legacySalonPresent) addUserFinding("legacyStatusWithoutSalon");
    if (legacySalonPresent && legacyStatus === "none") addUserFinding("salonWithNoneStatus");
    if (user?.role !== "barber" && (legacySalonPresent || legacyStatusMeaningful)) {
      addUserFinding("nonBarberLegacyMembership");
    }

    const canonicalById = new Map();
    for (const entry of entries) {
      const canonicalId = normalizeObjectId(entry?.salon);
      const summary = summarizeEntry(entry);

      if (!canonicalId) {
        addUserFinding("malformedCanonicalSalonId", summary);
        continue;
      }

      const matchingEntries = canonicalById.get(canonicalId) || [];
      matchingEntries.push(entry);
      canonicalById.set(canonicalId, matchingEntries);

      if (!existingSalonIds.has(canonicalId)) {
        addUserFinding("orphanCanonicalSalonReference", summary);
      }
      if (!VALID_RELATIONSHIP_TYPES.has(summary.relationshipType)) {
        addUserFinding("missingOrInvalidRelationshipType", summary);
      }
    }

    for (const [canonicalId, matchingEntries] of canonicalById) {
      if (matchingEntries.length > 1) {
        addUserFinding("duplicateCanonicalMemberships", {
          canonicalSalon: canonicalId,
          duplicateCount: matchingEntries.length,
        });
      }
    }

    const primaryApprovedEntries = entries.filter(
      (entry) => entry?.status === "approved" && entry?.isPrimary === true
    );
    if (primaryApprovedEntries.length > 1) {
      addUserFinding("multiplePrimaryApprovedMemberships", {
        primaryApprovedCount: primaryApprovedEntries.length,
      });
    }

    const matchingEntries = legacyId ? canonicalById.get(legacyId) || [] : [];
    const matchingEntry = matchingEntries[0] || null;
    const applicableEntry = getApplicableEntry(entries);
    const applicableId = normalizeObjectId(applicableEntry?.salon);

    if (legacyId && matchingEntries.length === 0) addUserFinding("legacySalonWithoutCanonicalMatch");
    if (legacyId && !existingSalonIds.has(legacyId)) addUserFinding("orphanLegacySalonReference");

    if (legacyId && applicableId && legacyId !== applicableId) {
      addUserFinding("conflictingLegacyAndCanonicalSalon", summarizeEntry(applicableEntry));
    }

    for (const entry of matchingEntries) {
      const summary = summarizeEntry(entry);
      if (legacyStatus !== null && legacyStatus !== summary.canonicalStatus) {
        addUserFinding("conflictingLegacyAndCanonicalStatus", summary);
      }
      if (legacyStatus === "approved" && summary.relationshipType === "chair_renter") {
        addUserFinding("legacyApprovedChairRenterConflict", summary);
      }
    }

    if (
      legacyStatus === "approved" &&
      legacyId &&
      !matchingEntries.some((entry) => reportStatus(entry?.status) === "approved")
    ) {
      addUserFinding("legacyOnlyAuthorizationCandidate");
    }

    if (matchingEntry) {
      const summary = summarizeEntry(matchingEntry);
      const hasUnknownMatchingStatus =
        !isRecognizedStatus(legacyStatus) || !isRecognizedStatus(summary.canonicalStatus);
      if (hasUnknownMatchingStatus && legacyStatus !== "none") {
        addUserFinding("canonicalLegacyDisagreement", {
          ...summary,
          reason: "missing or unrecognized matching status",
        });
      } else if (
        legacyStatus === "approved" &&
        summary.relationshipType === "staff" &&
        summary.worksAsSpecialist !== true
      ) {
        addUserFinding("canonicalLegacyDisagreement", {
          ...summary,
          reason: "legacy approved status ignores canonical worksAsSpecialist",
        });
      }
    }

    const safeEntry = matchingEntries.length === 1 ? matchingEntry : null;
    const safeSummary = safeEntry ? summarizeEntry(safeEntry) : null;
    const isSafeEquivalent = Boolean(
      legacyId &&
      safeEntry &&
      existingSalonIds.has(legacyId) &&
      isRecognizedStatus(legacyStatus) &&
      legacyStatus === safeSummary.canonicalStatus &&
      VALID_RELATIONSHIP_TYPES.has(safeSummary.relationshipType) &&
      (legacyStatus !== "approved" || (
        safeSummary.relationshipType === "staff" &&
        safeSummary.worksAsSpecialist === true
      )) &&
      userIssueTypes.size === 0
    );

    if (isSafeEquivalent) addFinding("safeEquivalentRecord", { ...base, ...safeSummary });
  }

  for (const issueType of ISSUE_TYPES) {
    findings[issueType].sort((left, right) =>
      findingSortKey(left).localeCompare(findingSortKey(right))
    );
  }

  const summary = Object.fromEntries(
    ISSUE_TYPES.map((issueType) => [issueType, findings[issueType].length])
  );
  const totalIssueCount = ISSUE_TYPES
    .filter((issueType) => BLOCKING_ISSUE_TYPES.has(issueType))
    .reduce((count, issueType) => count + findings[issueType].length, 0);

  return {
    generatedAt,
    readOnly: true,
    scannedUserCount: users.length,
    usersWithLegacyFieldsCount: usersWithLegacyFields.size,
    usersWithCanonicalMembershipsCount: usersWithCanonicalMemberships.size,
    totalIssueCount,
    hasBlockingIssues: totalIssueCount > 0,
    summary,
    findings,
  };
};

const migrationStatuses = new Set(["pending", "approved", "rejected"]);
const joinRequestStatuses = new Set(["pending", "accepted", "rejected", "cancelled"]);
const requestStatusForMembership = { pending: "pending", approved: "accepted", rejected: "rejected" };
const relationshipStatusForMembership = { pending: "pending", approved: "accepted", rejected: "rejected" };
const dateValue = (value) => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
};
const latestRequestFor = (requests, userId, salonId) => {
  const matching = (requests || []).filter((request) => normalizeObjectId(request?.barberId) === userId && normalizeObjectId(request?.salonId) === salonId);
  if (!matching.length) return {};
  const ordered = matching.map((request) => ({ request, updatedAt: dateValue(request?.updatedAt), createdAt: dateValue(request?.createdAt), id: normalizeObjectId(request?._id) || "" }))
    .sort((a, b) => (b.updatedAt - a.updatedAt) || (b.createdAt - a.createdAt) || b.id.localeCompare(a.id));
  const first = ordered[0];
  if (first.updatedAt === null || first.createdAt === null || !first.id || ordered.filter((item) => item.updatedAt === first.updatedAt && item.createdAt === first.createdAt && item.id === first.id).length !== 1 || !joinRequestStatuses.has(first.request?.status)) {
    return { reason: "ambiguousLatestJoinRequest" };
  }
  return { request: first.request, requestId: first.id };
};
const membershipForLegacy = (user, salon, status) => ({ salon, status, joinedAt: status === "approved" && user?.createdAt ? user.createdAt : null, isPrimary: status === "approved", relationshipType: "staff", relationshipStatus: relationshipStatusForMembership[status], worksAsSpecialist: status !== "rejected" });
const exactMembership = (entry, expected) => normalizeObjectId(entry?.salon) === expected.salon && entry?.status === expected.status && entry?.isPrimary === expected.isPrimary && entry?.relationshipType === expected.relationshipType && entry?.relationshipStatus === expected.relationshipStatus && entry?.worksAsSpecialist === expected.worksAsSpecialist;

/** Shared, fail-closed migration classifier. Legacy data can only represent staff. */
export const classifyLegacySalonMembership = ({ user, salons = [], joinRequests = [] } = {}) => {
  const legacySalon = normalizeObjectId(user?.salon);
  const legacyStatus = reportStatus(user?.salonStatus);
  const entries = getEntries(user);
  const snapshot = { userId: reportId(user?._id), version: Number.isInteger(user?.__v) ? user.__v : null, salon: user?.salon ?? null, salonStatus: user?.salonStatus ?? null, salons: user?.salons };
  const blockers = [];
  const add = (reason) => { if (!blockers.includes(reason)) blockers.push(reason); };
  const result = (state, reason, membership = null, requestId = null) => ({ state, reason, membership, snapshot, blockers: state === "eligible" || state === "existing" || state === "skipped" ? [] : blockers.length ? blockers : [reason], references: { salonId: legacySalon || null, requestId } });
  if (!legacySalon && !hasLegacySalon(user)) return legacyStatus && legacyStatus !== "none" ? result("malformed", "legacyStatusWithoutSalon") : result("skipped", "noLegacySalon");
  if (!legacySalon) return result("malformed", "malformedLegacySalonId");
  if (!migrationStatuses.has(legacyStatus)) return result("ambiguous", legacyStatus === "none" ? "legacyNoneCannotMigrate" : "invalidLegacyStatus");
  if (user?.role !== "barber") return result("ambiguous", "nonBarberLegacyMembership");
  const salon = (salons || []).find((candidate) => normalizeObjectId(candidate?._id) === legacySalon);
  if (!salon) return result("orphan", "orphanLegacySalonReference");
  if (normalizeObjectId(salon.ownerId) === normalizeObjectId(user?._id)) add("legacyOwnerBoundary");
  if (Array.isArray(salon.admins) && salon.admins.some((adminId) => normalizeObjectId(adminId) === normalizeObjectId(user?._id))) add("legacyAdminBoundary");
  if (!Array.isArray(user?.salons) && user?.salons !== undefined && user?.salons !== null) add("malformedCanonicalMemberships");
  const ids = entries.map((entry) => normalizeObjectId(entry?.salon));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) add("duplicateOrMalformedCanonicalMembership");
  if (entries.filter((entry) => entry?.status === "approved" && entry?.isPrimary === true).length > 1) add("multiplePrimaryApprovedMemberships");
  const latest = latestRequestFor(joinRequests, normalizeObjectId(user?._id), legacySalon);
  if (latest.reason) add(latest.reason);
  else if (latest.request && latest.request.status !== requestStatusForMembership[legacyStatus]) add(latest.request.status === "accepted" ? "acceptedJoinRequestMismatch" : "latestJoinRequestStateMismatch");
  if (blockers.length) {
    const reason = blockers[0];
    const state = reason === "duplicateOrMalformedCanonicalMembership" || reason === "canonicalStateConflictsWithLegacy" || reason.endsWith("Mismatch") ? "conflict" : "ambiguous";
    return result(state, reason, null, latest.requestId || null);
  }
  const membership = membershipForLegacy(user, legacySalon, legacyStatus);
  if (!entries.length) return result("eligible", "legacyStateProven", membership);
  if (entries.length === 1 && exactMembership(entries[0], membership)) return result("existing", "canonicalMembershipAlreadyExact", membership);
  add("canonicalStateConflictsWithLegacy");
  return result("conflict", "canonicalStateConflictsWithLegacy", membership, latest.requestId || null);
};

export const buildLegacySalonMigrationAudit = ({ users = [], salons = [], joinRequests = [] } = {}) => {
  const summary = { scanned: 0, eligible: 0, existing: 0, skipped: 0, malformed: 0, orphan: 0, ambiguous: 0, conflicts: 0 };
  const blockers = [];
  for (const user of users) {
    const decision = classifyLegacySalonMembership({ user, salons, joinRequests });
    summary.scanned += 1;
    const counter = decision.state === "conflict" ? "conflicts" : decision.state;
    if (Object.hasOwn(summary, counter)) summary[counter] += 1;
    if (decision.blockers.length) blockers.push({ userId: decision.snapshot.userId, ...decision.references, reasons: [...decision.blockers].sort() });
  }
  blockers.sort((a, b) => `${a.userId}\u0000${a.salonId || ""}\u0000${a.requestId || ""}\u0000${a.reasons.join("\u0000")}`.localeCompare(`${b.userId}\u0000${b.salonId || ""}\u0000${b.requestId || ""}\u0000${b.reasons.join("\u0000")}`));
  return { ...summary, hasBlockingIssues: summary.malformed + summary.orphan + summary.ambiguous + summary.conflicts > 0, blockers };
};
