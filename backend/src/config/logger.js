import pino from "pino";

const CENSOR = "[REDACTED]";

const REDACT_PATHS = [
  "err.config.headers.authorization",
  "err.config.headers.cookie",
  "err.config.headers.proxy-authorization",
  "err.config.headers[\"set-cookie\"]",
  "err.config.headers[\"x-payment-webhook-secret\"]",
  "error.config.headers.authorization",
  "error.config.headers.cookie",
  "error.config.headers.proxy-authorization",
  "error.config.headers[\"set-cookie\"]",
  "error.config.headers[\"x-payment-webhook-secret\"]",
  "config.headers.authorization",
  "config.headers.cookie",
  "config.headers.proxy-authorization",
  "config.headers[\"set-cookie\"]",
  "config.headers[\"x-payment-webhook-secret\"]",
  "req.headers.authorization",
  "req.headers.proxy-authorization",
  "req.headers.cookie",
  "req.headers[\"set-cookie\"]",
  "req.headers[\"x-payment-webhook-secret\"]",
  "headers.authorization",
  "headers[\"proxy-authorization\"]",
  "headers.cookie",
  "headers[\"set-cookie\"]",
  "authorization",
  "cookie",
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "accessToken",
  "refreshToken",
  "resetToken",
  "verificationToken",
  "token",
  "sessionId",
  "MONGO_URI",
  "mongoUri",
  "sentryDsn",
  "apiKey",
  "secret",
  "webhookSecret",
];

const SENSITIVE_VALUE_PATTERNS = [
  /Bearer\s+[^,\s]+/gi,
  /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
  /mongodb(?:\+srv)?:\/\/[^@\s]+@/gi,
  /([?&]|%3[fF]|%26)(token|access_token|refresh_token|resetToken|verificationToken|code)(=|%3[dD])([^&#\s]+)/gi,
];

export function sanitizeString(value) {
  if (typeof value !== "string") return value;

  let result = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (/^Bearer\s+/i.test(match)) {
        return "Bearer [REDACTED]";
      }
      if (/^mongodb/i.test(match)) {
        return match.replace(/\/\/[^@\s]+@/, "//[REDACTED]@");
      }
      if (/^eyJ[A-Za-z0-9\-_]+\.eyJ/i.test(match)) {
        return "[REDACTED]";
      }
      return match.replace(/(=|%3[dD])([^&#\s]+)/, "$1[REDACTED]");
    });
  }
  return result;
}

function stripQueryAndHash(value) {
  if (typeof value !== "string") return null;
  const [withoutHash] = value.split("#");
  const [withoutQuery] = withoutHash.split("?");
  return withoutQuery || "/";
}

function joinRoutePath(baseUrl, routePath) {
  if (typeof routePath !== "string") return null;
  const base = stripQueryAndHash(baseUrl || "") || "";
  const route = stripQueryAndHash(routePath) || "";
  if (!base) return route || "/";
  if (!route || route === "/") return base;
  return `${base.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`;
}

export function getSafeRequestPath(req = {}) {
  const routePath = joinRoutePath(req.baseUrl, req.route?.path);
  if (routePath) return routePath;

  if (typeof req.path === "string") return stripQueryAndHash(req.path);

  return stripQueryAndHash(req.originalUrl) || stripQueryAndHash(req.url) || "/";
}

export function safeErrorSerializer(value) {
  if (!value) return value;

  const serialized = {};
  const name = value.type || value.name || value.constructor?.name;
  if (typeof name === "string") serialized.type = sanitizeString(name);

  if (typeof value.message === "string") serialized.message = sanitizeString(value.message);
  if (typeof value.stack === "string") serialized.stack = sanitizeString(value.stack);

  const code = value.code;
  if (typeof code === "string") {
    const sanitizedCode = sanitizeString(code);
    if (/^[A-Za-z0-9_.:-]{1,128}$/.test(sanitizedCode)) serialized.code = sanitizedCode;
  } else if (Number.isFinite(code)) {
    serialized.code = code;
  }

  if (!serialized.type && !serialized.message && !serialized.stack && serialized.code === undefined) {
    serialized.type = "Error";
  }

  return serialized;
}

function buildEnv() {
  const nodeEnv = process.env.NODE_ENV || "development";
  return nodeEnv === "test" ? "test" : nodeEnv;
}

const VALID_LOG_LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);

function normalizeLogLevel(level) {
  if (typeof level !== "string") return "info";
  const normalized = level.trim().toLowerCase();
  return VALID_LOG_LEVELS.has(normalized) ? normalized : "info";
}

let cachedLogger = null;

export function createLogger(options = {}) {
  const {
    level = process.env.LOG_LEVEL || "info",
    pretty = process.env.LOG_PRETTY === "true",
    service = process.env.SERVICE_NAME || "hairbook-backend",
    release = process.env.RELEASE || "",
    environment = buildEnv(),
    stream,
  } = options;

  const base = { service, environment };
  if (release) base.release = release;

  const safeLevel = normalizeLogLevel(level);
  const usePretty = pretty === true && environment !== "production" && environment !== "test";

  const pinoOptions = {
    level: safeLevel,
    base,
    redact: {
      paths: REDACT_PATHS,
      censor: CENSOR,
    },
    serializers: {
      err: safeErrorSerializer,
      error: safeErrorSerializer,
    },
  };

  if (usePretty) {
    pinoOptions.transport = {
      target: "pino-pretty",
      options: { colorize: true },
    };
  }

  const instance = pino(pinoOptions, stream || undefined);
  return instance;
}

export function getLogger(options = {}) {
  if (!cachedLogger) {
    cachedLogger = createLogger(options);
  }
  return cachedLogger;
}

export function resetLogger() {
  cachedLogger = null;
}

export { CENSOR };
