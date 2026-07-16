import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Writable } from "node:stream";
import { createLogger, resetLogger } from "../config/logger.js";
import { createErrorMiddleware, errorMiddleware } from "./errorMiddleware.js";

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

function makeReqRes(opts = {}) {
  const { log, url = "/test", path = "/test", baseUrl, route } = opts;
  const req = {
    id: "test-req-id",
    method: "GET",
    path,
    url,
    originalUrl: url,
    baseUrl,
    route,
    headers: { authorization: "Bearer should-not-log", cookie: "sid=should-not-log" },
    body: { password: "should-not-log" },
    file: { path: "/tmp/upload-should-not-log" },
    log,
  };
  const res = {
    statusCode: 200,
    headersSent: false,
    _status: 200,
    _body: null,
    _jsonCalls: 0,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._jsonCalls += 1;
      this._body = body;
      this._ended = true;
    },
  };
  return { req, res };
}

afterEach(() => {
  resetLogger();
});

test("unexpected 500 is logged exactly once", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  const error = new Error("Something broke");
  error.statusCode = 500;

  errorMiddleware(error, req, res, () => {});

  assert.equal(lines.length, 1);
  assert.equal(lines[0].msg, "Unhandled server error");
  assert.equal(lines[0].requestId, "test-req-id");
  assert.equal(lines[0].statusCode, 500);
  assert.equal(lines[0].method, "GET");
  assert.equal(lines[0].path, "/test");
  assert.equal(lines[0].url, undefined);
  assert.equal(lines[0].err.message, "Something broke");
  assert.equal(res._jsonCalls, 1);
  assert.equal(res._body.message, "Internal server error");
});

test("expected 400/401/403/404 are not logged as unexpected errors", () => {
  for (const statusCode of [400, 401, 403, 404]) {
    const { stream, lines } = makeStream();
    const log = createLogger({ level: "info", stream });
    const { req, res } = makeReqRes({ log });
    const error = new Error("Expected client error");
    error.statusCode = statusCode;

    errorMiddleware(error, req, res, () => {});

    assert.equal(lines.length, 0, `no log for ${statusCode}`);
    assert.equal(res._body.message, "Expected client error");
    resetLogger();
  }
});

test("existing error response body shape is preserved", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  const error = new Error("Bad request");
  error.statusCode = 400;

  errorMiddleware(error, req, res, () => {});

  assert.deepEqual(res._body, { message: "Bad request" });
});

test("production 5xx response does not expose internal error message or stack", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  const error = new Error("Internal details should be hidden");
  error.statusCode = 500;

  errorMiddleware(error, req, res, () => {});

  assert.equal(res._body.message, "Internal server error");
  assert.equal(res._body.stack, undefined);
});

test("request ID is present in logs but not added to JSON response body", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  const error = new Error("Server error");
  error.statusCode = 500;

  errorMiddleware(error, req, res, () => {});

  assert.equal(lines[0].requestId, "test-req-id");
  assert.equal(res._body.requestId, undefined);
  assert.equal(res._body.id, undefined);
});

test("headers-sent behavior delegates correctly", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  res.headersSent = true;
  let delegatedError = null;

  errorMiddleware(new Error("test"), req, res, (error) => {
    delegatedError = error;
  });

  assert.equal(delegatedError.message, "test");
  assert.equal(lines.length, 0);
  assert.equal(res._jsonCalls, 0);
});

test("root logger fallback uses injected in-memory test logger", () => {
  const { stream, lines } = makeStream();
  const fallbackLogger = createLogger({ level: "info", stream });
  const mw = createErrorMiddleware({ logger: fallbackLogger });
  const { req, res } = makeReqRes({});
  delete req.log;
  const error = new Error("No req.log");
  error.statusCode = 500;

  mw(error, req, res, () => {});

  assert.equal(lines.length, 1);
  assert.equal(res._body.message, "Internal server error");
  assert.equal(res._status, 500);
});

test("logger failure still sends the correct response once", () => {
  const throwingLogger = {
    error() {
      throw new Error("logger failed");
    },
  };
  const { req, res } = makeReqRes({ log: throwingLogger });
  const error = new Error("Database failed");
  error.statusCode = 500;

  errorMiddleware(error, req, res, () => {});

  assert.equal(res._jsonCalls, 1);
  assert.equal(res._status, 500);
  assert.deepEqual(res._body, { message: "Internal server error" });
});

test("error logs omit raw query values and URL-encoded values", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({
    log,
    path: null,
    url: "/api/auth/reset?token=fake-secret&code=url%2Dencoded&search=needle",
  });
  const error = new Error("Something broke");
  error.statusCode = 500;

  errorMiddleware(error, req, res, () => {});

  const output = JSON.stringify(lines[0]);
  assert.equal(lines[0].path, "/api/auth/reset");
  assert.equal(lines[0].url, undefined);
  assert.ok(!output.includes("fake-secret"));
  assert.ok(!output.includes("url%2Dencoded"));
  assert.ok(!output.includes("needle"));
  assert.ok(!output.includes("?"));
});

test("embedded secrets in error message and stack are sanitized", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  const error = new Error("Failed with Bearer fake-secret and ?refresh_token=query-secret");
  error.stack = "Error: failed at mongodb://user:pass@localhost/db?verificationToken=stack-secret";
  error.statusCode = 500;

  errorMiddleware(error, req, res, () => {});

  const output = JSON.stringify(lines[0]);
  assert.ok(!output.includes("fake-secret"));
  assert.ok(!output.includes("query-secret"));
  assert.ok(!output.includes("user:pass"));
  assert.ok(!output.includes("stack-secret"));
  assert.ok(output.includes("[REDACTED]"));
});

test("headers, bodies, and upload data are not included in error logs", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  const error = new Error("Server error");
  error.statusCode = 500;

  errorMiddleware(error, req, res, () => {});

  const entry = lines[0];
  assert.equal(entry.headers, undefined);
  assert.equal(entry.body, undefined);
  assert.equal(entry.req, undefined);
  assert.equal(entry.res, undefined);
  assert.equal(entry.file, undefined);
  assert.ok(!JSON.stringify(entry).includes("should-not-log"));
});

test("CORS error returns 403 with specific message", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const { req, res } = makeReqRes({ log });
  const error = new Error("Not allowed by CORS");

  errorMiddleware(error, req, res, () => {});

  assert.equal(res._status, 403);
  assert.deepEqual(res._body, { message: "Origin not allowed by CORS" });
});
