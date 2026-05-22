import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createJsonRateLimiter,
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

  assert.deepEqual(routes["/login"], ["<anonymous>", "loginUser"]);
  assert.deepEqual(routes["/register"], ["<anonymous>", "registerUser"]);
});

test("login limiter returns 429 after 15 attempts per IP", async () => {
  const limiter = createJsonRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 15,
  });
  const req = createRequest();

  for (let attempt = 1; attempt <= 15; attempt++) {
    const res = createResponse();
    assert.equal(await runLimiter(limiter, req, res), true);
    assert.equal(res.statusCode, 200);
  }

  const limitedResponse = createResponse();

  assert.equal(await runLimiter(limiter, req, limitedResponse), false);
  assert.equal(limitedResponse.statusCode, 429);
  assert.deepEqual(limitedResponse.body, { message: rateLimitMessage });
});

test("register limiter returns 429 after 5 attempts per IP", async () => {
  const limiter = createJsonRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 5,
  });
  const req = createRequest();

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = createResponse();
    assert.equal(await runLimiter(limiter, req, res), true);
    assert.equal(res.statusCode, 200);
  }

  const limitedResponse = createResponse();

  assert.equal(await runLimiter(limiter, req, limitedResponse), false);
  assert.equal(limitedResponse.statusCode, 429);
  assert.deepEqual(limitedResponse.body, { message: rateLimitMessage });
});
