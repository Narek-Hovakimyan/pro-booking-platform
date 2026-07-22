import {
  clearRefreshCookie,
  readRefreshTokenFromCookieHeader,
  resolveRefreshCookieOptions,
  setRefreshCookie,
} from "../../utils/authCookie.js";

function getRuntimeSameSite() {
  const configuredSameSite = process.env.AUTH_REFRESH_COOKIE_SAME_SITE;
  return typeof configuredSameSite === "string" && configuredSameSite.trim()
    ? configuredSameSite.trim()
    : "lax";
}

export function resolveRuntimeRefreshCookieOptions() {
  return resolveRefreshCookieOptions({
    nodeEnv: process.env.NODE_ENV,
    sameSite: getRuntimeSameSite(),
  });
}

export function readRuntimeRefreshToken(req) {
  const options = resolveRuntimeRefreshCookieOptions();

  return readRefreshTokenFromCookieHeader(req, {
    nodeEnv: process.env.NODE_ENV,
    sameSite: options.sameSite,
  });
}

export function setRuntimeRefreshCookie(res, refreshToken) {
  const options = resolveRuntimeRefreshCookieOptions();

  return setRefreshCookie(res, refreshToken, {
    nodeEnv: process.env.NODE_ENV,
    sameSite: options.sameSite,
  });
}

export function clearRuntimeRefreshCookie(res) {
  const options = resolveRuntimeRefreshCookieOptions();

  return clearRefreshCookie(res, {
    nodeEnv: process.env.NODE_ENV,
    sameSite: options.sameSite,
  });
}
