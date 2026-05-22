import { rateLimit } from "express-rate-limit";

export const rateLimitMessage = "Too many requests. Please try again later.";

export const createJsonRateLimiter = ({ limit, windowMs }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ message: rateLimitMessage }),
  });

export const loginRateLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
});

export const registerRateLimiter = createJsonRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
});
