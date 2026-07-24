import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import { ipKeyGenerator } from "express-rate-limit";

import {
  createIpRateLimitKeyGenerator,
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
  headers = {},
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
  headers,
  ip,
  method,
  originalUrl,
  params,
  query,
  user,
});

const createResponse = () => {
  const response = new EventEmitter();

  return Object.assign(response, {
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
      this.emit("finish");
      return this;
    },
  });
};

const runLimiter = async (limiter, req) => {
  const res = createResponse();
  let nextCalled = false;

  await limiter(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, res };
};

const createWebhookFailureLimiter = (limit = 2) =>
  createJsonRateLimiter({
    windowMs: 60 * 1000,
    limit,
    enabled: true,
    keyGenerator: createIpRateLimitKeyGenerator,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.statusCode >= 200 && res.statusCode < 300,
  });

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

test("webhook failures reach 429 while successful retries do not consume quota", async () => {
  const successOnlyLimiter = createWebhookFailureLimiter(1);
  const successRequest = createRequest({
    ip: "::ffff:203.0.113.10",
    headers: { "x-signature": "sig-1", "x-event-id": "evt-1" },
    body: { paymentId: "pay-1" },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await runLimiter(successOnlyLimiter, successRequest);
    assert.equal(result.nextCalled, true);
    result.res.status(200).json({ ok: true });
  }

  const stillAllowed = await runLimiter(successOnlyLimiter, successRequest);
  assert.equal(stillAllowed.nextCalled, true);
  stillAllowed.res.status(204).json({ ok: true });

  const failureLimiter = createWebhookFailureLimiter(2);
  const firstFailure = await runLimiter(
    failureLimiter,
    createRequest({ ip: "::ffff:203.0.113.11" })
  );
  assert.equal(firstFailure.nextCalled, true);
  firstFailure.res.status(400).json({ code: "BAD_WEBHOOK", message: "Invalid webhook" });

  const secondFailure = await runLimiter(
    failureLimiter,
    createRequest({ ip: "::ffff:203.0.113.11" })
  );
  assert.equal(secondFailure.nextCalled, true);
  secondFailure.res.status(500).json({ code: "BAD_WEBHOOK", message: "Invalid webhook" });

  const blocked = await runLimiter(
    failureLimiter,
    createRequest({ ip: "::ffff:203.0.113.11" })
  );

  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.deepEqual(blocked.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});

test("webhook failure counters ignore signature and payment identifiers", async () => {
  const limiter = createWebhookFailureLimiter(2);

  for (const request of [
    createRequest({
      ip: "198.51.100.25",
      headers: {
        "x-webhook-signature": "sig-a",
        "x-event-id": "evt-a",
        "x-payment-id": "pay-a",
      },
      params: { provider: "alpha" },
      query: { eventId: "evt-a" },
      body: { eventId: "evt-a", paymentId: "pay-a" },
    }),
    createRequest({
      ip: "198.51.100.25",
      headers: {
        "x-webhook-signature": "sig-b",
        "x-event-id": "evt-b",
        "x-payment-id": "pay-b",
      },
      params: { provider: "beta" },
      query: { eventId: "evt-b" },
      body: { eventId: "evt-b", paymentId: "pay-b" },
    }),
  ]) {
    const result = await runLimiter(limiter, request);
    assert.equal(result.nextCalled, true);
    result.res.status(400).json({ code: "BAD_WEBHOOK", message: "Invalid webhook" });
  }

  const blocked = await runLimiter(
    limiter,
    createRequest({
      ip: "198.51.100.25",
      headers: {
        "x-webhook-signature": "sig-c",
        "x-event-id": "evt-c",
        "x-payment-id": "pay-c",
      },
      params: { provider: "gamma" },
      query: { eventId: "evt-c" },
      body: { eventId: "evt-c", paymentId: "pay-c" },
    })
  );

  assert.equal(blocked.nextCalled, false);
  assert.deepEqual(blocked.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
});

test("webhook failure limiter keeps normalized IP counters independent and IPv6-safe", async () => {
  const limiter = createWebhookFailureLimiter(1);
  const firstIp = "::ffff:203.0.113.30";
  const secondIp = "::ffff:203.0.113.31";
  const ipv6 = "2001:db8::9";

  assert.equal(
    createIpRateLimitKeyGenerator(createRequest({ ip: ipv6 })),
    ipKeyGenerator(ipv6)
  );

  const firstRequest = await runLimiter(limiter, createRequest({ ip: firstIp }));
  assert.equal(firstRequest.nextCalled, true);
  firstRequest.res.status(400).json({ code: "BAD_WEBHOOK", message: "Invalid webhook" });

  const secondRequest = await runLimiter(limiter, createRequest({ ip: secondIp }));
  assert.equal(secondRequest.nextCalled, true);
  secondRequest.res.status(400).json({ code: "BAD_WEBHOOK", message: "Invalid webhook" });

  const blockedFirst = await runLimiter(limiter, createRequest({ ip: firstIp }));
  const blockedSecond = await runLimiter(limiter, createRequest({ ip: secondIp }));

  assert.equal(blockedFirst.nextCalled, false);
  assert.equal(blockedSecond.nextCalled, false);
  assert.deepEqual(blockedFirst.res.body, {
    message: rateLimitMessage,
    code: rateLimitCode,
  });
  assert.deepEqual(blockedSecond.res.body, {
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
