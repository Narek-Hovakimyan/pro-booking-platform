import crypto from "node:crypto";

/**
 * Token expiry: 24 hours.
 */
export const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Resend throttle: 60 seconds.
 */
export const EMAIL_VERIFICATION_RESEND_THROTTLE_MS = 60 * 1000;

/**
 * Normalize an email value: trim, lowercase, return "" for blank/falsy inputs.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export const normalizeEmail = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  return trimmed || "";
};

/**
 * Conservative basic email format validation.
 * Checks for: non-empty, one @, non-empty local+domain parts, and a dot in domain.
 * @param {string} value
 * @returns {boolean}
 */
export const isValidEmail = (value) => {
  if (!value || typeof value !== "string") return false;
  if (value.length > 254) return false;

  const atIndex = value.indexOf("@");
  if (atIndex < 1) return false;
  if (atIndex !== value.lastIndexOf("@")) return false;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);

  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (!domain.includes(".")) return false;

  return true;
};

/**
 * Create a raw email verification token and its SHA-256 hash.
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export const createEmailVerificationToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashEmailVerificationToken(rawToken);
  return { rawToken, tokenHash };
};

/**
 * SHA-256 hash an email verification token.
 * @param {string} token
 * @returns {string}
 */
export const hashEmailVerificationToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
