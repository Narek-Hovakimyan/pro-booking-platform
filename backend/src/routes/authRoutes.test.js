import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authLimiter,
  createJsonRateLimiter,
  rateLimitCode,
  rateLimitMessage,
  securityMutationLimiter,
} from "../middleware/rateLimitMiddleware.js";
import { requireAuthCookieRequestSecurity } from "../middleware/authCsrfMiddleware.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  logoutAllAuthSessions,
  logoutAuthSession,
  refreshAuthSession,
} from "../controllers/auth/authSessionController.js";
import { googleAuth, loginUser, registerUser } from "../controllers/auth/authController.js";
import authRoutes from "./auth/authRoutes.js";

const createRequest = () => ({
  app: {
    get(setting) {
      return setting === "trust proxy" ? false : undefined;
    },
  },
  headers: {},
  ip: "127.0.0.1",
  method: "POST",
  originalUrl: "/api/auth/test",
});

const createResponse = () => ({
  body: undefined,
  headers: {},
  statusCode: 200,
  getHeader(name) {
    return this.headers[name.toLowerCase()];
  },
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const runLimiter = async (limiter, req, res) => {
  let nextCalled = false;

  await limiter(req, res, () => {
    nextCalled = true;
  });

  return nextCalled;
};

test("auth routes apply rate limiters before controllers", () => {
  const routes = Object.fromEntries(
    authRoutes.stack.map((layer) => [
      layer.route.path,
      layer.route.stack.map((stackLayer) => stackLayer.name),
    ])
  );

  const loginRoute = authRoutes.stack.find((layer) => layer.route.path === "/login");
  const registerRoute = authRoutes.stack.find((layer) => layer.route.path === "/register");
  const forgotPasswordRoute = authRoutes.stack.find(
    (layer) => layer.route.path === "/forgot-password"
  );
  const googleRoute = authRoutes.stack.find((layer) => layer.route.path === "/google");
  const resetPasswordRoute = authRoutes.stack.find(
    (layer) => layer.route.path === "/reset-password"
  );
  const refreshRoute = authRoutes.stack.find((layer) => layer.route.path === "/refresh");
  const logoutRoute = authRoutes.stack.find((layer) => layer.route.path === "/logout");
  const logoutAllRoute = authRoutes.stack.find((layer) => layer.route.path === "/logout-all");

  assert.equal(loginRoute.route.stack[0].handle, authLimiter);
  assert.equal(registerRoute.route.stack[0].handle, authLimiter);
  assert.equal(registerRoute.route.stack[1].handle, requireAuthCookieRequestSecurity);
  assert.equal(registerRoute.route.stack[2].handle, registerUser);
  assert.equal(loginRoute.route.stack[1].handle, requireAuthCookieRequestSecurity);
  assert.equal(loginRoute.route.stack[2].handle, loginUser);
  assert.equal(googleRoute.route.stack[0].handle, authLimiter);
  assert.equal(googleRoute.route.stack[1].handle, requireAuthCookieRequestSecurity);
  assert.equal(googleRoute.route.stack[2].handle, googleAuth);
  assert.equal(forgotPasswordRoute.route.stack[0].handle, authLimiter);
  assert.equal(resetPasswordRoute.route.stack[0].handle, authLimiter);
  assert.equal(refreshRoute.route.stack[0].handle, authLimiter);
  assert.equal(refreshRoute.route.stack[1].handle, requireAuthCookieRequestSecurity);
  assert.equal(refreshRoute.route.stack[2].handle, refreshAuthSession);
  assert.equal(logoutRoute.route.stack[0].handle, authLimiter);
  assert.equal(logoutRoute.route.stack[1].handle, requireAuthCookieRequestSecurity);
  assert.equal(logoutRoute.route.stack[2].handle, logoutAuthSession);
  assert.equal(logoutAllRoute.route.stack[0].handle, protect);
  assert.equal(logoutAllRoute.route.stack[1].handle, securityMutationLimiter);
  assert.equal(logoutAllRoute.route.stack[2].handle, requireAuthCookieRequestSecurity);
  assert.equal(logoutAllRoute.route.stack[3].handle, logoutAllAuthSessions);
  assert.deepEqual(routes["/login"], ["<anonymous>", "requireAuthCookieRequestSecurity", "loginUser"]);
  assert.deepEqual(routes["/register"], ["<anonymous>", "requireAuthCookieRequestSecurity", "registerUser"]);
  assert.deepEqual(routes["/google"], ["<anonymous>", "requireAuthCookieRequestSecurity", "googleAuth"]);
  assert.deepEqual(routes["/forgot-password"], ["<anonymous>", "forgotPassword"]);
  assert.deepEqual(routes["/reset-password"], ["<anonymous>", "resetPassword"]);
  assert.deepEqual(routes["/refresh"], ["<anonymous>", "requireAuthCookieRequestSecurity", "refreshAuthSession"]);
  assert.deepEqual(routes["/logout"], ["<anonymous>", "requireAuthCookieRequestSecurity", "logoutAuthSession"]);
  assert.deepEqual(routes["/logout-all"], ["protect", "<anonymous>", "requireAuthCookieRequestSecurity", "logoutAllAuthSessions"]);
  assert.equal(authRoutes.stack.filter((layer) => layer.route.path === "/refresh").length, 1);
  assert.equal(authRoutes.stack.filter((layer) => layer.route.path === "/logout").length, 1);
  assert.equal(authRoutes.stack.filter((layer) => layer.route.path === "/logout-all").length, 1);
  assert.equal(authRoutes.stack.filter((layer) => layer.route.path === "/register").length, 1);
  assert.equal(authRoutes.stack.filter((layer) => layer.route.path === "/login").length, 1);
  assert.equal(authRoutes.stack.filter((layer) => layer.route.path === "/google").length, 1);
});

test("auth limiter returns 429 after threshold per IP", async () => {
  const limiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    enabled: true,
  });
  const req = createRequest();

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = createResponse();
    assert.equal(await runLimiter(limiter, req, res), true);
    assert.equal(res.statusCode, 200);
  }

  const limitedResponse = createResponse();

  assert.equal(await runLimiter(limiter, req, limitedResponse), false);
  assert.equal(limitedResponse.statusCode, 429);
  assert.deepEqual(limitedResponse.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});

test("limiter is disabled when configured off", async () => {
  const limiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 1,
    enabled: false,
  });
  const req = createRequest();

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = createResponse();
    assert.equal(await runLimiter(limiter, req, res), true);
    assert.equal(res.statusCode, 200);
  }
});
