/**
 * Platform admin identity & access control.
 *
 * A user is considered a platform admin if:
 *   1. Authenticated (req.user exists), AND
 *   2a. User has `platformRole === "admin"`, OR
 *   2b. User's email or _id matches the PLATFORM_ADMIN_EMAILS / PLATFORM_ADMIN_IDS env allowlist.
 *
 * The allowlist is a defense-in-depth fallback for bootstrapping/recovery;
 * it does not require a DB platformRole match.
 */

/**
 * Parse a comma-separated env variable into a Set of trimmed, lowered strings.
 */
const parseAllowlist = (envValue) =>
  new Set(
    (envValue || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

const getAdminEmailSet = () => {
  return parseAllowlist(process.env.PLATFORM_ADMIN_EMAILS);
};

const getAdminIdSet = () => {
  return parseAllowlist(process.env.PLATFORM_ADMIN_IDS);
};

/**
 * Kept as a compatibility no-op for tests/imports; allowlists are read live.
 */
export const resetAllowlistCache = () => {};

/**
 * Check if an authenticated user qualifies as a platform admin.
 *
 * @param {Object} user - Express req.user (must have _id, email, platformRole)
 * @returns {boolean}
 */
export const isPlatformAdmin = (user) => {
  if (!user || !user._id) return false;

  // DB-level platform role check
  if (user.platformRole === "admin") return true;

  const email = (user.email || "").toLowerCase().trim();

  if (!email && !user._id) return false;

  const emailSet = getAdminEmailSet();
  const idSet = getAdminIdSet();

  // If no allowlist is configured, only DB role is sufficient
  if (emailSet.size === 0 && idSet.size === 0) return false;

  if (email && emailSet.has(email)) return true;
  if (idSet.has(String(user._id).toLowerCase())) return true;

  return false;
};

/**
 * Express middleware: require the authenticated user to be a platform admin.
 * Must be placed after the `protect` middleware.
 *
 * - Unauthenticated (no req.user): 401
 * - Authenticated but not platform admin: 403
 * - Authenticated platform admin: calls next()
 */
export const requirePlatformAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({
      code: "FORBIDDEN",
      message: "Platform admin access required",
    });
  }

  return next();
};
