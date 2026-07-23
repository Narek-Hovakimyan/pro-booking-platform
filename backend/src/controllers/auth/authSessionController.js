import User from "../../models/User.js";
import {
  REFRESH_SESSION_ERROR_CODES,
  RefreshSessionError,
  revokeAllUserRefreshSessions,
  revokeRefreshFamily,
  revokeRefreshToken,
  normalizeRefreshSessionAuthVersion,
  rotateRefreshSession,
} from "../../services/auth/refreshSessionService.js";
import {
  incrementUserAuthVersion,
  revokeAllUserRefreshSessionsBestEffort,
} from "../../services/auth/authInvalidationService.js";
import { serializeAuthUser, signAccessToken } from "../../services/auth/authResponseService.js";
import {
  clearRuntimeRefreshCookie,
  readRuntimeRefreshToken,
  setRuntimeRefreshCookie,
} from "../../services/auth/authSessionCookieService.js";
import { getLogger, safeErrorSerializer } from "../../config/logger.js";

const REFRESH_FAILURE_BODY = {
  message: "Session expired",
  code: "AUTH_REFRESH_FAILED",
};
const REFRESH_FAILURE_CODES = new Set(Object.values(REFRESH_SESSION_ERROR_CODES));

let dependencies = {
  User,
  rotateRefreshSession,
  revokeRefreshToken,
  revokeRefreshFamily,
  revokeAllUserRefreshSessions,
  incrementUserAuthVersion,
  revokeAllUserRefreshSessionsBestEffort,
  readRuntimeRefreshToken,
  setRuntimeRefreshCookie,
  clearRuntimeRefreshCookie,
  signAccessToken,
  serializeAuthUser,
};

export function __setAuthSessionControllerDependencies(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function __resetAuthSessionControllerDependencies() {
  dependencies = {
    User,
    rotateRefreshSession,
    revokeRefreshToken,
    revokeRefreshFamily,
    revokeAllUserRefreshSessions,
    incrementUserAuthVersion,
    revokeAllUserRefreshSessionsBestEffort,
    readRuntimeRefreshToken,
    setRuntimeRefreshCookie,
    clearRuntimeRefreshCookie,
    signAccessToken,
    serializeAuthUser,
  };
}

function getUserAgent(req) {
  return typeof req.get === "function" ? req.get("user-agent") : req.headers?.["user-agent"];
}

function clearCookieSafely(res) {
  try {
    dependencies.clearRuntimeRefreshCookie(res);
  } catch {
    // Response helpers can fail in exceptional states; controller still returns generic errors.
  }
}

function logSessionError(event, error) {
  getLogger().child({ component: "auth-session" }).error(
    { event, err: safeErrorSerializer(error) },
    "Authentication session operation failed"
  );
}

function isRefreshSessionFailure(error) {
  return error instanceof RefreshSessionError || REFRESH_FAILURE_CODES.has(error?.code);
}

function findUserById(userId) {
  return dependencies.User.findById(userId).select("-password +authVersion");
}

function authVersionsMatch(session, user) {
  try {
    return normalizeRefreshSessionAuthVersion(session?.authVersion, { allowMissing: true }) ===
      normalizeRefreshSessionAuthVersion(user?.authVersion, { allowMissing: true });
  } catch {
    return false;
  }
}

export async function refreshAuthSession(req, res) {
  const refreshToken = dependencies.readRuntimeRefreshToken(req);

  if (!refreshToken) {
    clearCookieSafely(res);
    return res.status(401).json(REFRESH_FAILURE_BODY);
  }

  try {
    const replacement = await dependencies.rotateRefreshSession({
      refreshToken,
      ip: req.ip,
      userAgent: getUserAgent(req),
    });
    const user = await findUserById(replacement.session.userId);

    if (!user) {
      await dependencies.revokeRefreshFamily({
        familyId: replacement.session.familyId,
        reason: "user_deleted",
      });
      clearCookieSafely(res);
      return res.status(401).json(REFRESH_FAILURE_BODY);
    }

    if (!authVersionsMatch(replacement.session, user)) {
      await dependencies.revokeRefreshFamily({
        familyId: replacement.session.familyId,
        reason: "auth_version_mismatch",
      });
      clearCookieSafely(res);
      return res.status(401).json(REFRESH_FAILURE_BODY);
    }

    const token = dependencies.signAccessToken(user);
    const publicUser = dependencies.serializeAuthUser(user);
    dependencies.setRuntimeRefreshCookie(res, replacement.refreshToken);

    return res.status(200).json({ token, user: publicUser });
  } catch (error) {
    clearCookieSafely(res);

    if (isRefreshSessionFailure(error)) {
      return res.status(401).json(REFRESH_FAILURE_BODY);
    }

    logSessionError("auth.refresh_failed", error);
    return res.status(500).json({ message: "Session refresh failed" });
  }
}

export async function logoutAuthSession(req, res) {
  try {
    const refreshToken = dependencies.readRuntimeRefreshToken(req);

    if (refreshToken) {
      try {
        await dependencies.revokeRefreshToken({ refreshToken, reason: "logout" });
      } catch (error) {
        if (!isRefreshSessionFailure(error)) {
          throw error;
        }
      }
    }

    dependencies.clearRuntimeRefreshCookie(res);
    return res.status(204).end();
  } catch (error) {
    clearCookieSafely(res);
    logSessionError("auth.logout_failed", error);
    return res.status(500).json({ message: "Logout failed" });
  }
}

export async function logoutAllAuthSessions(req, res) {
  try {
    await dependencies.incrementUserAuthVersion(req.user?._id);
    await dependencies.revokeAllUserRefreshSessionsBestEffort({
      userId: req.user?._id,
      reason: "logout_all",
      event: "auth.logout_all_cleanup_failed",
    });
    dependencies.clearRuntimeRefreshCookie(res);
    return res.status(204).end();
  } catch (error) {
    clearCookieSafely(res);
    logSessionError("auth.logout_all_failed", error);
    return res.status(500).json({ message: "Logout failed" });
  }
}
