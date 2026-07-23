import jwt from "jsonwebtoken";

export const ACCESS_TOKEN_EXPIRES_IN = "30d";

export class AccessTokenError extends Error {
  constructor(message = "Access token is invalid.") {
    super(message);
    this.name = "AccessTokenError";
  }
}

function accessTokenError() {
  return new AccessTokenError();
}

export function normalizeAuthVersion(value, { allowMissing = false } = {}) {
  if (value === undefined) {
    if (allowMissing) return 0;
    throw accessTokenError();
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw accessTokenError();
  }

  return value;
}

function getUserId(user) {
  if (!user || typeof user !== "object" || Array.isArray(user) || !user._id) {
    throw new TypeError("user._id is required for access-token signing.");
  }

  const userId = String(user._id).trim();
  if (!userId) {
    throw new TypeError("user._id is required for access-token signing.");
  }

  return userId;
}

export function signAccessTokenForUser(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      id: getUserId(user),
      av: normalizeAuthVersion(user.authVersion, { allowMissing: true }),
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

export function verifyAccessToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw accessTokenError();
  }

  const decoded = jwt.verify(token.trim(), process.env.JWT_SECRET);

  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw accessTokenError();
  }

  const id = typeof decoded.id === "string" ? decoded.id.trim() : "";
  if (!id) {
    throw accessTokenError();
  }

  return {
    ...decoded,
    id,
    av: normalizeAuthVersion(decoded.av),
  };
}

export function assertAccessTokenMatchesUser(decodedToken, user) {
  if (!user) {
    throw accessTokenError();
  }

  const tokenVersion = normalizeAuthVersion(decodedToken?.av);
  const userVersion = normalizeAuthVersion(user.authVersion, { allowMissing: true });

  if (tokenVersion !== userVersion) {
    throw accessTokenError();
  }

  return true;
}
