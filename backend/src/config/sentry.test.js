import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createErrorMiddleware } from "../middleware/errorMiddleware.js";
import {
  __sentryTestHooks,
  beforeSend,
  captureSentryStartupFailure,
  getSentryConfig,
  getSentryInitializationStatus,
  initializeSentry,
  installSentryExpressErrorHandler,
  resolveSentryStatusCode,
  sentryRequestContextMiddleware,
  shouldCaptureSentryError,
} from "./sentry.js";

const enabledEnv = {
  NODE_ENV: "production",
  SENTRY_ENABLED: "true",
  SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
};
const initialVercel = process.env.VERCEL;

afterEach(() => {
  __sentryTestHooks.reset();
  if (initialVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = initialVercel;
});

const makeResponse = () => ({
  headersSent: false,
  headers: { "x-request-id": "request-1" },
  responseCount: 0,
  statusCode: 200,
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.responseCount += 1; this.body = body; return this; },
});

test("configuration requires explicit true, DSN, non-test mode, and non-Vercel deployment", () => {
  for (const SENTRY_ENABLED of [undefined, "", "false", "FALSE", "yes", "1", "malformed"]) {
    assert.equal(getSentryConfig({ ...enabledEnv, SENTRY_ENABLED }).enabled, false);
  }
  assert.equal(getSentryConfig({ ...enabledEnv, SENTRY_DSN: "   " }).enabled, false);
  assert.equal(getSentryConfig({ ...enabledEnv, NODE_ENV: "test" }).enabled, false);
  assert.equal(getSentryConfig({ ...enabledEnv, VERCEL: "1" }).enabled, false);
  assert.equal(getSentryConfig({ ...enabledEnv, VERCEL: "  " }).enabled, true);
  assert.equal(getSentryConfig(enabledEnv).enabled, true);
  assert.equal(getSentryConfig({ ...enabledEnv, SENTRY_ENABLED: "TrUe" }).enabled, true);
});

test("configuration normalizes labels and sample rates conservatively", () => {
  assert.equal(getSentryConfig({}).environment, "development");
  assert.equal(getSentryConfig({ NODE_ENV: "production" }).environment, "production");
  assert.equal(getSentryConfig({ NODE_ENV: "production", SENTRY_ENVIRONMENT: "not valid!" }).environment, "production");
  assert.equal(getSentryConfig({ ...enabledEnv, SENTRY_RELEASE: "release-1.2.3" }).release, "release-1.2.3");
  for (const value of ["", "unsafe value!", "https://private.example", "name@example.com", {}, []]) {
    assert.equal(getSentryConfig({ ...enabledEnv, SENTRY_RELEASE: value }).release, "");
  }
  for (const [value, expected] of [["0", 0], ["1", 1], ["0.25", 0.25], [undefined, 0], ["", 0], ["NaN", 0], ["Infinity", 0], ["-1", 0], ["1.1", 0], [true, 0]]) {
    assert.equal(getSentryConfig({ ...enabledEnv, SENTRY_TRACES_SAMPLE_RATE: value }).tracesSampleRate, expected);
  }
});

test("Vercel blocks initialization without adding a SIGTERM listener", () => {
  const calls = [];
  __sentryTestHooks.setSdk({ init(options) { calls.push(options); } });
  const before = process.listeners("SIGTERM").length;
  process.env.VERCEL = "1";

  assert.deepEqual(initializeSentry({ ...enabledEnv, VERCEL: process.env.VERCEL }), { initialized: false, failed: false });
  assert.equal(calls.length, 0);
  assert.equal(process.listeners("SIGTERM").length, before);
  assert.deepEqual(getSentryInitializationStatus(), { initialized: false, failed: false });
});

test("disabled, test-mode, and enabled initialization remain isolated", () => {
  let calls = 0;
  __sentryTestHooks.setSdk({ init() { calls += 1; } });
  assert.deepEqual(initializeSentry({ NODE_ENV: "production" }), { initialized: false, failed: false });
  assert.equal(calls, 0);

  __sentryTestHooks.reset();
  __sentryTestHooks.setSdk({ init() { calls += 1; } });
  initializeSentry({ ...enabledEnv, NODE_ENV: "test" });
  assert.equal(calls, 0);

  __sentryTestHooks.reset();
  __sentryTestHooks.setSdk({ init() { calls += 1; } });
  assert.deepEqual(initializeSentry({ ...enabledEnv, VERCEL: "" }), { initialized: true, failed: false });
  assert.deepEqual(initializeSentry(enabledEnv), { initialized: true, failed: false });
  assert.equal(calls, 1);
});

test("enabled initialization uses privacy options and failure is generic", () => {
  const calls = [];
  __sentryTestHooks.setSdk({ init(options) { calls.push(options); } });
  initializeSentry(enabledEnv);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sampleRate, 1);
  assert.equal(calls[0].sendDefaultPii, false);
  assert.equal(calls[0].includeLocalVariables, false);
  assert.equal(calls[0].maxBreadcrumbs, 0);
  assert.equal(calls[0].beforeBreadcrumb({ message: "private" }), null);
  assert.equal(calls[0].beforeSend, beforeSend);
  assert.deepEqual(calls[0].integrations([{ name: "Console" }, { name: "LocalVariables" }, { name: "OnUncaughtException" }, { name: "OnUnhandledRejection" }, { name: "ProcessSession" }, { name: "Express" }]), [{ name: "Express" }]);

  __sentryTestHooks.reset();
  __sentryTestHooks.setSdk({ init() { throw new Error("DSN private-secret failed"); } });
  assert.deepEqual(initializeSentry(enabledEnv), { initialized: false, failed: true });
  assert.equal(JSON.stringify(getSentryInitializationStatus()).includes("private-secret"), false);
  assert.equal(JSON.stringify(getSentryInitializationStatus()).includes("example.ingest"), false);
});

test("startup failure capture is inactive-safe", async () => {
  let inactiveCaptureCalls = 0;
  let inactiveFlushCalls = 0;
  __sentryTestHooks.setSdk({
    captureException() { inactiveCaptureCalls += 1; },
    flush() { inactiveFlushCalls += 1; },
  });
  assert.deepEqual(await captureSentryStartupFailure("database"), {
    captured: false,
    flushed: false,
  });
  assert.equal(inactiveCaptureCalls, 0);
  assert.equal(inactiveFlushCalls, 0);
});

test("startup failure capture is generic, private, bounded, and uses flush once", async () => {
  __sentryTestHooks.setSdk({ init() {} });
  initializeSentry(enabledEnv);
  const captures = [];
  const flushes = [];
  const timeoutIds = [];
  let closeCalls = 0;
  const result = await captureSentryStartupFailure("database", {
    sdk: {
      captureException(error, context) { captures.push([error, context]); },
      flush(timeoutMs) { flushes.push(timeoutMs); return true; },
      close() { closeCalls += 1; },
    },
    setTimeoutFn(_callback, timeoutMs) {
      timeoutIds.push(timeoutMs);
      return "startup-flush-timeout";
    },
    clearTimeoutFn(timeoutId) {
      assert.equal(timeoutId, "startup-flush-timeout");
    },
  });

  assert.deepEqual(result, { captured: true, flushed: true });
  assert.equal(captures.length, 1);
  assert.equal(captures[0][0].message, "Application startup failure");
  assert.notEqual(captures[0][0].message, "Application startup failed");
  assert.deepEqual(captures[0][1], { level: "fatal", tags: { component: "database" } });
  assert.deepEqual(flushes, [1000]);
  assert.deepEqual(timeoutIds, [1000]);
  assert.equal(closeCalls, 0);
  const serialized = JSON.stringify({
    message: captures[0][0].message,
    context: captures[0][1],
  });
  for (const privateValue of [
    "mongodb://username:password@example.com/private-db",
    "mongodb+srv://secret.example.com/private-db",
    "original Mongo error",
    "-----BEGIN CERTIFICATE-----",
    "driverOptionSecret",
    "/home/narek/private/project/file.js",
    enabledEnv.SENTRY_DSN,
    JSON.stringify(enabledEnv),
  ]) assert.equal(serialized.includes(privateValue), false);
});

test("startup failure capture handles flush outcomes and missing SDK methods", async () => {
  __sentryTestHooks.setSdk({ init() {} });
  initializeSentry(enabledEnv);
  for (const [flush, expected] of [
    [() => true, { captured: true, flushed: true }],
    [() => false, { captured: true, flushed: false }],
    [() => { throw new Error("flush private-secret"); }, { captured: true, flushed: false }],
    [() => Promise.reject(new Error("flush private-secret")), { captured: true, flushed: false }],
  ]) {
    let captureCalls = 0;
    let flushCalls = 0;
    const result = await captureSentryStartupFailure("database", {
      sdk: {
        captureException() { captureCalls += 1; },
        flush(timeoutMs) { flushCalls += 1; assert.equal(timeoutMs, 1000); return flush(); },
      },
      setTimeoutFn() { return "timer"; },
      clearTimeoutFn() { throw new Error("clear private-secret"); },
    });
    assert.deepEqual(result, expected);
    assert.equal(captureCalls, 1);
    assert.equal(flushCalls, 1);
  }

  for (const sdk of [
    { flush() { return true; } },
    { captureException() {} },
    {},
    undefined,
  ]) {
    await assert.doesNotReject(() => captureSentryStartupFailure("database", {
      sdk,
      setTimeoutFn() { return "timer"; },
      clearTimeoutFn() {},
    }));
  }
});

test("startup failure capture flushes after capture failure and has no listener side effects", async () => {
  __sentryTestHooks.setSdk({ init() {} });
  initializeSentry(enabledEnv);
  const listenersBefore = Object.fromEntries(
    ["SIGTERM", "uncaughtException", "unhandledRejection"].map((event) => [
      event,
      process.listeners(event).length,
    ])
  );
  let flushCalls = 0;
  const result = await captureSentryStartupFailure("database", {
    sdk: {
      captureException() { throw new Error("capture private-secret"); },
      flush(timeoutMs) { flushCalls += 1; assert.equal(timeoutMs, 1000); return true; },
    },
    setTimeoutFn() { return "timer"; },
    clearTimeoutFn() {},
  });
  assert.deepEqual(result, { captured: false, flushed: true });
  assert.equal(flushCalls, 1);
  for (const [event, count] of Object.entries(listenersBefore)) {
    assert.equal(process.listeners(event).length, count);
  }
});

test("startup failure capture permits only the database component and independent calls", async () => {
  __sentryTestHooks.setSdk({ init() {} });
  initializeSentry(enabledEnv);
  const captures = [];
  let flushCalls = 0;
  const sdk = {
    captureException(error, context) { captures.push([error, context]); },
    flush(timeoutMs) { flushCalls += 1; assert.equal(timeoutMs, 1000); return true; },
  };
  const dependencies = {
    sdk,
    setTimeoutFn() { return "timer"; },
    clearTimeoutFn() {},
  };

  await captureSentryStartupFailure("database", dependencies);
  await captureSentryStartupFailure("database", dependencies);
  for (const invalidComponent of [
    "worker",
    "https://private.example/component",
    "private@example.com",
    { component: "database" },
    ["database"],
  ]) await captureSentryStartupFailure(invalidComponent, dependencies);

  assert.equal(captures.length, 7);
  assert.equal(flushCalls, 7);
  assert.deepEqual(captures[0][1], { level: "fatal", tags: { component: "database" } });
  assert.deepEqual(captures[1][1], { level: "fatal", tags: { component: "database" } });
  for (const [, context] of captures.slice(2)) {
    assert.deepEqual(context, { level: "fatal" });
  }
});

test("beforeSend preserves only a validated method and removes every request path form", () => {
  const secrets = [
    "/api/users/john@example.com",
    "/api/reset/fake-reset-token",
    "/api/bookings/64c9f47a7a04f2d4a0b12345",
    "/api/auth/reset?token=fake-secret",
    "https://user:password@private.example/api/reset?token=fake-secret#fragment",
    "/api/%66ake-secret?token=url%2Dsecret#fragment",
  ];
  const filtered = beforeSend({ request: { method: "post", url: secrets[0], path: secrets[1], data: { secrets }, headers: { authorization: "Bearer fake-secret" } } });
  assert.deepEqual(filtered.request, { method: "POST" });
  const serialized = JSON.stringify(filtered);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false);
  assert.equal(beforeSend({ request: { method: "TRACE", url: secrets[4] } }).request, undefined);
});

test("beforeSend strictly validates every allowlisted tag", () => {
  const filtered = beforeSend({
    tags: {
      request_id: "request-1",
      status_code: 500,
      component: "http",
      job: "booking-reminders",
      socket_event: "join",
      bad_request_id: "request-2",
      url: "https://private.example/token",
      email: "private@example.com",
      component_url: "https://private.example",
      job_token: "fake-secret-token",
      unknown: "private",
    },
  });
  assert.deepEqual(filtered.tags, { request_id: "request-1", status_code: "500", component: "http", job: "booking-reminders", socket_event: "join" });

  const rejected = beforeSend({ tags: {
    request_id: "bad request",
    status_code: "50",
    component: { secret: "private" },
    job: "private@example.com",
    socket_event: ["fake-secret-token"],
    unknown: "private",
    component_oversized: "x".repeat(65),
  } });
  assert.equal(rejected.tags, undefined);
  assert.equal(beforeSend({ tags: { component: "x".repeat(65) } }).tags, undefined);
  assert.equal(beforeSend({ tags: { component: "https://private.example", job: "fake-secret-token", socket_event: "private@example.com" } }).tags, undefined);
  assert.equal(beforeSend({ tags: { status_code: "503" } }).tags.status_code, "503");
});

test("beforeSend validates top-level fields and strips unknown data", () => {
  const eventId = "a".repeat(32);
  const filtered = beforeSend({
    event_id: eventId,
    timestamp: 1234,
    platform: "node",
    level: "error",
    environment: "production",
    release: "release-1",
    user: { email: "private@example.com" },
    contexts: { secret: "private" },
  });
  assert.deepEqual(filtered, { event_id: eventId, timestamp: 1234, platform: "node", level: "error", environment: "production", release: "release-1" });

  const invalid = beforeSend({ event_id: "event-1", timestamp: Infinity, platform: "node/private", level: "notice", environment: "private env", release: "https://private.example" });
  assert.deepEqual(invalid, {});
});

test("beforeSend preserves safe grouping frames and removes unsafe frame data", () => {
  const secret = "private-secret";
  const filtered = beforeSend({
    exception: {
      values: [{
        type: "DatabaseError",
        value: `private@example.com ${secret}`,
        mechanism: { data: { secret } },
        stacktrace: {
          frames: [
            { filename: "/home/narek/project/backend/src/controllers/auth/authController.js", function: "saveBooking", lineno: 42, colno: 7, in_app: true, vars: { secret }, pre_context: [secret] },
            { abs_path: "file:///srv/app/src/config/sentry.js", function: "Object.<anonymous>", lineno: 8, colno: 1, in_app: false },
            { filename: "/home/user/node_modules/package/file.js", function: "https://private.example", lineno: "bad", colno: -1, in_app: "yes" },
            { filename: "/srv/app/src/../secret.js", function: "getToken" },
            null,
          ],
        },
      }, { type: "private@example.com", value: secret }],
    },
  });
  const frames = filtered.exception.values[0].stacktrace.frames;
  assert.deepEqual(frames, [
    { filename: "src/controllers/auth/authController.js", function: "saveBooking", lineno: 42, colno: 7, in_app: true },
    { filename: "src/config/sentry.js", function: "Object.<anonymous>", lineno: 8, colno: 1, in_app: false },
    {},
    {},
  ]);
  assert.equal(filtered.exception.values[0].value, "Unexpected server error");
  assert.equal(filtered.exception.values[1].type, "Error");
  assert.equal(filtered.exception.values[1].value, "Unexpected server error");
  assert.equal(JSON.stringify(filtered).includes(secret), false);
  assert.equal(JSON.stringify(filtered).includes("/home/narek"), false);
  assert.equal(JSON.stringify(filtered).includes("node_modules"), false);
});

test("beforeSend fallback returns a new minimal generic event without hostile data", () => {
  const hostile = {
    event_id: "b".repeat(32),
    get request() { throw new Error("private secret"); },
    get tags() { throw new Error("private secret"); },
  };
  const filtered = beforeSend(hostile);
  assert.notEqual(filtered, hostile);
  assert.deepEqual(filtered, { event_id: "b".repeat(32), exception: { values: [{ type: "Error", value: "Unexpected server error" }] } });
  assert.equal(JSON.stringify(filtered).includes("private secret"), false);
});

test("request correlation uses only an initialized isolation scope and always calls next once", () => {
  const calls = [];
  __sentryTestHooks.setSdk({ init() {}, getIsolationScope() { return { setUser(value) { calls.push(["user", value]); }, setTag(key, value) { calls.push([key, value]); } }; } });
  initializeSentry(enabledEnv);
  let nextCalls = 0;
  sentryRequestContextMiddleware({ id: "request-1", headers: { authorization: "Bearer private" } }, {}, () => { nextCalls += 1; });
  sentryRequestContextMiddleware({ id: "request-2" }, {}, () => { nextCalls += 1; });
  assert.deepEqual(calls, [["user", null], ["request_id", "request-1"], ["user", null], ["request_id", "request-2"]]);
  assert.equal(nextCalls, 2);

  __sentryTestHooks.reset();
  sentryRequestContextMiddleware({}, {}, () => { nextCalls += 1; });
  assert.equal(nextCalls, 3);
});

test("status resolver excludes every expected 4xx and falls back safely", () => {
  assert.equal(resolveSentryStatusCode({ statusCode: "invalid", status: 404 }), 404);
  assert.equal(resolveSentryStatusCode({ statusCode: 0, status: 401 }), 401);
  assert.equal(resolveSentryStatusCode({ statusCode: 503, status: 404 }), 503);
  assert.equal(resolveSentryStatusCode({ statusCode: "500" }), 500);
  assert.equal(resolveSentryStatusCode({ status: "429" }), 429);
  assert.equal(resolveSentryStatusCode({}), 500);
  for (const value of ["", "500.5", NaN, Infinity, true, {}, [], 99, 600]) {
    assert.equal(resolveSentryStatusCode({ statusCode: value }), 500);
  }
  for (let status = 400; status <= 499; status += 1) assert.equal(shouldCaptureSentryError({ statusCode: status }), false);
  assert.equal(shouldCaptureSentryError({ statusCode: 500 }), true);
  assert.equal(shouldCaptureSentryError({ status: 503 }), true);
  assert.equal(shouldCaptureSentryError({ statusCode: "invalid", status: 404 }), false);
  assert.equal(shouldCaptureSentryError(new Error("Not allowed by CORS")), false);
  assert.equal(shouldCaptureSentryError({ statusCode: true, status: [] }), true);
});

test("duplicate marker is private and only marks accepted errors", () => {
  const expected = new Error("expected");
  expected.statusCode = 404;
  assert.equal(shouldCaptureSentryError(expected), false);
  expected.statusCode = 500;
  assert.equal(shouldCaptureSentryError(expected), true);
  assert.equal(shouldCaptureSentryError(expected), false);
  assert.equal(shouldCaptureSentryError(new Error("other")), true);

  const malformed = new Error("malformed");
  malformed.statusCode = "invalid";
  malformed.status = 404;
  assert.equal(shouldCaptureSentryError(malformed), false);
  assert.equal(Object.getOwnPropertySymbols(malformed).length, 0);

  const marker = Object.getOwnPropertySymbols(expected)[0];
  assert.equal(Object.getOwnPropertyDescriptor(expected, marker).enumerable, false);
  assert.equal(JSON.stringify(expected).includes("sentryCaptured"), false);
});

test("Express installation is inactive-safe, per-app, retry-safe, and response-free", () => {
  assert.equal(installSentryExpressErrorHandler({}), false);
  const calls = [];
  __sentryTestHooks.setSdk({ init() {}, setupExpressErrorHandler(app, options) { calls.push({ app, options }); } });
  initializeSentry(enabledEnv);
  const appA = {};
  const appB = {};
  assert.equal(installSentryExpressErrorHandler(appA), true);
  assert.equal(installSentryExpressErrorHandler(appA), false);
  assert.equal(installSentryExpressErrorHandler(appB), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.shouldHandleError, shouldCaptureSentryError);
  assert.equal(Object.hasOwn(calls[0].app, "body"), false);

  __sentryTestHooks.reset();
  let failures = 0;
  __sentryTestHooks.setSdk({ init() {}, setupExpressErrorHandler() { failures += 1; if (failures === 1) throw new Error("private SDK failure"); } });
  initializeSentry(enabledEnv);
  const retryApp = {};
  assert.equal(installSentryExpressErrorHandler(retryApp), false);
  assert.equal(installSentryExpressErrorHandler(retryApp), true);
});

test("Sentry handler delegates to existing error middleware without changing responses", () => {
  const handlers = [];
  let captures = 0;
  const app = { use(handler) { handlers.push(handler); } };
  __sentryTestHooks.setSdk({
    init() {},
    setupExpressErrorHandler(nextApp, { shouldHandleError }) {
      nextApp.use((error, req, res, next) => {
        if (shouldHandleError(error)) captures += 1;
        next(error);
      });
    },
  });
  initializeSentry(enabledEnv);
  installSentryExpressErrorHandler(app);
  const errorMiddleware = createErrorMiddleware({ logger: { error() {} } });

  const serverError = new Error("private");
  serverError.statusCode = 500;
  const serverResponse = makeResponse();
  handlers[0](serverError, { id: "request-1" }, serverResponse, (error) => errorMiddleware(error, { id: "request-1" }, serverResponse, () => {}));
  assert.equal(captures, 1);
  assert.equal(serverResponse.responseCount, 1);
  assert.deepEqual(serverResponse.body, { message: "Internal server error" });
  assert.equal(serverResponse.headers["x-request-id"], "request-1");

  const clientError = new Error("Bad request");
  clientError.statusCode = 400;
  const clientResponse = makeResponse();
  handlers[0](clientError, { id: "request-1" }, clientResponse, (error) => errorMiddleware(error, { id: "request-1" }, clientResponse, () => {}));
  assert.equal(captures, 1);
  assert.equal(clientResponse.statusCode, 400);
  assert.equal(clientResponse.responseCount, 1);
  assert.deepEqual(clientResponse.body, { message: "Bad request" });
});
