import assert from "node:assert/strict";
import { test } from "node:test";

import { ipKeyGenerator } from "express-rate-limit";

import {
  createAuthenticatedRateLimitKeyGenerator,
  createAuthenticatedJsonRateLimiter,
  createJsonRateLimiter,
  emailVerificationLimiter,
  rateLimitCode,
  rateLimitMessage,
} from "./rateLimitMiddleware.js";

const createRequest = ({
  ip = "127.0.0.1",
  method = "POST",
  originalUrl = "/api/test",
  user,
  params = {},
  query = {},
  body = {},
} = {}) => ({
  app: {
    get(setting) {
      return setting === "trust proxy" ? false : undefined;
    },
  },
  body,
  headers: {},
  ip,
  method,
  originalUrl,
  params,
  query,
  user,
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

const runLimiter = async (limiter, req) => {
  const res = createResponse();
  let nextCalled = false;

  await limiter(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, res };
};

test("authenticated users on the same IP have independent counters", async () => {
  const limiter = createAuthenticatedJsonRateLimiter({
    namespace: "booking-mutation",
    windowMs: 60 * 1000,
    limit: 2,
    enabled: true,
  });
  const sharedIp = "203.0.113.5";
  const userA = createRequest({ ip: sharedIp, user: { _id: "user-a" } });
  const userB = createRequest({ ip: sharedIp, user: { _id: "user-b" } });

  for (const req of [userA, userA, userB, userB]) {
    const result = await runLimiter(limiter, req);
    assert.equal(result.nextCalled, true);
    assert.equal(result.res.statusCode, 200);
  }

  const limited = await runLimiter(limiter, userA);

  assert.equal(limited.nextCalled, false);
  assert.equal(limited.res.statusCode, 429);
  assert.deepEqual(limited.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});

test("changing route, query, and body IDs does not evade an authenticated limit", async () => {
  const limiter = createAuthenticatedJsonRateLimiter({
    namespace: "waitlist-action",
    windowMs: 60 * 1000,
    limit: 2,
    enabled: true,
  });
  const user = { _id: "stable-user" };

  for (const request of [
    createRequest({
      user,
      params: { id: "booking-1" },
      query: { clientId: "client-1" },
      body: { bookingId: "booking-1", userId: "forged-1" },
    }),
    createRequest({
      user,
      params: { id: "booking-2" },
      query: { clientId: "client-2" },
      body: { bookingId: "booking-2", userId: "forged-2" },
    }),
  ]) {
    const result = await runLimiter(limiter, request);
    assert.equal(result.nextCalled, true);
    assert.equal(result.res.statusCode, 200);
  }

  const limited = await runLimiter(
    limiter,
    createRequest({
      user,
      params: { id: "booking-3" },
      query: { clientId: "client-3" },
      body: { bookingId: "booking-3", userId: "forged-3" },
    })
  );

  assert.equal(limited.nextCalled, false);
  assert.equal(limited.res.statusCode, 429);
});

test("one authenticated user reaches 429 after repeated requests", async () => {
  const limiter = createAuthenticatedJsonRateLimiter({
    namespace: "message-read",
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
  });
  const req = createRequest({ user: { id: "reader-1" } });

  const first = await runLimiter(limiter, req);
  const second = await runLimiter(limiter, req);

  assert.equal(first.nextCalled, true);
  assert.equal(second.nextCalled, false);
  assert.equal(second.res.statusCode, 429);
  assert.deepEqual(second.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});

test("unauthenticated fallback uses IPv6-safe IP normalization", () => {
  const keyGenerator = createAuthenticatedRateLimitKeyGenerator("message-read");
  const ipv6 = "2001:db8:1234:5678:abcd:ef01:2345:6789";

  assert.equal(
    keyGenerator(createRequest({ ip: ipv6 })),
    `auth:message-read:ip:${ipKeyGenerator(ipv6)}`
  );
});

test("authenticated keying trusts only req.user identifiers", () => {
  const keyGenerator = createAuthenticatedRateLimitKeyGenerator("booking-mutation");
  const req = createRequest({
    user: { _id: "trusted-user", id: "ignored-fallback" },
    params: { id: "route-user" },
    query: { userId: "query-user" },
    body: { userId: "body-user" },
  });

  assert.equal(
    keyGenerator(req),
    "auth:booking-mutation:user:trusted-user"
  );
});

test("security mutation limiter keeps authenticated users independent on one IP", async () => {
  const limiter = createAuthenticatedJsonRateLimiter({
    namespace: "security-mutation",
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
  });
  const sharedIp = "198.51.100.20";

  const firstUser = await runLimiter(
    limiter,
    createRequest({ ip: sharedIp, user: { _id: "user-1" } })
  );
  const secondUser = await runLimiter(
    limiter,
    createRequest({ ip: sharedIp, user: { _id: "user-2" } })
  );
  const limitedFirstUser = await runLimiter(
    limiter,
    createRequest({ ip: sharedIp, user: { _id: "user-1" }, body: { email: "forged@example.com" } })
  );

  assert.equal(firstUser.nextCalled, true);
  assert.equal(secondUser.nextCalled, true);
  assert.equal(limitedFirstUser.nextCalled, false);
  assert.deepEqual(limitedFirstUser.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});

test("public email verification limiter falls back to IPv6-safe IP keys", async () => {
  const ipv6 = "2001:db8::8";
  const first = await runLimiter(
    emailVerificationLimiter,
    createRequest({
      ip: ipv6,
      method: "GET",
      originalUrl: "/api/users/me/email/verify?token=first",
      query: { token: "first" },
    })
  );

  assert.equal(first.nextCalled, true);

  const limiter = createJsonRateLimiter({
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });
  const limited = await runLimiter(
    limiter,
    createRequest({
      ip: ipv6,
      method: "GET",
      originalUrl: "/api/users/me/email/verify?token=second",
      query: { token: "second" },
    })
  );
  const blocked = await runLimiter(
    limiter,
    createRequest({
      ip: ipv6,
      method: "GET",
      originalUrl: "/api/users/me/email/verify?token=third",
      query: { token: "third" },
    })
  );

  assert.equal(limited.nextCalled, true);
  assert.equal(blocked.nextCalled, false);
  assert.deepEqual(blocked.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});

test("existing JSON limiter contract remains unchanged", async () => {
  const limiter = createJsonRateLimiter({
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
  });
  const req = createRequest();

  const first = await runLimiter(limiter, req);
  const second = await runLimiter(limiter, req);

  assert.equal(first.nextCalled, true);
  assert.equal(second.nextCalled, false);
  assert.deepEqual(second.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});
