import * as Sentry from "@sentry/node";

const CAPTURED_ERROR = Symbol("sentryCaptured");
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const SAFE_LABEL = /^[A-Za-z0-9._-]{1,64}$/;
const SAFE_RELEASE = /^[A-Za-z0-9._-]{1,64}$/;
const SAFE_PLATFORM = /^[A-Za-z0-9._-]{1,32}$/;
const SAFE_EVENT_ID = /^[A-Fa-f0-9]{32}$/;
const SAFE_ERROR_TYPE = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_FUNCTION = /^[A-Za-z_$][A-Za-z0-9_$.:<>-]{0,127}$/;
const SAFE_METHOD = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const SAFE_LEVELS = new Set(["fatal", "error", "warning", "log", "info", "debug"]);
const ALLOWED_TAG_KEYS = new Set(["request_id", "status_code", "component", "job", "socket_event"]);
const NAMED_TAG_KEYS = new Set(["component", "job", "socket_event"]);
const DISABLED_DEFAULT_INTEGRATIONS = new Set([
  "Console",
  "LocalVariables",
  "OnUncaughtException",
  "OnUnhandledRejection",
  "ProcessSession",
]);
const STARTUP_FLUSH_TIMEOUT_MS = 1000;

let sentrySdk = Sentry;
let installedApps = new WeakSet();
let initializationAttempted = false;
let initializationStatus = { initialized: false, failed: false };

const parseEnabled = (value) => String(value || "").trim().toLowerCase() === "true";
const isNonBlankString = (value) => typeof value === "string" && value.trim().length > 0;

const normalizeLabel = (value, fallback = "") => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return SAFE_LABEL.test(normalized) ? normalized : fallback;
};

const normalizeRelease = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return SAFE_RELEASE.test(normalized) ? normalized : "";
};

const parseSampleRate = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
};

export const getSentryConfig = (env = process.env) => {
  const nodeEnvironment = normalizeLabel(env.NODE_ENV, "development");
  const dsn = typeof env.SENTRY_DSN === "string" ? env.SENTRY_DSN.trim() : "";

  return {
    enabled:
      nodeEnvironment !== "test" &&
      !isNonBlankString(env.VERCEL) &&
      parseEnabled(env.SENTRY_ENABLED) &&
      Boolean(dsn),
    dsn,
    environment: normalizeLabel(env.SENTRY_ENVIRONMENT, nodeEnvironment),
    release: normalizeRelease(env.SENTRY_RELEASE),
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
  };
};

const filterDefaultIntegrations = (integrations = []) =>
  integrations.filter((integration) => !DISABLED_DEFAULT_INTEGRATIONS.has(integration?.name));

export const initializeSentry = (env = process.env) => {
  if (initializationAttempted) return { ...initializationStatus };
  initializationAttempted = true;

  const config = getSentryConfig(env);
  if (!config.enabled) return { ...initializationStatus };

  try {
    sentrySdk.init({
      dsn: config.dsn,
      environment: config.environment,
      ...(config.release ? { release: config.release } : {}),
      tracesSampleRate: config.tracesSampleRate,
      sampleRate: 1,
      sendDefaultPii: false,
      includeLocalVariables: false,
      maxBreadcrumbs: 0,
      integrations: filterDefaultIntegrations,
      beforeBreadcrumb: () => null,
      beforeSend,
    });
    initializationStatus = { initialized: true, failed: false };
  } catch {
    initializationStatus = { initialized: false, failed: true };
  }

  return { ...initializationStatus };
};

export const getSentryInitializationStatus = () => ({ ...initializationStatus });

const flushWithTimeout = async (sdk, timeoutMs, dependencies = {}) => {
  try {
    if (typeof sdk?.flush !== "function") return false;

    const setTimeoutFn =
      typeof dependencies.setTimeoutFn === "function"
        ? dependencies.setTimeoutFn
        : setTimeout;
    const clearTimeoutFn =
      typeof dependencies.clearTimeoutFn === "function"
        ? dependencies.clearTimeoutFn
        : clearTimeout;
    let timeoutId;

    try {
      return await Promise.race([
        Promise.resolve().then(() => sdk.flush(timeoutMs)).catch(() => false),
        new Promise((resolve) => {
          try {
            timeoutId = setTimeoutFn(() => resolve(false), timeoutMs);
          } catch {
            resolve(false);
          }
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        try {
          clearTimeoutFn(timeoutId);
        } catch {
          // Reporting must not prevent the startup failure exit.
        }
      }
    }
  } catch {
    return false;
  }
};

export const captureSentryStartupFailure = async (component, dependencies = {}) => {
  if (!initializationStatus.initialized) return { captured: false, flushed: false };

  const testDependencies = dependencies && typeof dependencies === "object" ? dependencies : {};
  let sdk = sentrySdk;
  try {
    if (Object.hasOwn(testDependencies, "sdk")) sdk = testDependencies.sdk;
  } catch {
    // Dependency seams must not prevent the required startup failure exit.
  }
  const safeComponent = component === "database" ? "database" : "";
  let captured = false;

  try {
    if (typeof sdk?.captureException === "function") {
      sdk.captureException(new Error("Application startup failure"), {
        level: "fatal",
        ...(safeComponent ? { tags: { component: safeComponent } } : {}),
      });
      captured = true;
    }
  } catch {
    // Startup failure reporting must never delay the required process exit.
  }

  const flushed = await flushWithTimeout(
    sdk,
    STARTUP_FLUSH_TIMEOUT_MS,
    testDependencies
  );
  return { captured, flushed: flushed === true };
};

const getSafeMethod = (value) => {
  const method = typeof value === "string" ? value.toUpperCase() : "";
  return SAFE_METHOD.has(method) ? method : "";
};

const getSafeStatus = (value) => {
  if (Number.isInteger(value) && value >= 100 && value <= 599) return value;
  if (typeof value === "string" && /^[0-9]{3}$/.test(value)) {
    const status = Number(value);
    return status >= 100 && status <= 599 ? status : undefined;
  }
  return undefined;
};

const hasSensitiveMarker = (value) =>
  /(?:token|secret|password|authorization|bearer|api[_-]?key)/i.test(value);

const sanitizeTags = (tags) => {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return {};

  const safeTags = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!ALLOWED_TAG_KEYS.has(key)) continue;
    if (key === "request_id" && typeof value === "string" && SAFE_REQUEST_ID.test(value)) {
      safeTags[key] = value;
    } else if (key === "status_code") {
      const status = getSafeStatus(value);
      if (status !== undefined) safeTags[key] = String(status);
    } else if (
      NAMED_TAG_KEYS.has(key) &&
      typeof value === "string" &&
      SAFE_REQUEST_ID.test(value) &&
      !hasSensitiveMarker(value)
    ) {
      safeTags[key] = value;
    }
  }
  return safeTags;
};

const normalizeFilename = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return "";
  let pathname = value;

  if (pathname.startsWith("file://")) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return "";
    }
  } else if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(pathname)) {
    return "";
  }

  if (
    pathname.includes("\\") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    pathname.includes("..") ||
    pathname.includes("node_modules")
  ) {
    return "";
  }

  const match = pathname.match(/(?:^|\/)(src\/.+)$/);
  if (!match) return "";
  const filename = match[1];
  return /^src(?:\/[A-Za-z0-9._-]+)+$/.test(filename) && filename.length <= 256
    ? filename
    : "";
};

const sanitizeFrames = (stacktrace) => {
  if (!stacktrace || !Array.isArray(stacktrace.frames)) return undefined;

  const frames = [];
  for (const frame of stacktrace.frames) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) continue;
    const safeFrame = {};
    const filename = normalizeFilename(frame.filename) || normalizeFilename(frame.abs_path);

    if (filename) safeFrame.filename = filename;
    if (
      typeof frame.function === "string" &&
      SAFE_FUNCTION.test(frame.function) &&
      !hasSensitiveMarker(frame.function)
    ) {
      safeFrame.function = frame.function;
    }
    if (Number.isInteger(frame.lineno) && frame.lineno >= 0) safeFrame.lineno = frame.lineno;
    if (Number.isInteger(frame.colno) && frame.colno >= 0) safeFrame.colno = frame.colno;
    if (typeof frame.in_app === "boolean") safeFrame.in_app = frame.in_app;
    frames.push(safeFrame);
  }
  return { frames };
};

const sanitizeException = (exception) => {
  if (!exception || !Array.isArray(exception.values)) return undefined;

  return {
    values: exception.values.map((value) => {
      const safeValue = {
        type: typeof value?.type === "string" && SAFE_ERROR_TYPE.test(value.type) ? value.type : "Error",
        value: "Unexpected server error",
      };
      const stacktrace = sanitizeFrames(value?.stacktrace);
      if (stacktrace) safeValue.stacktrace = stacktrace;
      return safeValue;
    }),
  };
};

const sanitizeTopLevel = (event) => {
  const safe = {};
  if (typeof event?.event_id === "string" && SAFE_EVENT_ID.test(event.event_id)) {
    safe.event_id = event.event_id;
  }
  if (Number.isFinite(event?.timestamp)) safe.timestamp = event.timestamp;
  if (typeof event?.platform === "string" && SAFE_PLATFORM.test(event.platform)) {
    safe.platform = event.platform;
  }
  if (typeof event?.level === "string" && SAFE_LEVELS.has(event.level)) safe.level = event.level;

  const environment = normalizeLabel(event?.environment);
  const release = normalizeRelease(event?.release);
  if (environment) safe.environment = environment;
  if (release) safe.release = release;
  return safe;
};

const minimalSafeEvent = (event = {}) => {
  const genericException = {
    values: [{ type: "Error", value: "Unexpected server error" }],
  };
  try {
    return { ...sanitizeTopLevel(event), exception: genericException };
  } catch {
    return { exception: genericException };
  }
};

export const beforeSend = (event = {}) => {
  try {
    const sanitized = sanitizeTopLevel(event);
    const request = {};
    const method = getSafeMethod(event?.request?.method);
    const tags = sanitizeTags(event?.tags);
    const exception = sanitizeException(event?.exception);

    if (method) request.method = method;
    if (Object.keys(request).length > 0) sanitized.request = request;
    if (Object.keys(tags).length > 0) sanitized.tags = tags;
    if (exception) sanitized.exception = exception;

    return sanitized;
  } catch {
    return minimalSafeEvent(event);
  }
};

export const resolveSentryStatusCode = (error) => {
  try {
    const statusCode = getSafeStatus(error?.statusCode);
    if (statusCode !== undefined) return statusCode;
    const status = getSafeStatus(error?.status);
    return status === undefined ? 500 : status;
  } catch {
    return 500;
  }
};

export const shouldCaptureSentryError = (error) => {
  try {
    if (error?.message === "Not allowed by CORS") return false;
  } catch {
    return true;
  }
  if (resolveSentryStatusCode(error) < 500) return false;
  try {
    if (error && typeof error === "object" && error[CAPTURED_ERROR]) return false;
  } catch {
    return true;
  }

  if (error && typeof error === "object") {
    try {
      Object.defineProperty(error, CAPTURED_ERROR, { value: true });
    } catch {
      // Capture eligibility must never crash Express.
    }
  }
  return true;
};

const setRequestId = (req) => {
  const scope = sentrySdk.getIsolationScope?.();
  scope?.setUser?.(null);
  if (typeof req?.id !== "string" || !SAFE_REQUEST_ID.test(req.id)) return;
  scope?.setTag?.("request_id", req.id);
};

export const sentryRequestContextMiddleware = (req, _res, next) => {
  if (initializationStatus.initialized) {
    try {
      setRequestId(req);
    } catch {
      // Scope errors must not change request handling.
    }
  }
  next();
};

export const installSentryExpressErrorHandler = (app) => {
  if (!initializationStatus.initialized || !app || installedApps.has(app)) return false;
  try {
    sentrySdk.setupExpressErrorHandler(app, { shouldHandleError: shouldCaptureSentryError });
    installedApps.add(app);
    return true;
  } catch {
    return false;
  }
};

export const __sentryTestHooks = {
  reset() {
    sentrySdk = Sentry;
    installedApps = new WeakSet();
    initializationAttempted = false;
    initializationStatus = { initialized: false, failed: false };
  },
  setSdk(nextSdk) {
    sentrySdk = nextSdk || Sentry;
  },
};
