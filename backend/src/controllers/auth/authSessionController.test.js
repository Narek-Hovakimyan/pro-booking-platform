import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { afterEach, test } from "node:test";

import { getLogger, resetLogger } from "../../config/logger.js";
import {
  REFRESH_SESSION_ERROR_CODES,
  RefreshSessionError,
} from "../../services/auth/refreshSessionService.js";
import {
  __resetAuthSessionControllerDependencies,
  __setAuthSessionControllerDependencies,
  logoutAllAuthSessions,
  logoutAuthSession,
  refreshAuthSession,
} from "./authSessionController.js";

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const originalSameSite = process.env.AUTH_REFRESH_COOKIE_SAME_SITE;
const jwtSecret = "auth-session-controller-test-secret";

function createResponse({ failCookie = false } = {}) {
  return {
    statusCode: 200,
    body: undefined,
    cookieCalls: [],
    clearCookieCalls: [],
    ended: false,
    cookie(name, value, options) {
      if (failCookie) throw new Error("cookie failed");
      this.cookieCalls.push({ name, value, options });
    },
    clearCookie(name, options) {
      this.clearCookieCalls.push({ name, options });
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function createRequest({ cookie = "hairbook-refresh=old-refresh", user, body, query } = {}) {
  return {
    body,
    query,
    headers: { cookie, authorization: "Bearer ignored-refresh-token" },
    ip: "203.0.113.10",
    user,
    get(name) {
      if (name.toLowerCase() === "user-agent") return " Test Agent ";
      return this.headers[name.toLowerCase()];
    },
  };
}

function findByIdReturning(user, expectedId) {
  return (userId) => {
    assert.equal(userId, expectedId);
    return {
      select(selection) {
        assert.equal(selection, "-password +authVersion");
        return user;
      },
    };
  };
}

afterEach(() => {
  __resetAuthSessionControllerDependencies();
  resetLogger();

  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalSameSite === undefined) delete process.env.AUTH_REFRESH_COOKIE_SAME_SITE;
  else process.env.AUTH_REFRESH_COOKIE_SAME_SITE = originalSameSite;
});

test("refresh rotates only the cookie token and returns current compatible auth response", async () => {
  process.env.JWT_SECRET = jwtSecret;
  const userId = "64d000000000000000000001";
  const user = {
    _id: userId,
    name: "Fresh User",
    phone: "+37400111222",
    email: "fresh@example.com",
    role: "barber",
    authVersion: 3,
    salons: [{ salon: "64d000000000000000000010", status: "approved" }],
    password: "hidden",
  };
  const calls = { rotate: [] };

  __setAuthSessionControllerDependencies({
    User: { findById: findByIdReturning(user, userId) },
    rotateRefreshSession: async (payload) => {
      calls.rotate.push(payload);
      return {
        refreshToken: "new-refresh-token",
        session: {
          userId,
          familyId: "family-1",
          role: "admin",
          salon: "untrusted-session-salon",
        },
      };
    },
  });

  const res = createResponse();
  await refreshAuthSession(
    createRequest({
      cookie: "other=body-token; hairbook-refresh=old-refresh",
      body: { refreshToken: "body-token", userId: "forged" },
      query: { refreshToken: "query-token" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(calls.rotate.length, 1);
  assert.deepEqual(calls.rotate[0], {
    refreshToken: "old-refresh",
    ip: "203.0.113.10",
    userAgent: " Test Agent ",
  });
  const decodedToken = jwt.verify(res.body.token, jwtSecret);
  assert.equal(decodedToken.id, userId);
  assert.equal(decodedToken.av, 3);
  assert.equal(res.body.user.name, "Fresh User");
  assert.deepEqual(res.body.user.salons, user.salons);
  assert.equal(res.body.user.password, undefined);
  assert.equal(JSON.stringify(res.body).includes("new-refresh-token"), false);
  assert.equal(res.cookieCalls.length, 1);
  assert.equal(res.cookieCalls[0].name, "hairbook-refresh");
  assert.equal(res.cookieCalls[0].value, "new-refresh-token");
});

test("refresh rejects missing, malformed, invalid, expired, revoked, and reused cookies generically", async () => {
  for (const { cookie, error } of [
    { cookie: "" },
    { cookie: "hairbook-refresh=%E0%A4%A" },
    { cookie: "hairbook-refresh=one; hairbook-refresh=two" },
    { cookie: "hairbook-refresh=token", error: REFRESH_SESSION_ERROR_CODES.INVALID },
    { cookie: "hairbook-refresh=token", error: REFRESH_SESSION_ERROR_CODES.EXPIRED },
    { cookie: "hairbook-refresh=token", error: REFRESH_SESSION_ERROR_CODES.REVOKED },
    { cookie: "hairbook-refresh=token", error: REFRESH_SESSION_ERROR_CODES.REUSE_DETECTED },
  ]) {
    __resetAuthSessionControllerDependencies();
    __setAuthSessionControllerDependencies({
      rotateRefreshSession: async () => {
        throw new RefreshSessionError(error, "private detail");
      },
    });
    const res = createResponse();

    await refreshAuthSession(createRequest({ cookie }), res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
      message: "Session expired",
      code: "AUTH_REFRESH_FAILED",
    });
    assert.equal("token" in res.body, false);
    assert.equal(res.clearCookieCalls.length, 1);
  }
});

test("refresh revokes remaining family when the rotated user no longer exists", async () => {
  const calls = { family: [] };
  __setAuthSessionControllerDependencies({
    User: { findById: findByIdReturning(null, "missing-user") },
    rotateRefreshSession: async () => ({
      refreshToken: "replacement-token",
      session: { userId: "missing-user", familyId: "family-2" },
    }),
    revokeRefreshFamily: async (payload) => {
      calls.family.push(payload);
    },
  });

  const res = createResponse();
  await refreshAuthSession(createRequest(), res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(calls.family, [{ familyId: "family-2", reason: "user_deleted" }]);
  assert.equal(JSON.stringify(res.body).includes("replacement-token"), false);
  assert.equal(res.clearCookieCalls.length, 1);
});

test("refresh failure after rotation clears the cookie and does not expose replacement tokens", async () => {
  getLogger({ level: "silent" });
  delete process.env.JWT_SECRET;
  __setAuthSessionControllerDependencies({
    User: { findById: findByIdReturning({ _id: "user-1", name: "User", role: "client", authVersion: 0 }, "user-1") },
    rotateRefreshSession: async () => ({
      refreshToken: "replacement-token",
      session: { userId: "user-1", familyId: "family-3" },
    }),
  });

  const res = createResponse();
  await refreshAuthSession(createRequest(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Session refresh failed" });
  assert.equal(JSON.stringify(res.body).includes("replacement-token"), false);
  assert.equal(res.clearCookieCalls.length, 1);
});

test("refresh handles cookie-setting failure after rotation as a generic operational failure", async () => {
  getLogger({ level: "silent" });
  process.env.JWT_SECRET = jwtSecret;
  __setAuthSessionControllerDependencies({
    User: { findById: findByIdReturning({ _id: "user-1", name: "User", role: "client", authVersion: 0 }, "user-1") },
    rotateRefreshSession: async () => ({
      refreshToken: "replacement-token",
      session: { userId: "user-1", familyId: "family-4" },
    }),
  });

  const res = createResponse({ failCookie: true });
  await refreshAuthSession(createRequest(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Session refresh failed" });
  assert.equal(JSON.stringify(res.body).includes("replacement-token"), false);
});

test("refresh and logout use the configured runtime SameSite options", async () => {
  process.env.NODE_ENV = "test";
  process.env.AUTH_REFRESH_COOKIE_SAME_SITE = "strict";
  process.env.JWT_SECRET = jwtSecret;
  __setAuthSessionControllerDependencies({
    User: { findById: findByIdReturning({ _id: "user-1", name: "User", role: "client" }, "user-1") },
    rotateRefreshSession: async () => ({
      refreshToken: "replacement-token",
      session: { userId: "user-1", familyId: "family-runtime" },
    }),
    revokeRefreshToken: async () => {},
  });

  const refreshResponse = createResponse();
  await refreshAuthSession(createRequest(), refreshResponse);
  assert.equal(refreshResponse.cookieCalls[0].options.sameSite, "strict");
  assert.equal(refreshResponse.cookieCalls[0].options.secure, false);

  const logoutResponse = createResponse();
  await logoutAuthSession(createRequest(), logoutResponse);
  assert.equal(logoutResponse.clearCookieCalls[0].options.sameSite, "strict");
  assert.equal(logoutResponse.clearCookieCalls[0].options.secure, false);
});

test("logout revokes only a valid cookie token and remains idempotent for missing or invalid tokens", async () => {
  const revoked = [];
  __setAuthSessionControllerDependencies({
    revokeRefreshToken: async (payload) => {
      revoked.push(payload);
    },
  });

  const validRes = createResponse();
  await logoutAuthSession(createRequest({ cookie: "hairbook-refresh=logout-token" }), validRes);

  assert.equal(validRes.statusCode, 204);
  assert.equal(validRes.ended, true);
  assert.deepEqual(revoked, [{ refreshToken: "logout-token", reason: "logout" }]);
  assert.equal(validRes.clearCookieCalls.length, 1);
  assert.equal(validRes.body, undefined);

  for (const cookie of ["", "hairbook-refresh=%E0%A4%A", "hairbook-refresh=one; hairbook-refresh=two"]) {
    const res = createResponse();
    await logoutAuthSession(createRequest({ cookie }), res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.clearCookieCalls.length, 1);
  }
});

test("logout clears the cookie and returns generic 500 on unexpected revocation failure", async () => {
  getLogger({ level: "silent" });
  __setAuthSessionControllerDependencies({
    revokeRefreshToken: async () => {
      throw new Error("database unavailable");
    },
  });

  const res = createResponse();
  await logoutAuthSession(createRequest(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Logout failed" });
  assert.equal(res.clearCookieCalls.length, 1);
});

test("logout-all revokes only req.user sessions and ignores forged request user IDs", async () => {
  const calls = [];
  __setAuthSessionControllerDependencies({
    revokeAllUserRefreshSessions: async (payload) => {
      calls.push(payload);
    },
  });

  const res = createResponse();
  await logoutAllAuthSessions(
    createRequest({
      user: { _id: "current-user" },
      body: { userId: "forged-body" },
      query: { userId: "forged-query" },
    }),
    res
  );

  assert.equal(res.statusCode, 204);
  assert.deepEqual(calls, [{ userId: "current-user", reason: "logout_all" }]);
  assert.equal(res.clearCookieCalls.length, 1);
  assert.equal(res.body, undefined);
});

test("logout-all clears cookie and returns generic 500 on revocation failure", async () => {
  getLogger({ level: "silent" });
  __setAuthSessionControllerDependencies({
    revokeAllUserRefreshSessions: async () => {
      throw new Error("database unavailable");
    },
  });

  const res = createResponse();
  await logoutAllAuthSessions(createRequest({ user: { _id: "current-user" } }), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Logout failed" });
  assert.equal(res.clearCookieCalls.length, 1);
});
