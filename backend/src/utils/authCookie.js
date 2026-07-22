import { REFRESH_SESSION_TTL_MS } from "../services/auth/refreshSessionService.js";

const DEVELOPMENT_REFRESH_COOKIE_NAME = "hairbook-refresh";
const PRODUCTION_REFRESH_COOKIE_NAME = "__Host-hairbook-refresh";
const VALID_SAME_SITE_VALUES = new Set(["lax", "strict", "none"]);

function isProductionEnvironment(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === "production";
}

function normalizeSameSite(sameSite = "lax") {
  if (typeof sameSite !== "string") {
    throw new TypeError("sameSite must be a string.");
  }

  const normalizedValue = sameSite.trim().toLowerCase();

  if (!VALID_SAME_SITE_VALUES.has(normalizedValue)) {
    throw new TypeError("sameSite must be one of: lax, strict, none.");
  }

  return normalizedValue;
}

function resolveSecureOption(options = {}) {
  const secure = options.secure ?? isProductionEnvironment(options.nodeEnv);

  if (isProductionEnvironment(options.nodeEnv) && !secure) {
    throw new TypeError("Invalid refresh-cookie configuration: production cookies must use Secure=true.");
  }

  return secure;
}

export function resolveRefreshCookieName(options = {}) {
  resolveSecureOption(options);

  return isProductionEnvironment(options.nodeEnv)
    ? PRODUCTION_REFRESH_COOKIE_NAME
    : DEVELOPMENT_REFRESH_COOKIE_NAME;
}

export function resolveRefreshCookieOptions(options = {}) {
  const secure = resolveSecureOption(options);
  const sameSite = normalizeSameSite(options.sameSite ?? "lax");

  if (sameSite === "none" && !secure) {
    throw new TypeError("SameSite=None requires Secure=true.");
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: REFRESH_SESSION_TTL_MS,
  };
}

export function setRefreshCookie(res, refreshToken, options = {}) {
  if (!res || typeof res.cookie !== "function") {
    throw new TypeError("res.cookie must be a function.");
  }

  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new TypeError("refreshToken must be a non-empty string.");
  }

  const name = resolveRefreshCookieName(options);
  const cookieOptions = resolveRefreshCookieOptions(options);

  res.cookie(name, refreshToken.trim(), cookieOptions);
  return { name, options: cookieOptions };
}

export function clearRefreshCookie(res, options = {}) {
  if (!res || typeof res.clearCookie !== "function") {
    throw new TypeError("res.clearCookie must be a function.");
  }

  const name = resolveRefreshCookieName(options);
  const cookieOptions = resolveRefreshCookieOptions(options);
  const { maxAge: _maxAge, ...clearOptions } = cookieOptions;

  res.clearCookie(name, clearOptions);
  return { name, options: clearOptions };
}

export function readRefreshTokenFromCookieHeader(req, options = {}) {
  const cookieHeader = req?.headers?.cookie;

  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) {
    return null;
  }

  const targetName = resolveRefreshCookieName(options);
  let matchedValue = null;
  let matches = 0;

  for (const entry of cookieHeader.split(";")) {
    const trimmedEntry = entry.trim();

    if (!trimmedEntry) {
      continue;
    }

    const separatorIndex = trimmedEntry.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const cookieName = trimmedEntry.slice(0, separatorIndex).trim();

    if (cookieName !== targetName) {
      continue;
    }

    matches += 1;

    if (matches > 1) {
      return null;
    }

    const rawValue = trimmedEntry.slice(separatorIndex + 1).trim();

    if (!rawValue) {
      matchedValue = null;
      continue;
    }

    try {
      const decodedValue = decodeURIComponent(rawValue).trim();
      matchedValue = decodedValue || null;
    } catch {
      return null;
    }
  }

  return matches === 1 ? matchedValue : null;
}
