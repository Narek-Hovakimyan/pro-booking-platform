import User from "../../models/User.js";
import { getLogger, safeErrorSerializer } from "../../config/logger.js";
import { revokeAllUserRefreshSessions } from "./refreshSessionService.js";

let dependencies = {
  User,
  revokeAllUserRefreshSessions,
};

export function __setAuthInvalidationDependencies(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function __resetAuthInvalidationDependencies() {
  dependencies = {
    User,
    revokeAllUserRefreshSessions,
  };
}

function assertUserId(userId) {
  if (!userId) {
    throw new TypeError("userId is required.");
  }
}

export function normalizeInvalidationAuthVersion(value, { allowMissing = false } = {}) {
  if (value === undefined) {
    if (allowMissing) return 0;
    throw new TypeError("authVersion must be a non-negative integer.");
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError("authVersion must be a non-negative integer.");
  }

  return value;
}

export async function incrementUserAuthVersion(userId) {
  assertUserId(userId);

  const result = await dependencies.User.updateOne(
    { _id: userId },
    { $inc: { authVersion: 1 } }
  );

  if (!result?.matchedCount) {
    throw new Error("Authentication invalidation failed");
  }

  return true;
}

export async function revokeAllUserRefreshSessionsBestEffort({
  userId,
  reason,
  event,
} = {}) {
  try {
    await dependencies.revokeAllUserRefreshSessions({ userId, reason });
    return true;
  } catch (error) {
    getLogger().child({ component: "auth-invalidation" }).error(
      { event: event || "auth.refresh_session_cleanup_failed", err: safeErrorSerializer(error) },
      "Authentication invalidation cleanup failed"
    );
    return false;
  }
}

