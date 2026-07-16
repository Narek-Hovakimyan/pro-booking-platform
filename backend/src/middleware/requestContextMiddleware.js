import { randomUUID } from "node:crypto";
import { getSafeRequestPath } from "../config/logger.js";

const REQUEST_ID_HEADER = "x-request-id";
const CONTEXT_KEY = Symbol.for("hairbook.requestContext");

const MAX_ID_LENGTH = 64;
const ALLOWED_ID_CHARS = /^[A-Za-z0-9._:-]+$/;

const SILENT_HEALTH_PATHS = ["/api/health", "/api/health/"];

function validateRequestId(value) {
  if (Array.isArray(value)) return null;
  if (typeof value !== "string") return null;
  if (value.length < 1 || value.length > MAX_ID_LENGTH) return null;
  if (!ALLOWED_ID_CHARS.test(value)) return null;
  return value;
}

export function requestContextMiddleware(rootLogger) {
  return (req, res, next) => {
    if (res[CONTEXT_KEY]) {
      req.id = res[CONTEXT_KEY].requestId;
      req.log = res[CONTEXT_KEY].log;
      res.setHeader(REQUEST_ID_HEADER, req.id);
      return next();
    }

    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId = validateRequestId(incoming) || randomUUID();
    const log = rootLogger.child({ requestId });

    req.id = requestId;
    req.log = log;
    res[CONTEXT_KEY] = { requestId, log };

    res.setHeader(REQUEST_ID_HEADER, requestId);

    const startTime = Date.now();
    let logged = false;

    const cleanup = () => {
      res.off?.("finish", onFinish);
      res.off?.("close", onClose);
      res.removeListener?.("finish", onFinish);
      res.removeListener?.("close", onClose);
    };

    const logCompletion = (eventName) => {
      if (logged) return;
      logged = true;
      cleanup();

      const rawDuration = Date.now() - startTime;
      const duration = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0;
      const path = getSafeRequestPath(req);
      const isHealth = req.method === "GET" && SILENT_HEALTH_PATHS.includes(path);
      if (!isHealth) {
        req.log.info(
          {
            event: eventName,
            requestId,
            method: req.method,
            path,
            statusCode: res.statusCode,
            duration,
          },
          eventName
        );
      }
    };

    function onFinish() {
      logCompletion("request.completed");
    }

    function onClose() {
      logCompletion("request.aborted");
    }

    res.on("finish", onFinish);
    res.on("close", onClose);

    next();
  };
}
