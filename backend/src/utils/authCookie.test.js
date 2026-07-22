import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { REFRESH_SESSION_TTL_MS } from "../services/auth/refreshSessionService.js";
import {
  clearRefreshCookie,
  readRefreshTokenFromCookieHeader,
  resolveRefreshCookieName,
  resolveRefreshCookieOptions,
  setRefreshCookie,
} from "./authCookie.js";

const originalNodeEnv = process.env.NODE_ENV;

function createResponseDouble() {
  return {
    cookieCalls: [],
    clearCookieCalls: [],
    cookie(name, value, options) {
      this.cookieCalls.push({ name, value, options });
    },
    clearCookie(name, options) {
      this.clearCookieCalls.push({ name, options });
    },
  };
}

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("production refresh cookies use the __Host name and secure default attributes", () => {
  process.env.NODE_ENV = "production";

  assert.equal(resolveRefreshCookieName(), "__Host-hairbook-refresh");
  assert.deepEqual(resolveRefreshCookieOptions(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_SESSION_TTL_MS,
  });
  assert.equal(resolveRefreshCookieOptions({ nodeEnv: "production", secure: true }).secure, true);
});

test("development/test refresh cookies use the non-__Host name and safe defaults", () => {
  process.env.NODE_ENV = "test";

  assert.equal(resolveRefreshCookieName(), "hairbook-refresh");
  assert.deepEqual(resolveRefreshCookieOptions(), {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_SESSION_TTL_MS,
  });
  assert.equal(resolveRefreshCookieOptions({ nodeEnv: "development", secure: false }).secure, false);
  assert.equal(resolveRefreshCookieOptions({ nodeEnv: "test", secure: true }).secure, true);
});

test("sameSite validation enforces accepted values and secure none semantics", () => {
  assert.equal(resolveRefreshCookieOptions({ sameSite: "strict", secure: true }).sameSite, "strict");
  assert.equal(resolveRefreshCookieOptions({ sameSite: "none", secure: true }).secure, true);
  assert.equal(resolveRefreshCookieOptions({ sameSite: "none", secure: true }).sameSite, "none");
  assert.throws(() => resolveRefreshCookieOptions({ sameSite: "invalid" }), /sameSite/);
  assert.throws(() => resolveRefreshCookieOptions({ sameSite: "none", secure: false }), /Secure=true/);
  assert.throws(() => resolveRefreshCookieName({ nodeEnv: "production", secure: false }), /Secure=true/);
});

test("production refresh cookie options reject explicit insecure configuration before returning options", () => {
  let result = "not-called";

  assert.throws(
    () => {
      result = resolveRefreshCookieOptions({ nodeEnv: "production", secure: false });
    },
    /Invalid refresh-cookie configuration/
  );
  assert.equal(result, "not-called");
});

test("setRefreshCookie and clearRefreshCookie call response helpers with matching safe options", () => {
  process.env.NODE_ENV = "production";
  const res = createResponseDouble();

  setRefreshCookie(res, "refresh-token");
  clearRefreshCookie(res);

  assert.deepEqual(res.cookieCalls[0], {
    name: "__Host-hairbook-refresh",
    value: "refresh-token",
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_SESSION_TTL_MS,
    },
  });
  assert.deepEqual(res.clearCookieCalls[0], {
    name: "__Host-hairbook-refresh",
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    },
  });
  assert.equal("maxAge" in res.clearCookieCalls[0].options, false);
  assert.equal("expires" in res.clearCookieCalls[0].options, false);
});

test("setRefreshCookie and clearRefreshCookie reject insecure production options before calling response helpers", () => {
  const setResponse = createResponseDouble();
  const clearResponse = createResponseDouble();

  assert.throws(
    () => setRefreshCookie(setResponse, "refresh-token", { nodeEnv: "production", secure: false }),
    /Invalid refresh-cookie configuration/
  );
  assert.throws(
    () => clearRefreshCookie(clearResponse, { nodeEnv: "production", secure: false }),
    /Invalid refresh-cookie configuration/
  );
  assert.deepEqual(setResponse.cookieCalls, []);
  assert.deepEqual(clearResponse.clearCookieCalls, []);
});

test("readRefreshTokenFromCookieHeader matches exact names, trims values, and handles malformed cases safely", () => {
  process.env.NODE_ENV = "test";

  assert.equal(readRefreshTokenFromCookieHeader({ headers: {} }), null);
  assert.equal(readRefreshTokenFromCookieHeader({ headers: { cookie: "" } }), null);
  assert.equal(readRefreshTokenFromCookieHeader({ headers: { cookie: "hairbook-refresh=   " } }), null);
  assert.equal(
    readRefreshTokenFromCookieHeader({
      headers: { cookie: "other=1; hairbook-refresh=  token-value  ; hairbook-refresh-extra=nope" },
    }),
    "token-value"
  );
  assert.equal(
    readRefreshTokenFromCookieHeader({
      headers: { cookie: "other=%E0%A4%A; hairbook-refresh=good-token" },
    }),
    "good-token"
  );
  assert.equal(
    readRefreshTokenFromCookieHeader({
      headers: { cookie: "hairbook-refresh=%E0%A4%A" },
    }),
    null
  );
  assert.equal(
    readRefreshTokenFromCookieHeader({
      headers: { cookie: "hairbook-refresh=one; hairbook-refresh=two" },
    }),
    null
  );
  assert.equal(
    readRefreshTokenFromCookieHeader({
      headers: { cookie: "__Host-hairbook-refresh=prod-token" },
      nodeEnv: "test",
    }),
    null
  );
  assert.equal(
    readRefreshTokenFromCookieHeader({
      headers: { cookie: "__Host-hairbook-refresh=prod-token" },
    }, { nodeEnv: "production" }),
    "prod-token"
  );
});
