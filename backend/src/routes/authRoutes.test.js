import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authLimiter,
  createJsonRateLimiter,
  rateLimitCode,
  rateLimitMessage,
} from "../middleware/rateLimitMiddleware.js";
import authRoutes from "./authRoutes.js";

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

  assert.equal(loginRoute.route.stack[0].handle, authLimiter);
  assert.equal(registerRoute.route.stack[0].handle, authLimiter);
  assert.deepEqual(routes["/login"], ["<anonymous>", "loginUser"]);
  assert.deepEqual(routes["/register"], ["<anonymous>", "registerUser"]);
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
