import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Writable } from "node:stream";
import { createLogger, sanitizeString, CENSOR, resetLogger } from "./logger.js";

const ORIGINAL_ENV = {
  LOG_LEVEL: process.env.LOG_LEVEL,
  LOG_PRETTY: process.env.LOG_PRETTY,
  NODE_ENV: process.env.NODE_ENV,
};

function makeStream() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  return { stream, lines };
}

afterEach(() => {
  resetLogger();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("logger produces structured JSON output", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  log.info("hello");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].msg, "hello");
  assert.equal(typeof lines[0].time, "number");
  assert.equal(typeof lines[0].level, "number");
});

test("logger includes stable base metadata", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream, service: "test-svc", environment: "test" });
  log.info("metadata check");
  assert.equal(lines[0].service, "test-svc");
  assert.equal(lines[0].environment, "test");
});

test("child logger inherits base and adds metadata", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const child = log.child({ requestId: "abc-123" });
  child.info("child test");
  assert.equal(lines[0].requestId, "abc-123");
  assert.equal(lines[0].service, "hairbook-backend");
});

test("Error serialization includes name, message, stack, and safe code", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const err = new Error("test error");
  err.code = "ECUSTOM";
  log.error({ err }, "error occurred");
  assert.equal(lines[0].err.message, "test error");
  assert.equal(lines[0].err.type, "Error");
  assert.ok(lines[0].err.stack, "stack should be present");
  assert.equal(lines[0].err.code, "ECUSTOM");
});

test("path-based redaction hides sensitive paths", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  log.info({ password: "secret123", token: "abc", authorization: "Bearer xyz" }, "redact test");
  assert.equal(lines[0].password, CENSOR);
  assert.equal(lines[0].token, CENSOR);
  assert.equal(lines[0].authorization, CENSOR);
});

test("sanitizeString redacts Bearer token values", () => {
  const result = sanitizeString("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.secret");
  assert.equal(result, "Authorization: Bearer [REDACTED]");
});

test("sanitizeString redacts JWT-like strings", () => {
  const result = sanitizeString("token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.secret-stuff");
  assert.ok(!result.includes("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0"));
});

test("sanitizeString redacts MongoDB credential URIs", () => {
  const result = sanitizeString("mongodb://user:pass@host:27017/db");
  assert.equal(result, "mongodb://[REDACTED]@host:27017/db");
});

test("sanitizeString redacts mongodb+srv credential URIs", () => {
  const result = sanitizeString("mongodb+srv://admin:secret@cluster.mongodb.net/db");
  assert.equal(result, "mongodb+srv://[REDACTED]@cluster.mongodb.net/db");
});

test("sanitizeString redacts reset/verification token query parameters", () => {
  const result = sanitizeString("https://example.com/reset?token=abc123&exp=9999");
  assert.ok(!result.includes("token=abc123"));
  assert.ok(result.includes("token=[REDACTED]"));
});

test("sanitizeString redacts access_token query parameter", () => {
  const result = sanitizeString("https://example.com/callback?access_token=xyz789");
  assert.ok(result.includes("access_token=[REDACTED]"));
});

test("sanitizeString redacts mixed-case and URL-encoded sensitive query parameters", () => {
  const result = sanitizeString(
    "https://example.com/callback?Access_Token=url%2Dencoded&refresh_token=abc&verificationToken=def%26token%3Dencoded-secret"
  );
  assert.ok(!result.includes("url%2Dencoded"));
  assert.ok(!result.includes("refresh_token=abc"));
  assert.ok(!result.includes("verificationToken=def"));
  assert.ok(!result.includes("encoded-secret"));
  assert.ok(result.includes("Access_Token=[REDACTED]"));
  assert.ok(result.includes("refresh_token=[REDACTED]"));
  assert.ok(result.includes("verificationToken=[REDACTED]"));
});

test("sanitizeString redacts multiple sensitive values in one string", () => {
  const result = sanitizeString(
    "Bearer fake-token mongodb+srv://user:pass@cluster/db?token=abc&code=auth-code"
  );
  assert.ok(!result.includes("fake-token"));
  assert.ok(!result.includes("user:pass"));
  assert.ok(!result.includes("token=abc"));
  assert.ok(!result.includes("code=auth-code"));
});

test("sanitizeString returns non-strings unchanged", () => {
  assert.equal(sanitizeString(123), 123);
  assert.equal(sanitizeString(null), null);
  assert.equal(sanitizeString(undefined), undefined);
});

test("logger can be instantiated with an in-memory stream", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  log.info("stream test");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].msg, "stream test");
});

test("no real credentials appear in serialized output", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  log.info({ password: "super-secret", apiKey: "sk-live-abc123", webhookSecret: "whsec_test" }, "no leak");
  assert.equal(lines[0].password, CENSOR);
  assert.equal(lines[0].apiKey, CENSOR);
  assert.equal(lines[0].webhookSecret, CENSOR);
});

test("redacts common header fields through path-based redact", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  log.info({
    headers: {
      authorization: "Bearer test",
      "proxy-authorization": "Basic dGVzdDpwYXNz",
      cookie: "secret",
    },
  }, "header paths");
  assert.equal(lines[0].headers.authorization, CENSOR);
  assert.equal(lines[0].headers["proxy-authorization"], CENSOR);
  assert.equal(lines[0].headers.cookie, CENSOR);
});

test("redacts common nested header fields through path-based redact", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  log.info({
    config: { headers: { authorization: "Bearer nested-secret", cookie: "sid=nested-secret" } },
    req: { headers: { authorization: "Bearer req-secret", cookie: "sid=req-secret" } },
  }, "nested header paths");

  assert.equal(lines[0].config.headers.authorization, CENSOR);
  assert.equal(lines[0].config.headers.cookie, CENSOR);
  assert.equal(lines[0].req.headers.authorization, CENSOR);
  assert.equal(lines[0].req.headers.cookie, CENSOR);
  assert.ok(!JSON.stringify(lines[0]).includes("nested-secret"));
  assert.ok(!JSON.stringify(lines[0]).includes("req-secret"));
});

test("safe Error serializer sanitizes message and stack and omits nested config", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const err = new Error("failed with Bearer fake-secret and ?token=query-secret");
  err.stack = "Error: failed at /tmp/upload-fake?access_token=stack-secret";
  err.code = "ECUSTOM";
  err.config = {
    headers: { authorization: "Bearer nested-secret", cookie: "sid=nested-secret" },
    body: { password: "nested-secret" },
  };

  log.error({ err }, "sanitized error");

  const output = JSON.stringify(lines[0]);
  assert.equal(lines[0].err.code, "ECUSTOM");
  assert.ok(!output.includes("fake-secret"));
  assert.ok(!output.includes("query-secret"));
  assert.ok(!output.includes("stack-secret"));
  assert.ok(!output.includes("nested-secret"));
  assert.equal(lines[0].err.config, undefined);
});

test("redacts secret, sessionId, MONGO_URI, sentryDsn, mongoUri fields", () => {
  resetLogger();
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  log.info({
    secret: "my-secret",
    sessionId: "abc123",
    MONGO_URI: "mongodb://localhost",
    mongoUri: "mongodb://localhost",
    sentryDsn: "https://key@sentry.io/project",
  }, "extra redact");
  assert.equal(lines[0].secret, CENSOR);
  assert.equal(lines[0].sessionId, CENSOR);
  assert.equal(lines[0].MONGO_URI, CENSOR);
  assert.equal(lines[0].mongoUri, CENSOR);
  assert.equal(lines[0].sentryDsn, CENSOR);
});

test("invalid LOG_LEVEL falls back to info without throwing", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "not-a-level", stream });
  log.info("level fallback");

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, 30);
});

test("empty LOG_LEVEL falls back to info without throwing", () => {
  process.env.LOG_LEVEL = "";
  const { stream, lines } = makeStream();
  const log = createLogger({ stream });
  log.info("empty level fallback");

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, 30);
});

test("production LOG_PRETTY=true still emits structured JSON to the provided stream", () => {
  process.env.LOG_PRETTY = "true";
  process.env.NODE_ENV = "production";
  const { stream, lines } = makeStream();
  const log = createLogger({ stream, environment: "production", pretty: true });
  log.info("production json");

  assert.equal(lines.length, 1);
  assert.equal(lines[0].msg, "production json");
  assert.equal(lines[0].environment, "production");
});
