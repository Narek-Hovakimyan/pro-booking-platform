import { rateLimit } from "express-rate-limit";

export const rateLimitMessage = "Too many requests, please try again later.";
export const rateLimitCode = "RATE_LIMITED";

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
}) =>
  rateLimit({
    windowMs,
    limit,
    skip: () => (enabled === undefined ? !isRateLimitEnabled() : !enabled),
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        message: rateLimitMessage,
        code: rateLimitCode,
      }),
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

export const uploadLimiter = createJsonRateLimiter({
  windowMs: uploadWindowMs(),
  limit: uploadMax(),
});

export const paymentLimiter = createJsonRateLimiter({
  windowMs: paymentWindowMs(),
  limit: paymentMax(),
});

export const webhookLimiter = createJsonRateLimiter({
  windowMs: paymentWindowMs(),
  limit: Math.max(paymentMax(), isProduction() ? 180 : 1000),
});

export const loginRateLimiter = authLimiter;
export const registerRateLimiter = authLimiter;
