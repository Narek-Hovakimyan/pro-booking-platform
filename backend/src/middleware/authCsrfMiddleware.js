const DEFAULT_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function parseOrigin(value, { allowPath = false } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const trimmedValue = value.trim();
    const url = new URL(trimmedValue);

    if (url.username || url.password) {
      return null;
    }

    if (!allowPath && trimmedValue !== url.origin) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  const configuredOrigins = String(process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => parseOrigin(origin, { allowPath: true }))
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    configuredOrigins.push(...DEFAULT_DEVELOPMENT_ORIGINS);
  }

  return new Set(configuredOrigins);
}

function reject(res) {
  return res.status(403).json({ message: "Forbidden" });
}

export function requireAuthCookieRequestSecurity(req, res, next) {
  if (req.get("x-hairbook-csrf") !== "1") {
    return reject(res);
  }

  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.size === 0) {
    return reject(res);
  }

  const originHeader = req.get("origin");
  const refererHeader = req.get("referer");
  const requestOrigin = originHeader
    ? parseOrigin(originHeader)
    : parseOrigin(refererHeader, { allowPath: true });

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    return reject(res);
  }

  return next();
}
