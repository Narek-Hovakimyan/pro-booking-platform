import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import RefreshSession from "../../models/RefreshSession.js";
import {
  MAX_REFRESH_TOKEN_LENGTH,
  REFRESH_SESSION_ERROR_CODES,
  REFRESH_SESSION_TTL_MS,
  REFRESH_TOKEN_BYTES,
  RefreshSessionError,
  createRefreshSession,
  generateRefreshToken,
  hashRefreshToken,
  revokeAllUserRefreshSessions,
  revokeRefreshFamily,
  revokeRefreshToken,
  rotateRefreshSession,
} from "./refreshSessionService.js";

const originalMethods = {
  create: RefreshSession.create,
  findOne: RefreshSession.findOne,
  findOneAndUpdate: RefreshSession.findOneAndUpdate,
  updateOne: RefreshSession.updateOne,
  updateMany: RefreshSession.updateMany,
};

afterEach(() => {
  Object.assign(RefreshSession, originalMethods);
});

test("RefreshSession model exposes the required schema contract and indexes", () => {
  const indexes = RefreshSession.schema.indexes();

  assert.equal(RefreshSession.schema.path("tokenHash").options.select, false);
  assert.equal(RefreshSession.schema.path("userId").isRequired, true);
  assert.equal(RefreshSession.schema.path("familyId").isRequired, true);
  assert.equal(RefreshSession.schema.path("expiresAt").isRequired, true);
  assert.equal(RefreshSession.schema.options.timestamps, true);
  assert.ok(indexes.some(([fields, options]) => fields.tokenHash === 1 && options.unique === true));
  assert.ok(indexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
  assert.ok(indexes.some(([fields]) => fields.userId === 1 && fields.revokedAt === 1 && fields.expiresAt === 1));
  assert.ok(indexes.some(([fields]) => fields.familyId === 1 && fields.revokedAt === 1));
});

test("refresh tokens are URL-safe, sufficiently strong, and hash deterministically", () => {
  const first = generateRefreshToken();
  const second = generateRefreshToken();

  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.length >= Math.ceil((REFRESH_TOKEN_BYTES * 8) / 6));
  assert.notEqual(first, second);
  assert.equal(hashRefreshToken(first), hashRefreshToken(first));
  assert.notEqual(hashRefreshToken(first), hashRefreshToken(second));
});

test("invalid refresh-token inputs are rejected without leaking secrets", () => {
  const oversizedToken = "a".repeat(MAX_REFRESH_TOKEN_LENGTH + 1);

  for (const value of [undefined, null, "", "   ", 42, oversizedToken]) {
    assert.throws(
      () => hashRefreshToken(value),
      (error) =>
        error instanceof RefreshSessionError &&
        error.code === REFRESH_SESSION_ERROR_CODES.INVALID &&
        !String(error.message).includes("a".repeat(16))
    );
  }
});

test("createRefreshSession stores only a hash, preserves/generates family metadata, and bounds request metadata", async () => {
  const now = new Date("2026-07-22T10:00:00.000Z");
  const writes = [];
  RefreshSession.create = async (document) => {
    writes.push(document);
    return { ...document, _id: "session-1" };
  };

  const explicitFamily = await createRefreshSession({
    userId: "user-1",
    familyId: "family-1",
    parentSessionId: "parent-1",
    userAgent: `  ${"u".repeat(600)}  `,
    ip: `  ${"1".repeat(200)}  `,
    now,
  });
  const generatedFamily = await createRefreshSession({ userId: "user-2", now });

  assert.equal(writes[0].familyId, "family-1");
  assert.equal(writes[0].parentSessionId, "parent-1");
  assert.equal(writes[0].expiresAt.toISOString(), new Date(now.getTime() + REFRESH_SESSION_TTL_MS).toISOString());
  assert.equal(writes[0].createdByIp.length, 128);
  assert.equal(writes[0].userAgent.length, 512);
  assert.ok(!("refreshToken" in writes[0]));
  assert.equal(hashRefreshToken(explicitFamily.refreshToken), writes[0].tokenHash);
  assert.match(generatedFamily.session.familyId, /^[0-9a-f-]{36}$/i);
});

test("rotateRefreshSession atomically claims the old session, creates a linked replacement, and keeps raw tokens out of writes", async () => {
  const now = new Date("2026-07-22T12:00:00.000Z");
  const oldToken = "active-token";
  const writes = [];
  const claimedSession = {
    _id: "session-old",
    userId: "user-1",
    familyId: "family-1",
    userAgent: "agent-a",
  };

  RefreshSession.findOneAndUpdate = async (filter, update) => {
    writes.push({ type: "claim", filter, update });
    return claimedSession;
  };
  RefreshSession.create = async (document) => {
    writes.push({ type: "create", document });
    return { ...document, _id: "session-new" };
  };
  RefreshSession.updateOne = async (filter, update) => {
    writes.push({ type: "link", filter, update });
    return { modifiedCount: 1 };
  };

  const result = await rotateRefreshSession({
    refreshToken: oldToken,
    userAgent: "agent-b",
    ip: "10.0.0.5",
    now,
  });

  assert.deepEqual(writes[0].filter, {
    tokenHash: hashRefreshToken(oldToken),
    revokedAt: null,
    expiresAt: { $gt: now },
  });
  assert.equal(writes[0].update.$set.revokedReason, "rotated");
  assert.equal(writes[0].update.$set.lastUsedIp, "10.0.0.5");
  assert.equal(writes[1].document.userId, "user-1");
  assert.equal(writes[1].document.familyId, "family-1");
  assert.equal(writes[1].document.parentSessionId, "session-old");
  assert.equal(hashRefreshToken(result.refreshToken), writes[1].document.tokenHash);
  assert.notEqual(result.refreshToken, oldToken);
  assert.deepEqual(writes[2], {
    type: "link",
    filter: { _id: "session-old" },
    update: { $set: { replacedBySessionId: "session-new" } },
  });
  assert.equal(JSON.stringify(writes).includes(oldToken), false);
  assert.equal(JSON.stringify(writes).includes(result.refreshToken), false);
});

test("rotateRefreshSession rejects unknown, expired, and reused tokens with stable codes", async () => {
  const now = new Date("2026-07-22T13:00:00.000Z");
  const updateOneCalls = [];
  const updateManyCalls = [];
  const tokens = {
    unknown: "unknown-token",
    expired: "expired-token",
    revoked: "revoked-token",
  };
  const expiredHash = hashRefreshToken(tokens.expired);
  const revokedHash = hashRefreshToken(tokens.revoked);

  RefreshSession.findOneAndUpdate = async () => null;
  RefreshSession.findOne = async ({ tokenHash }) => {
    if (tokenHash === expiredHash) {
      return { _id: "expired-session", familyId: "family-expired", expiresAt: new Date(now.getTime() - 1000), revokedAt: null };
    }
    if (tokenHash === revokedHash) {
      return { _id: "revoked-session", familyId: "family-reused", expiresAt: new Date(now.getTime() + 1000), revokedAt: now };
    }
    return null;
  };
  RefreshSession.updateOne = async (filter, update) => {
    updateOneCalls.push({ filter, update });
    return { modifiedCount: 1 };
  };
  RefreshSession.updateMany = async (filter, update) => {
    updateManyCalls.push({ filter, update });
    return { modifiedCount: 2 };
  };

  await assert.rejects(() => rotateRefreshSession({ refreshToken: tokens.unknown, now }), (error) => error.code === REFRESH_SESSION_ERROR_CODES.INVALID);
  await assert.rejects(() => rotateRefreshSession({ refreshToken: tokens.expired, now }), (error) => error.code === REFRESH_SESSION_ERROR_CODES.EXPIRED);
  await assert.rejects(() => rotateRefreshSession({ refreshToken: tokens.revoked, now }), (error) => error.code === REFRESH_SESSION_ERROR_CODES.REUSE_DETECTED);
  assert.deepEqual(updateOneCalls[0], {
    filter: { _id: "expired-session", revokedAt: null },
    update: {
      $set: {
        revokedAt: now,
        revokedReason: "expired",
        lastUsedAt: now,
        lastUsedIp: "",
      },
    },
  });
  assert.deepEqual(updateManyCalls[0], {
    filter: { familyId: "family-reused", revokedAt: null, expiresAt: { $gt: now } },
    update: { $set: { revokedAt: now, revokedReason: "reuse_detected" } },
  });
});

test("a second rotation attempt cannot create a second replacement and replacement-create failures stay fail-closed", async () => {
  const now = new Date("2026-07-22T14:00:00.000Z");
  const oldToken = "single-use-token";
  const failingToken = "failing-token";
  const writes = [];
  let claimCount = 0;
  const failingHash = hashRefreshToken(failingToken);

  RefreshSession.findOneAndUpdate = async (filter) => {
    if (filter.tokenHash === failingHash) {
      return { _id: "session-failing", userId: "user-2", familyId: "family-2", userAgent: "agent-b" };
    }

    claimCount += 1;
    return claimCount === 1
      ? { _id: "session-old", userId: "user-1", familyId: "family-1", userAgent: "agent-a" }
      : null;
  };
  RefreshSession.findOne = async () => ({
    _id: "session-old",
    familyId: "family-1",
    expiresAt: new Date(now.getTime() + 1000),
    revokedAt: now,
  });
  RefreshSession.create = async (document) => {
    writes.push(document);
    if (writes.length === 2) {
      throw new Error("replacement create failed");
    }
    return { ...document, _id: "session-new" };
  };
  RefreshSession.updateOne = async () => ({ modifiedCount: 1 });
  RefreshSession.updateMany = async () => ({ modifiedCount: 1 });

  await rotateRefreshSession({ refreshToken: oldToken, now });
  await assert.rejects(
    () => rotateRefreshSession({ refreshToken: oldToken, now }),
    (error) => error.code === REFRESH_SESSION_ERROR_CODES.REUSE_DETECTED
  );
  await assert.rejects(
    () => rotateRefreshSession({ refreshToken: failingToken, now }),
    /replacement create failed/
  );
  assert.equal(writes.length, 2);
  assert.equal(JSON.stringify(writes).includes(oldToken), false);
});

test("revocation helpers affect only active sessions and reject unsupported reasons", async () => {
  const now = new Date("2026-07-22T15:00:00.000Z");
  const updateOneCalls = [];
  const updateManyCalls = [];
  let updateOneResult = { modifiedCount: 1 };

  RefreshSession.updateOne = async (filter, update) => {
    updateOneCalls.push({ filter, update });
    return updateOneResult;
  };
  RefreshSession.updateMany = async (filter, update) => {
    updateManyCalls.push({ filter, update });
    return { modifiedCount: 3 };
  };

  assert.equal(await revokeRefreshToken({ refreshToken: "logout-token", now }), true);
  updateOneResult = { modifiedCount: 0 };
  assert.equal(await revokeRefreshToken({ refreshToken: "logout-token", now }), false);
  assert.deepEqual(updateOneCalls[0], {
    filter: { tokenHash: hashRefreshToken("logout-token"), revokedAt: null, expiresAt: { $gt: now } },
    update: { $set: { revokedAt: now, revokedReason: "logout" } },
  });
  assert.deepEqual(await revokeRefreshFamily({ familyId: "family-1", reason: "logout_all", now }), { revokedCount: 3 });
  assert.deepEqual(await revokeAllUserRefreshSessions({ userId: "user-1", reason: "password_reset", now }), { revokedCount: 3 });
  assert.deepEqual(updateManyCalls[0], {
    filter: { familyId: "family-1", revokedAt: null, expiresAt: { $gt: now } },
    update: { $set: { revokedAt: now, revokedReason: "logout_all" } },
  });
  assert.deepEqual(updateManyCalls[1], {
    filter: { userId: "user-1", revokedAt: null, expiresAt: { $gt: now } },
    update: { $set: { revokedAt: now, revokedReason: "password_reset" } },
  });
  await assert.rejects(() => revokeRefreshToken({ refreshToken: "x", reason: "bad", now }), /Unsupported/);
  await assert.rejects(() => revokeRefreshFamily({ familyId: "family-1", reason: "bad", now }), /Unsupported/);
  await assert.rejects(() => revokeAllUserRefreshSessions({ userId: "user-1", reason: "logout", now }), /Unsupported/);
});
