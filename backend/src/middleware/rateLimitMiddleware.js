import { ipKeyGenerator, rateLimit } from "express-rate-limit";

export const rateLimitMessage = "Too many requests, please try again later.";
export const rateLimitCode = "RATE_LIMITED";
export const authenticatedRateLimitNamespace = "auth";

const isProduction = () => process.env.NODE_ENV === "production";

const getBooleanEnv = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;

  return String(value).toLowerCase() === "true";
};

const getNumberEnv = (name, fallback) => {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const isRateLimitEnabled = () => {
  if (process.env.NODE_ENV === "test" && process.env.RATE_LIMIT_ENABLED === undefined) {
    return false;
  }

  return getBooleanEnv("RATE_LIMIT_ENABLED", true);
};

export const createJsonRateLimiter = ({
  limit,
  windowMs,
  enabled,
  skipSuccessfulRequests = false,
  keyGenerator,
  requestWasSuccessful,
}) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skip: () => (enabled === undefined ? !isRateLimitEnabled() : !enabled),
    skipSuccessfulRequests,
    requestWasSuccessful,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        message: rateLimitMessage,
        code: rateLimitCode,
      }),
  });

const normalizeUserRateLimitId = (value) => {
  if (value === undefined || value === null) return "";

  return String(value).trim();
};

export const getAuthenticatedRateLimitUserId = (req) => {
  const objectId = normalizeUserRateLimitId(req?.user?._id);
  if (objectId) return objectId;

  return normalizeUserRateLimitId(req?.user?.id);
};

export const createAuthenticatedRateLimitKeyGenerator = (namespace) => (req) => {
  const userId = getAuthenticatedRateLimitUserId(req);

  if (userId) {
    return `${authenticatedRateLimitNamespace}:${namespace}:user:${userId}`;
  }

  return `${authenticatedRateLimitNamespace}:${namespace}:ip:${ipKeyGenerator(req.ip)}`;
};

export const createAuthenticatedJsonRateLimiter = ({
  namespace,
  limit,
  windowMs,
  enabled,
  skipSuccessfulRequests = false,
}) =>
  createJsonRateLimiter({
    limit,
    windowMs,
    enabled,
    skipSuccessfulRequests,
    keyGenerator: createAuthenticatedRateLimitKeyGenerator(namespace),
  });

const authWindowMs = () =>
  getNumberEnv("RATE_LIMIT_AUTH_WINDOW_MS", 15 * 60 * 1000);
const authMax = () =>
  getNumberEnv("RATE_LIMIT_AUTH_MAX", isProduction() ? 20 : 200);
const publicWindowMs = () =>
  getNumberEnv("RATE_LIMIT_PUBLIC_WINDOW_MS", 15 * 60 * 1000);
const publicMax = () =>
  getNumberEnv("RATE_LIMIT_PUBLIC_MAX", isProduction() ? 120 : 1000);
const uploadWindowMs = () =>
  getNumberEnv("RATE_LIMIT_UPLOAD_WINDOW_MS", 15 * 60 * 1000);
const uploadMax = () =>
  getNumberEnv("RATE_LIMIT_UPLOAD_MAX", isProduction() ? 40 : 300);
const paymentWindowMs = () =>
  getNumberEnv("RATE_LIMIT_PAYMENT_WINDOW_MS", 15 * 60 * 1000);
const paymentMax = () =>
  getNumberEnv("RATE_LIMIT_PAYMENT_MAX", isProduction() ? 60 : 500);
const webhookFailureWindowMs = () =>
  getNumberEnv("RATE_LIMIT_WEBHOOK_FAILURE_WINDOW_MS", 15 * 60 * 1000);
const webhookFailureMax = () =>
  getNumberEnv("RATE_LIMIT_WEBHOOK_FAILURE_MAX", isProduction() ? 180 : 1200);
const bookingMutationWindowMs = () =>
  getNumberEnv("RATE_LIMIT_BOOKING_MUTATION_WINDOW_MS", 15 * 60 * 1000);
const bookingMutationMax = () =>
  getNumberEnv("RATE_LIMIT_BOOKING_MUTATION_MAX", isProduction() ? 30 : 240);
const waitlistActionWindowMs = () =>
  getNumberEnv("RATE_LIMIT_WAITLIST_ACTION_WINDOW_MS", 15 * 60 * 1000);
const waitlistActionMax = () =>
  getNumberEnv("RATE_LIMIT_WAITLIST_ACTION_MAX", isProduction() ? 40 : 300);
const messageMutationWindowMs = () =>
  getNumberEnv("RATE_LIMIT_MESSAGE_MUTATION_WINDOW_MS", 15 * 60 * 1000);
const messageMutationMax = () =>
  getNumberEnv("RATE_LIMIT_MESSAGE_MUTATION_MAX", isProduction() ? 50 : 400);
const messageReadWindowMs = () =>
  getNumberEnv("RATE_LIMIT_MESSAGE_READ_WINDOW_MS", 15 * 60 * 1000);
const messageReadMax = () =>
  getNumberEnv("RATE_LIMIT_MESSAGE_READ_MAX", isProduction() ? 180 : 1200);
const accountMutationWindowMs = () =>
  getNumberEnv("RATE_LIMIT_ACCOUNT_MUTATION_WINDOW_MS", 15 * 60 * 1000);
const accountMutationMax = () =>
  getNumberEnv("RATE_LIMIT_ACCOUNT_MUTATION_MAX", isProduction() ? 20 : 160);
const securityMutationWindowMs = () =>
  getNumberEnv("RATE_LIMIT_SECURITY_MUTATION_WINDOW_MS", 15 * 60 * 1000);
const securityMutationMax = () =>
  getNumberEnv("RATE_LIMIT_SECURITY_MUTATION_MAX", isProduction() ? 8 : 80);
const emailVerificationWindowMs = () =>
  getNumberEnv("RATE_LIMIT_EMAIL_VERIFICATION_WINDOW_MS", 15 * 60 * 1000);
const emailVerificationMax = () =>
  getNumberEnv("RATE_LIMIT_EMAIL_VERIFICATION_MAX", isProduction() ? 30 : 240);

export const authLimiter = createJsonRateLimiter({
  windowMs: authWindowMs(),
  limit: authMax(),
  skipSuccessfulRequests: true,
});

export const publicBookingLimiter = createJsonRateLimiter({
  windowMs: publicWindowMs(),
  limit: publicMax(),
});

export const promoValidationLimiter = createJsonRateLimiter({
  windowMs: publicWindowMs(),
  limit: publicMax(),
});

export const messageLimiter = createJsonRateLimiter({
  windowMs: publicWindowMs(),
  limit: publicMax(),
});

export const bookingMutationLimiter = createAuthenticatedJsonRateLimiter({
  namespace: "booking-mutation",
  windowMs: bookingMutationWindowMs(),
  limit: bookingMutationMax(),
});

export const waitlistActionLimiter = createAuthenticatedJsonRateLimiter({
  namespace: "waitlist-action",
  windowMs: waitlistActionWindowMs(),
  limit: waitlistActionMax(),
});

export const messageMutationLimiter = createAuthenticatedJsonRateLimiter({
  namespace: "message-mutation",
  windowMs: messageMutationWindowMs(),
  limit: messageMutationMax(),
});

export const messageReadLimiter = createAuthenticatedJsonRateLimiter({
  namespace: "message-read",
  windowMs: messageReadWindowMs(),
  limit: messageReadMax(),
});

export const accountMutationLimiter = createAuthenticatedJsonRateLimiter({
  namespace: "account-mutation",
  windowMs: accountMutationWindowMs(),
  limit: accountMutationMax(),
});

export const securityMutationLimiter = createAuthenticatedJsonRateLimiter({
  namespace: "security-mutation",
  windowMs: securityMutationWindowMs(),
  limit: securityMutationMax(),
});

export const emailVerificationLimiter = createJsonRateLimiter({
  windowMs: emailVerificationWindowMs(),
  limit: emailVerificationMax(),
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});

export const uploadLimiter = createJsonRateLimiter({
  windowMs: uploadWindowMs(),
  limit: uploadMax(),
});

export const paymentLimiter = createJsonRateLimiter({
  windowMs: paymentWindowMs(),
  limit: paymentMax(),
});

export const createIpRateLimitKeyGenerator = (req) => ipKeyGenerator(req.ip);

export const webhookFailureLimiter = createJsonRateLimiter({
  windowMs: webhookFailureWindowMs(),
  limit: webhookFailureMax(),
  keyGenerator: createIpRateLimitKeyGenerator,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode >= 200 && res.statusCode < 300,
});

export const loginRateLimiter = authLimiter;
export const registerRateLimiter = authLimiter;
