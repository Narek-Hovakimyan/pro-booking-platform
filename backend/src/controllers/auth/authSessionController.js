import User from "../../models/User.js";
import {
  REFRESH_SESSION_ERROR_CODES,
  RefreshSessionError,
  revokeAllUserRefreshSessions,
  revokeRefreshFamily,
  revokeRefreshToken,
  rotateRefreshSession,
} from "../../services/auth/refreshSessionService.js";
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
    await dependencies.revokeAllUserRefreshSessions({
      userId: req.user?._id,
      reason: "logout_all",
    });
    dependencies.clearRuntimeRefreshCookie(res);
    return res.status(204).end();
  } catch (error) {
    clearCookieSafely(res);
    logSessionError("auth.logout_all_failed", error);
    return res.status(500).json({ message: "Logout failed" });
  }
}
