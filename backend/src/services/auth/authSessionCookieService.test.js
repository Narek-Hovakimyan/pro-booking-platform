import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  clearRuntimeRefreshCookie,
  readRuntimeRefreshToken,
  resolveRuntimeRefreshCookieOptions,
  setRuntimeRefreshCookie,
} from "./authSessionCookieService.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalSameSite = process.env.AUTH_REFRESH_COOKIE_SAME_SITE;

function restoreEnvironment() {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalSameSite === undefined) delete process.env.AUTH_REFRESH_COOKIE_SAME_SITE;
  else process.env.AUTH_REFRESH_COOKIE_SAME_SITE = originalSameSite;
}

afterEach(restoreEnvironment);

test("runtime defaults keep development/test cookies insecure and lax", () => {
  process.env.NODE_ENV = "test";
  delete process.env.AUTH_REFRESH_COOKIE_SAME_SITE;
  const response = { cookies: [], clears: [], cookie(name, value, options) { this.cookies.push({ name, value, options }); }, clearCookie(name, options) { this.clears.push({ name, options }); } };

  assert.deepEqual(resolveRuntimeRefreshCookieOptions(), {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  setRuntimeRefreshCookie(response, "runtime-token");
  clearRuntimeRefreshCookie(response);
  assert.equal(readRuntimeRefreshToken({ headers: { cookie: "hairbook-refresh=runtime-token" } }), "runtime-token");
  assert.equal(response.cookies[0].name, "hairbook-refresh");
  assert.equal(response.cookies[0].options.sameSite, "lax");
  assert.equal(response.clears[0].name, "hairbook-refresh");
  assert.equal(response.clears[0].options.sameSite, "lax");
});

test("production defaults and configured SameSite use secure host cookies", () => {
  process.env.NODE_ENV = "production";
  delete process.env.AUTH_REFRESH_COOKIE_SAME_SITE;
  assert.equal(resolveRuntimeRefreshCookieOptions().secure, true);
  assert.equal(resolveRuntimeRefreshCookieOptions().sameSite, "lax");

  process.env.AUTH_REFRESH_COOKIE_SAME_SITE = "none";
  const calls = { cookies: [], clears: [] };
  const response = {
    cookie(name, value, options) { calls.cookies.push({ name, value, options }); },
    clearCookie(name, options) { calls.clears.push({ name, options }); },
  };
  setRuntimeRefreshCookie(response, "runtime-token");
  clearRuntimeRefreshCookie(response);
  assert.equal(resolveRuntimeRefreshCookieOptions().sameSite, "none");
  assert.equal(calls.cookies[0].name, "__Host-hairbook-refresh");
  assert.equal(calls.cookies[0].options.secure, true);
  assert.equal(calls.cookies[0].options.sameSite, "none");
  assert.equal(calls.clears[0].name, "__Host-hairbook-refresh");
  assert.equal(calls.clears[0].options.secure, true);
  assert.equal(calls.clears[0].options.sameSite, "none");
  assert.equal(readRuntimeRefreshToken({ headers: { cookie: "__Host-hairbook-refresh=runtime-token" } }), "runtime-token");
});

test("invalid SameSite configuration fails before response helpers", () => {
  process.env.NODE_ENV = "test";
  process.env.AUTH_REFRESH_COOKIE_SAME_SITE = "none";
  const calls = { cookie: 0, clearCookie: 0 };
  const response = {
    cookie() { calls.cookie += 1; },
    clearCookie() { calls.clearCookie += 1; },
  };

  assert.throws(() => setRuntimeRefreshCookie(response, "runtime-token"), /Secure=true/);
  assert.throws(() => clearRuntimeRefreshCookie(response), /Secure=true/);
  assert.equal(calls.cookie, 0);
  assert.equal(calls.clearCookie, 0);
});
