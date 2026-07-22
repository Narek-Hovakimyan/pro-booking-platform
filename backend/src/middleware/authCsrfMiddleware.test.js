import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { requireAuthCookieRequestSecurity } from "./authCsrfMiddleware.js";

const originalClientUrl = process.env.CLIENT_URL;
const originalNodeEnv = process.env.NODE_ENV;

function createReq(headers = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get(name) {
      return normalizedHeaders[name.toLowerCase()];
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function run(headers) {
  const res = createRes();
  let nextCalls = 0;
  requireAuthCookieRequestSecurity(createReq(headers), res, () => {
    nextCalls += 1;
  });
  return { res, nextCalls };
}

function assertForbidden(headers) {
  const { res, nextCalls } = run(headers);
  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Forbidden" });
}

afterEach(() => {
  if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = originalClientUrl;

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("trusted Origin and trusted Referer with exact CSRF header call next once", () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://trusted.example";

  assert.equal(run({ origin: "https://trusted.example", "x-hairbook-csrf": "1" }).nextCalls, 1);
  assert.equal(
    run({ referer: "https://trusted.example/path?x=1", "x-hairbook-csrf": "1" }).nextCalls,
    1
  );
});

test("Origin takes precedence over Referer", () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://trusted.example";

  assertForbidden({
    origin: "https://evil.example",
    referer: "https://trusted.example/account",
    "x-hairbook-csrf": "1",
  });
});

test("missing or incorrect CSRF header is rejected generically", () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://trusted.example";

  assertForbidden({ origin: "https://trusted.example" });
  assertForbidden({ origin: "https://trusted.example", "x-hairbook-csrf": "true" });
});

test("missing, malformed, or untrusted request origins are rejected", () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://trusted.example";

  assertForbidden({ "x-hairbook-csrf": "1" });
  assertForbidden({ origin: "::::", "x-hairbook-csrf": "1" });
  assertForbidden({ referer: "::::", "x-hairbook-csrf": "1" });
  assertForbidden({ origin: "https://evil.test", "x-hairbook-csrf": "1" });
});

test("configured comma-separated origins and development localhost origins are exact", () => {
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "https://one.example, https://two.example";

  assert.equal(run({ origin: "https://one.example", "x-hairbook-csrf": "1" }).nextCalls, 1);
  assert.equal(run({ origin: "https://two.example", "x-hairbook-csrf": "1" }).nextCalls, 1);
  assert.equal(run({ origin: "http://localhost:5173", "x-hairbook-csrf": "1" }).nextCalls, 1);
  assert.equal(run({ origin: "http://127.0.0.1:3000", "x-hairbook-csrf": "1" }).nextCalls, 1);
});

test("production missing CLIENT_URL fails closed", () => {
  process.env.NODE_ENV = "production";
  delete process.env.CLIENT_URL;

  assertForbidden({ origin: "https://trusted.example", "x-hairbook-csrf": "1" });
});

test("origin confusion cases are rejected", () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://trusted.example";

  for (const origin of [
    "http://trusted.example",
    "https://trusted.example:444",
    "https://trusted.example/path",
    "https://app.trusted.example",
    "https://trusted.example.evil.test",
    "https://evil.test/?next=https://trusted.example",
    "https://trusted.example@evil.test",
    "https://user:password@trusted.example",
    "https://evil.test#https://trusted.example",
  ]) {
    assertForbidden({ origin, "x-hairbook-csrf": "1" });
  }
});
