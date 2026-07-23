import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __resetAuthSessionIssuanceDependencies,
  __setAuthSessionIssuanceDependencies,
  issueAuthSession,
} from "./authSessionIssuanceService.js";

const user = { _id: "64d000000000000000000001", name: "Current User", authVersion: 2 };
const request = {
  ip: "203.0.113.10",
  headers: { "user-agent": "test-agent" },
  get(name) { return name === "user-agent" ? "test-agent" : undefined; },
};

function response() {
  return {
    cookies: [],
    clears: [],
    cookie(name, value, options) { this.cookies.push({ name, value, options }); },
    clearCookie(name, options) { this.clears.push({ name, options }); },
  };
}

afterEach(() => {
  __resetAuthSessionIssuanceDependencies();
});

test("prepares the access response and validates cookies before creating one session", async () => {
  const events = [];
  const res = response();
  const replacement = { refreshToken: "new-refresh-token", session: { _id: "session-1" } };
  __setAuthSessionIssuanceDependencies({
    signAccessToken: (currentUser) => { events.push(["sign", currentUser]); return "access-token"; },
    serializeAuthUser: (currentUser) => { events.push(["serialize", currentUser]); return { id: currentUser._id }; },
    resolveRuntimeRefreshCookieOptions: () => { events.push(["options"]); return { secure: false }; },
    readRuntimeRefreshToken: () => { events.push(["read"]); return null; },
    createRefreshSession: async (payload) => { events.push(["create", payload]); return replacement; },
    setRuntimeRefreshCookie: (responseValue, token) => { events.push(["set", responseValue, token]); },
  });

  const result = await issueAuthSession({ req: request, res, user });

  assert.deepEqual(result, { token: "access-token", user: { id: user._id } });
  assert.deepEqual(events.map(([name]) => name), ["sign", "serialize", "options", "read", "create", "set"]);
  assert.equal(events[0][1], user);
  assert.deepEqual(events[4][1], { userId: user._id, authVersion: 2, ip: request.ip, userAgent: "test-agent" });
  assert.equal(JSON.stringify(result).includes("new-refresh-token"), false);
});

test("revokes a prior cookie token and ignores known invalid old-token failures", async () => {
  const calls = [];
  __setAuthSessionIssuanceDependencies({
    signAccessToken: () => "access-token",
    serializeAuthUser: () => ({ id: user._id }),
    resolveRuntimeRefreshCookieOptions: () => ({}),
    readRuntimeRefreshToken: () => "old-refresh-token",
    revokeRefreshToken: async (payload) => { calls.push(payload); },
    createRefreshSession: async () => ({ refreshToken: "new-refresh-token", session: {} }),
    setRuntimeRefreshCookie: () => {},
  });

  await issueAuthSession({ req: request, res: response(), user });
  assert.deepEqual(calls, [{ refreshToken: "old-refresh-token", reason: "logout" }]);

  __setAuthSessionIssuanceDependencies({
    revokeRefreshToken: async () => { throw Object.assign(new Error("expired"), { code: "REFRESH_TOKEN_EXPIRED" }); },
    createRefreshSession: async () => ({ refreshToken: "replacement", session: {} }),
  });
  await issueAuthSession({ req: request, res: response(), user });
});

test("operational old-session or creation failures fail before cookie issuance", async () => {
  let createCalls = 0;
  let setCalls = 0;
  __setAuthSessionIssuanceDependencies({
    signAccessToken: () => "access-token",
    serializeAuthUser: () => ({ id: user._id }),
    resolveRuntimeRefreshCookieOptions: () => ({}),
    readRuntimeRefreshToken: () => "old-refresh-token",
    revokeRefreshToken: async () => { throw new Error("database unavailable"); },
    createRefreshSession: async () => { createCalls += 1; return {}; },
    setRuntimeRefreshCookie: () => { setCalls += 1; },
  });
  await assert.rejects(() => issueAuthSession({ req: request, res: response(), user }), /issuance failed/);
  assert.equal(createCalls, 0);
  assert.equal(setCalls, 0);

  __setAuthSessionIssuanceDependencies({
    readRuntimeRefreshToken: () => null,
    createRefreshSession: async () => { throw new Error("database unavailable"); },
  });
  await assert.rejects(() => issueAuthSession({ req: request, res: response(), user }), /issuance failed/);
});

test("cookie failure revokes the replacement and clears the cookie without leaking it", async () => {
  const calls = [];
  __setAuthSessionIssuanceDependencies({
    signAccessToken: () => "access-token",
    serializeAuthUser: () => ({ id: user._id }),
    resolveRuntimeRefreshCookieOptions: () => ({}),
    readRuntimeRefreshToken: () => null,
    createRefreshSession: async () => ({ refreshToken: "replacement-secret", session: {} }),
    setRuntimeRefreshCookie: () => { throw new Error("set cookie failed"); },
    revokeRefreshToken: async (payload) => { calls.push(["revoke", payload]); },
    clearRuntimeRefreshCookie: () => { calls.push(["clear"]); },
  });

  await assert.rejects(
    () => issueAuthSession({ req: request, res: response(), user }),
    (error) => error.message === "Authentication session issuance failed" && !error.message.includes("replacement-secret")
  );
  assert.deepEqual(calls, [["revoke", { refreshToken: "replacement-secret", reason: "logout" }], ["clear"]]);
});

test("invalid runtime cookie configuration prevents all session writes", async () => {
  let createCalls = 0;
  __setAuthSessionIssuanceDependencies({
    signAccessToken: () => "access-token",
    serializeAuthUser: () => ({ id: user._id }),
    resolveRuntimeRefreshCookieOptions: () => { throw new TypeError("invalid cookie configuration"); },
    createRefreshSession: async () => { createCalls += 1; return {}; },
  });
  await assert.rejects(() => issueAuthSession({ req: request, res: response(), user }), /invalid cookie configuration/);
  assert.equal(createCalls, 0);
});
