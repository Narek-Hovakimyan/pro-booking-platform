import { getLogger, getSafeRequestPath, safeErrorSerializer } from "../config/logger.js";

export function createErrorMiddleware(options = {}) {
  const { logger } = options;

  return function errorMiddleware(error, req, res, next) {
    if (res.headersSent) {
      return next(error);
    }

    if (error?.message === "Not allowed by CORS") {
      return res.status(403).json({ message: "Origin not allowed by CORS" });
    }

    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const isServerError = statusCode >= 500;

    if (isServerError) {
      const log = req?.log || logger || getLogger();
      try {
        log.error(
          {
            err: safeErrorSerializer(error),
            requestId: req?.id,
            statusCode,
            method: req?.method,
            path: getSafeRequestPath(req),
          },
          "Unhandled server error"
        );
      } catch {
        // Logging must never prevent Express from sending the existing error response.
      }
    }

    const message = isServerError ? "Internal server error" : error?.message || "Request failed";

    return res.status(statusCode).json({ message });
  };
}

export const errorMiddleware = createErrorMiddleware();
