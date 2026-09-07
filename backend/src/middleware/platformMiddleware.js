/**
 * Platform superuser identity & access control.
 *
 * A user is considered a platform superuser if:
 *   1. Authenticated (req.user exists), AND
 *   2a. User has `platformRole === "superuser"`, OR
 *   2b. User's verified email or _id matches the PLATFORM_ADMIN_EMAILS / PLATFORM_ADMIN_IDS env allowlist.
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

export const PLATFORM_CAPABILITIES = Object.freeze({
  BILLING_READ: "billing.read",
  BILLING_MANAGE: "billing.manage",
  AUDIT_READ: "audit.read",
});

const SUPERUSER_CAPABILITIES = Object.freeze(Object.values(PLATFORM_CAPABILITIES));
const knownPlatformCapabilities = new Set(SUPERUSER_CAPABILITIES);

/**
 * Kept as a compatibility no-op for tests/imports; allowlists are read live.
 */
export const resetAllowlistCache = () => {};

/**
 * Check if an authenticated user qualifies as a platform superuser.
 *
 * @param {Object} user - Express req.user (must have _id, email, platformRole)
 * @returns {boolean}
 */
export const isPlatformSuperuser = (user) => {
  if (!user || !user._id) return false;

  // DB-level platform role check
  if (user.platformRole === "superuser") return true;

  const email = (user.email || "").toLowerCase().trim();
  const emailVerified = user.emailVerified === true;

  if (!email && !user._id) return false;

  const emailSet = getAdminEmailSet();
  const idSet = getAdminIdSet();

  // If no allowlist is configured, only DB role is sufficient
  if (emailSet.size === 0 && idSet.size === 0) return false;

  if (email && emailVerified && emailSet.has(email)) return true;
  if (idSet.has(String(user._id).toLowerCase())) return true;

  return false;
};

export const isPlatformAdmin = isPlatformSuperuser;

export const isKnownPlatformCapability = (capability) =>
  typeof capability === "string" && knownPlatformCapabilities.has(capability);

export const resolvePlatformCapabilities = (user) =>
  isPlatformSuperuser(user) ? [...SUPERUSER_CAPABILITIES] : [];

export const hasPlatformCapability = (user, capability) =>
  isKnownPlatformCapability(capability) &&
  resolvePlatformCapabilities(user).includes(capability);

/**
 * Express middleware: require the authenticated user to be a platform superuser.
 * Must be placed after the `protect` middleware.
 *
 * - Unauthenticated (no req.user): 401
 * - Authenticated but not platform superuser: 403
 * - Authenticated platform superuser: calls next()
 */
export const requirePlatformSuperuser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  if (!isPlatformSuperuser(req.user)) {
    return res.status(403).json({
      code: "FORBIDDEN",
      message: "Platform superuser access required",
    });
  }

  return next();
};

export const requirePlatformCapability = (capability) => {
  function requirePlatformCapability(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    if (!hasPlatformCapability(req.user, capability)) {
      return res.status(403).json({
        code: "FORBIDDEN",
        message: "Platform capability required",
      });
    }

    return next();
  }

  requirePlatformCapability.platformCapability = capability;
  return requirePlatformCapability;
};

export const requirePlatformAdmin = requirePlatformSuperuser;
