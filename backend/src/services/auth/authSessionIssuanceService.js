import {
  REFRESH_SESSION_ERROR_CODES,
  RefreshSessionError,
  createRefreshSession,
  revokeRefreshToken,
} from "./refreshSessionService.js";
import { serializeAuthUser, signAccessToken } from "./authResponseService.js";
import {
  clearRuntimeRefreshCookie,
  readRuntimeRefreshToken,
  resolveRuntimeRefreshCookieOptions,
  setRuntimeRefreshCookie,
} from "./authSessionCookieService.js";
import { getLogger } from "../../config/logger.js";

const REFRESH_FAILURE_CODES = new Set(Object.values(REFRESH_SESSION_ERROR_CODES));

let dependencies = {
  createRefreshSession,
  revokeRefreshToken,
  signAccessToken,
  serializeAuthUser,
  resolveRuntimeRefreshCookieOptions,
  readRuntimeRefreshToken,
  setRuntimeRefreshCookie,
  clearRuntimeRefreshCookie,
};

export function __setAuthSessionIssuanceDependencies(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function __resetAuthSessionIssuanceDependencies() {
  dependencies = {
    createRefreshSession,
    revokeRefreshToken,
    signAccessToken,
    serializeAuthUser,
    resolveRuntimeRefreshCookieOptions,
    readRuntimeRefreshToken,
    setRuntimeRefreshCookie,
    clearRuntimeRefreshCookie,
  };
}

function isKnownRefreshFailure(error) {
  return error instanceof RefreshSessionError || REFRESH_FAILURE_CODES.has(error?.code);
}

function issuanceError() {
  return new Error("Authentication session issuance failed");
}

function logCleanupFailure() {
  getLogger().child({ component: "auth-session-issuance" }).error(
    { event: "auth.refresh_cookie_cleanup_failed", failure: "cleanup" },
    "Authentication session cleanup failed"
  );
}

function requestMetadata(req) {
  return {
    ip: req?.ip,
    userAgent:
      typeof req?.get === "function" ? req.get("user-agent") : req?.headers?.["user-agent"],
  };
}

export async function issueAuthSession({ req, res, user } = {}) {
  if (!user?._id) {
    throw new TypeError("user._id is required for authentication session issuance.");
  }

  const token = dependencies.signAccessToken(user);
  const publicUser = dependencies.serializeAuthUser(user);
  dependencies.resolveRuntimeRefreshCookieOptions();

  const existingRefreshToken = dependencies.readRuntimeRefreshToken(req);

  if (existingRefreshToken) {
    try {
      await dependencies.revokeRefreshToken({
        refreshToken: existingRefreshToken,
        reason: "logout",
      });
    } catch (error) {
      if (!isKnownRefreshFailure(error)) {
        throw issuanceError();
      }
    }
  }

  let replacement;
  try {
    replacement = await dependencies.createRefreshSession({
      userId: user._id,
      authVersion: user.authVersion,
      ...requestMetadata(req),
    });
  } catch {
    throw issuanceError();
  }

  try {
    dependencies.setRuntimeRefreshCookie(res, replacement.refreshToken);
  } catch {
    try {
      await dependencies.revokeRefreshToken({
        refreshToken: replacement.refreshToken,
        reason: "logout",
      });
    } catch {
      logCleanupFailure();
    }

    try {
      dependencies.clearRuntimeRefreshCookie(res);
    } catch {
      logCleanupFailure();
    }

    throw issuanceError();
  }

  return { token, user: publicUser };
}
