import User from "../models/User.js";
import {
  assertAccessTokenMatchesUser,
  verifyAccessToken,
} from "../services/auth/accessTokenService.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select("-password +authVersion");

    if (!user) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    assertAccessTokenMatchesUser(decoded, user);

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

/**
 * Optional authentication middleware.
 * - If no Authorization header: continue with req.user undefined.
 * - If valid Bearer token: populate req.user and continue.
 * - If invalid/malformed token: 401 (consistent with protect).
 *
 * Use for routes that behave differently for authenticated vs anonymous users.
 */
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  /* No auth header → continue as anonymous */
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select("-password +authVersion");

    if (user) {
      assertAccessTokenMatchesUser(decoded, user);
      req.user = user;
    }

    return next();
  } catch {
    /* Invalid token → consistent with project style */
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};
