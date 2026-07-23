import { createHash, randomBytes, randomUUID } from "node:crypto";

import RefreshSession, {
  REFRESH_SESSION_MAX_IP_LENGTH,
  REFRESH_SESSION_MAX_USER_AGENT_LENGTH,
  REFRESH_SESSION_REVOKE_REASONS,
} from "../../models/RefreshSession.js";

export const REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_BYTES = 32;
export const MAX_REFRESH_TOKEN_LENGTH = 4096;

export const REFRESH_SESSION_ERROR_CODES = {
  INVALID: "REFRESH_TOKEN_INVALID",
  EXPIRED: "REFRESH_TOKEN_EXPIRED",
  REVOKED: "REFRESH_TOKEN_REVOKED",
  REUSE_DETECTED: "REFRESH_TOKEN_REUSE_DETECTED",
};

const USER_WIDE_REVOKE_REASONS = new Set([
  "logout_all",
  "password_change",
  "password_reset",
  "user_disabled",
  "user_deleted",
]);

const TOKEN_REVOKE_REASONS = new Set(["logout"]);

export class RefreshSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RefreshSessionError";
    this.code = code;
  }
}

function createRefreshSessionError(code, message) {
  return new RefreshSessionError(code, message);
}

function normalizeNow(now = new Date()) {
  return now instanceof Date ? new Date(now.getTime()) : new Date(now);
}

function normalizeMetadata(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeFamilyId(familyId) {
  if (familyId === undefined || familyId === null) {
    return randomUUID();
  }

  if (typeof familyId !== "string" || !familyId.trim()) {
    throw new TypeError("familyId must be a non-empty string when provided.");
  }

  return familyId.trim();
}

function assertValidTtl(ttlMs) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError("ttlMs must be a positive number.");
  }
}

function assertRequiredUserId(userId) {
  if (!userId) {
    throw new TypeError("userId is required.");
  }
}

export function normalizeRefreshSessionAuthVersion(value, { allowMissing = false } = {}) {
  if (value === undefined) {
    if (allowMissing) return 0;
    throw new TypeError("authVersion must be a non-negative integer.");
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError("authVersion must be a non-negative integer.");
  }

  return value;
}

function normalizeRawRefreshToken(rawToken) {
  if (typeof rawToken !== "string") {
    throw createRefreshSessionError(
      REFRESH_SESSION_ERROR_CODES.INVALID,
      "Refresh token is invalid."
    );
  }

  const normalizedToken = rawToken.trim();

  if (!normalizedToken || normalizedToken.length > MAX_REFRESH_TOKEN_LENGTH) {
    throw createRefreshSessionError(
      REFRESH_SESSION_ERROR_CODES.INVALID,
      "Refresh token is invalid."
    );
  }

  return normalizedToken;
}

function assertAllowedReason(reason, allowedReasons) {
  if (!REFRESH_SESSION_REVOKE_REASONS.includes(reason) || !allowedReasons.has(reason)) {
    throw new TypeError("Unsupported refresh-session revocation reason.");
  }
}

function buildRevocationUpdate(reason, now) {
  return {
    revokedAt: now,
    revokedReason: reason,
  };
}

export function generateRefreshToken() {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export function hashRefreshToken(rawToken) {
  return createHash("sha256")
    .update(normalizeRawRefreshToken(rawToken))
    .digest("hex");
}

export async function createRefreshSession({
  userId,
  familyId,
  parentSessionId = null,
  authVersion,
  userAgent = "",
  ip = "",
  now = new Date(),
  ttlMs = REFRESH_SESSION_TTL_MS,
} = {}) {
  assertRequiredUserId(userId);
  assertValidTtl(ttlMs);

  const createdAt = normalizeNow(now);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await RefreshSession.create({
    userId,
    familyId: normalizeFamilyId(familyId),
    tokenHash,
    authVersion: normalizeRefreshSessionAuthVersion(authVersion, { allowMissing: true }),
    expiresAt: new Date(createdAt.getTime() + ttlMs),
    parentSessionId,
    createdByIp: normalizeMetadata(ip, REFRESH_SESSION_MAX_IP_LENGTH),
    userAgent: normalizeMetadata(userAgent, REFRESH_SESSION_MAX_USER_AGENT_LENGTH),
  });

  return { refreshToken, session };
}

export async function rotateRefreshSession({
  refreshToken,
  userAgent = "",
  ip = "",
  now = new Date(),
  ttlMs = REFRESH_SESSION_TTL_MS,
} = {}) {
  assertValidTtl(ttlMs);

  const rotatedAt = normalizeNow(now);
  const lastUsedIp = normalizeMetadata(ip, REFRESH_SESSION_MAX_IP_LENGTH);
  const tokenHash = hashRefreshToken(refreshToken);
  const claimFilter = {
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: rotatedAt },
  };
  const claimedSession = await RefreshSession.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        ...buildRevocationUpdate("rotated", rotatedAt),
        lastUsedAt: rotatedAt,
        lastUsedIp,
      },
    },
    {
      new: false,
      projection: "+authVersion",
    }
  );

  if (!claimedSession) {
    const existingSession = await RefreshSession.findOne({ tokenHash });

    if (!existingSession) {
      throw createRefreshSessionError(
        REFRESH_SESSION_ERROR_CODES.INVALID,
        "Refresh token is invalid."
      );
    }

    if (!existingSession.revokedAt && existingSession.expiresAt <= rotatedAt) {
      await RefreshSession.updateOne(
        { _id: existingSession._id, revokedAt: null },
        {
          $set: {
            ...buildRevocationUpdate("expired", rotatedAt),
            lastUsedAt: rotatedAt,
            lastUsedIp,
          },
        }
      );

      throw createRefreshSessionError(
        REFRESH_SESSION_ERROR_CODES.EXPIRED,
        "Refresh token has expired."
      );
    }

    await revokeRefreshFamily({
      familyId: existingSession.familyId,
      reason: "reuse_detected",
      now: rotatedAt,
    });

    throw createRefreshSessionError(
      REFRESH_SESSION_ERROR_CODES.REUSE_DETECTED,
      "Refresh token reuse detected."
    );
  }

  const claimedAuthVersion = normalizeRefreshSessionAuthVersion(
    claimedSession.authVersion,
    { allowMissing: true }
  );

  const replacement = await createRefreshSession({
    userId: claimedSession.userId,
    familyId: claimedSession.familyId,
    parentSessionId: claimedSession._id,
    authVersion: claimedAuthVersion,
    userAgent:
      userAgent || claimedSession.userAgent || "",
    ip,
    now: rotatedAt,
    ttlMs,
  });

  await RefreshSession.updateOne(
    { _id: claimedSession._id },
    { $set: { replacedBySessionId: replacement.session._id } }
  );

  return replacement;
}

export async function revokeRefreshToken({
  refreshToken,
  reason = "logout",
  now = new Date(),
} = {}) {
  assertAllowedReason(reason, TOKEN_REVOKE_REASONS);

  const revokedAt = normalizeNow(now);
  const tokenHash = hashRefreshToken(refreshToken);
  const result = await RefreshSession.updateOne(
    {
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: revokedAt },
    },
    { $set: buildRevocationUpdate(reason, revokedAt) }
  );

  return Boolean(result?.modifiedCount);
}

export async function revokeRefreshFamily({
  familyId,
  reason,
  now = new Date(),
} = {}) {
  if (typeof familyId !== "string" || !familyId.trim()) {
    throw new TypeError("familyId is required.");
  }

  assertAllowedReason(reason, new Set(REFRESH_SESSION_REVOKE_REASONS));

  const revokedAt = normalizeNow(now);
  const result = await RefreshSession.updateMany(
    {
      familyId: familyId.trim(),
      revokedAt: null,
      expiresAt: { $gt: revokedAt },
    },
    { $set: buildRevocationUpdate(reason, revokedAt) }
  );

  return { revokedCount: result?.modifiedCount ?? 0 };
}

export async function revokeAllUserRefreshSessions({
  userId,
  reason,
  now = new Date(),
} = {}) {
  assertRequiredUserId(userId);
  assertAllowedReason(reason, USER_WIDE_REVOKE_REASONS);

  const revokedAt = normalizeNow(now);
  const result = await RefreshSession.updateMany(
    {
      userId,
      revokedAt: null,
      expiresAt: { $gt: revokedAt },
    },
    { $set: buildRevocationUpdate(reason, revokedAt) }
  );

  return { revokedCount: result?.modifiedCount ?? 0 };
}
