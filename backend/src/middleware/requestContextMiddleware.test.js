import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { createLogger, resetLogger } from "../config/logger.js";
import { requestContextMiddleware } from "./requestContextMiddleware.js";

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
  const { method = "GET", path = "/", url = path, headers = {}, baseUrl, route } = opts;
  const _headers = {};
  const req = {
    method,
    path,
    url,
    originalUrl: url,
    baseUrl,
    route,
    headers: { ...headers },
    socket: { encrypted: true },
    connection: { encrypted: true },
    ip: "127.0.0.1",
    body: { secret: "body-secret" },
    id: null,
    log: null,
  };

  const res = new EventEmitter();
  res.statusCode = 200;
  res.body = { secret: "response-secret" };
  res.setHeader = (name, value) => {
    _headers[name.toLowerCase()] = value;
  };
  res.getHeader = (name) => _headers[name.toLowerCase()];

  return { req, res };
}

afterEach(() => {
  resetLogger();
});

test("missing incoming ID generates a UUID", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test" });
  let nextCalled = false;

  mw(req, res, () => { nextCalled = true; });

  assert.ok(req.id);
  assert.equal(req.id.length, 36);
  assert.equal(res.getHeader("x-request-id"), req.id);
  assert.ok(nextCalled);
});

test("valid incoming ID is preserved", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test", headers: { "x-request-id": "abc-123.def_456:789" } });

  mw(req, res, () => {});

  assert.equal(req.id, "abc-123.def_456:789");
  assert.equal(res.getHeader("x-request-id"), "abc-123.def_456:789");
});

test("invalid incoming IDs are replaced", () => {
  const invalidIds = ["", "a".repeat(65), "abc def", "hello!", "héllo", ["id1", "id2"]];
  for (const incomingId of invalidIds) {
    const { stream } = makeStream();
    const log = createLogger({ level: "info", stream });
    const mw = requestContextMiddleware(log);
    const { req, res } = makeReqRes({ path: "/test" });
    req.headers["x-request-id"] = incomingId;

    mw(req, res, () => {});

    assert.equal(req.id.length, 36);
    assert.equal(res.getHeader("x-request-id"), req.id);
    resetLogger();
  }
});

test("valid maximum-length ID is preserved", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const incomingId = "a".repeat(64);
  const { req, res } = makeReqRes({ path: "/test", headers: { "x-request-id": incomingId } });

  mw(req, res, () => {});

  assert.equal(req.id, incomingId);
  assert.equal(res.getHeader("x-request-id"), incomingId);
});

test("existing response X-Request-ID cannot mismatch req.id", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test" });
  res.setHeader("x-request-id", "preexisting-response-id");

  mw(req, res, () => {});

  assert.equal(res.getHeader("x-request-id"), req.id);
  assert.notEqual(res.getHeader("x-request-id"), "preexisting-response-id");
});

test("req.log is available", () => {
  const { stream } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test" });

  mw(req, res, () => {});

  assert.ok(req.log);
});

test("normal finish emits one completion log with safe metadata", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test", url: "/test?search=fake-secret&token=abc" });

  mw(req, res, () => {});
  res.emit("finish");

  assert.equal(lines.length, 1);
  const entry = lines[0];
  assert.equal(entry.msg, "request.completed");
  assert.equal(entry.event, "request.completed");
  assert.equal(entry.path, "/test");
  assert.equal(entry.url, undefined);
  assert.equal(entry.method, "GET");
  assert.equal(entry.statusCode, 200);
  assert.ok(Number.isFinite(entry.duration));
  assert.ok(entry.duration >= 0);
  assert.ok(!JSON.stringify(entry).includes("fake-secret"));
  assert.ok(!JSON.stringify(entry).includes("token=abc"));
});

test("close before finish emits one aborted log", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test" });

  mw(req, res, () => {});
  res.emit("close");
  res.emit("finish");

  assert.equal(lines.length, 1);
  assert.equal(lines[0].msg, "request.aborted");
  assert.equal(lines[0].event, "request.aborted");
});

test("finish followed by close still logs once", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test" });

  mw(req, res, () => {});
  res.emit("finish");
  res.emit("close");

  assert.equal(lines.length, 1);
  assert.equal(lines[0].msg, "request.completed");
});

test("repeated mocked finish events log once", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test" });

  mw(req, res, () => {});
  res.emit("finish");
  res.emit("finish");

  assert.equal(lines.length, 1);
});

test("middleware invoked twice does not add duplicate completion logs", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test" });

  mw(req, res, () => {});
  const firstId = req.id;
  mw(req, res, () => {});
  res.emit("finish");

  assert.equal(req.id, firstId);
  assert.equal(res.getHeader("x-request-id"), firstId);
  assert.equal(lines.length, 1);
});

test("route metadata is preferred over raw URL fallback", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({
    baseUrl: "/api/auth",
    route: { path: "/reset" },
    path: "/ignored",
    url: "/api/auth/reset?token=fake-secret&next=%2Faccount",
  });

  mw(req, res, () => {});
  res.emit("finish");

  assert.equal(lines[0].path, "/api/auth/reset");
  assert.ok(!JSON.stringify(lines[0]).includes("fake-secret"));
  assert.ok(!JSON.stringify(lines[0]).includes("%2Faccount"));
});

test("fallback safe path strips multiple and URL-encoded query values", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({
    path: null,
    url: "/api/auth/reset?token=fake-secret&code=url%2Dencoded%2Dsecret&search=needle",
  });

  mw(req, res, () => {});
  res.emit("finish");

  const output = JSON.stringify(lines[0]);
  assert.equal(lines[0].path, "/api/auth/reset");
  assert.ok(!output.includes("fake-secret"));
  assert.ok(!output.includes("url%2Dencoded%2Dsecret"));
  assert.ok(!output.includes("needle"));
  assert.ok(!output.includes("?"));
});

test("malformed incoming request ID is never logged", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({ path: "/test", headers: { "x-request-id": "bad id" } });

  mw(req, res, () => {});
  res.emit("finish");

  assert.ok(!JSON.stringify(lines[0]).includes("bad id"));
});

test("request/response bodies, headers, cookies, auth, IP, user-agent, and uploads are absent", () => {
  const { stream, lines } = makeStream();
  const log = createLogger({ level: "info", stream });
  const mw = requestContextMiddleware(log);
  const { req, res } = makeReqRes({
    path: "/upload",
    headers: {
      authorization: "Bearer fake-secret",
      cookie: "sid=fake-secret",
      "user-agent": "test-agent",
    },
  });
  req.file = { path: "/tmp/upload-fake-secret" };

  mw(req, res, () => {});
  res.emit("finish");

  const entry = lines[0];
  assert.equal(entry.body, undefined);
  assert.equal(entry.req, undefined);
  assert.equal(entry.res, undefined);
  assert.equal(entry.headers, undefined);
  assert.equal(entry.cookie, undefined);
  assert.equal(entry.authorization, undefined);
  assert.equal(entry.ip, undefined);
  assert.equal(entry.userAgent, undefined);
  assert.equal(entry.file, undefined);
  assert.ok(!JSON.stringify(entry).includes("fake-secret"));
});
