import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, test } from "node:test";

import { ipKeyGenerator } from "express-rate-limit";
import { createErrorMiddleware } from "./errorMiddleware.js";

import {
  createIpRateLimitKeyGenerator,
  createAuthenticatedRateLimitKeyGenerator,
  createAuthenticatedJsonRateLimiter,
  createJsonRateLimiter,
  __resetRateLimitDependencies,
  __setRateLimitDependencies,
  emailVerificationLimiter,
  isRateLimitEnabled,
  rateLimitCode,
  rateLimitMessage,
  rateLimitStoreUnavailableCode,
} from "./rateLimitMiddleware.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalRateLimitEnabled = process.env.RATE_LIMIT_ENABLED;
const originalRedisUrl = process.env.REDIS_URL;

const restoreEnvironment = () => {
  for (const [name, value] of Object.entries({
    NODE_ENV: originalNodeEnv,
    RATE_LIMIT_ENABLED: originalRateLimitEnabled,
    REDIS_URL: originalRedisUrl,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
};

const createRedisCommandHarness = () => {
  const counters = new Map();
  return {
    call(command, ...args) {
      if (command === "SCRIPT") {
        return Promise.resolve(args[1].includes("INCR") ? "increment" : "get");
      }
      if (command === "EVALSHA") {
        const [script, _keyCount, key, windowMs] = args;
        const entry = counters.get(key) || {
          hits: 0,
          expiresAt: Date.now() + Number(windowMs || 60_000),
        };
        if (script === "increment") entry.hits += 1;
        counters.set(key, entry);
        return Promise.resolve([entry.hits, Math.max(1, entry.expiresAt - Date.now())]);
      }
      if (command === "DECR") {
        const entry = counters.get(args[0]);
        if (entry) entry.hits -= 1;
        return Promise.resolve(1);
      }
      if (command === "DEL") {
        counters.delete(args[0]);
        return Promise.resolve(1);
      }
      throw new Error("unexpected Redis command");
    },
  };
};

beforeEach(() => {
  const client = createRedisCommandHarness();
  __setRateLimitDependencies({
    getRedisClient: () => client,
    getRateLimitKeyPrefix: (namespace) => `hairbook:test:rate-limit:${namespace}:`,
  });
});

afterEach(() => {
  __resetRateLimitDependencies();
  restoreEnvironment();
});

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
  let nextError;

  await limiter(req, res, (error) => {
    nextError = error;
    nextCalled = !error;
  });

  return { nextCalled, nextError, res };
};

test("limiters with the same namespace share Redis counters across middleware instances", async () => {
  const firstInstance = createJsonRateLimiter({
    namespace: "shared-counter",
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
  });
  const secondInstance = createJsonRateLimiter({
    namespace: "shared-counter",
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
  });
  const firstRequest = createRequest();
  const secondRequest = createRequest();

  assert.equal((await runLimiter(firstInstance, firstRequest)).nextCalled, true);
  assert.equal((await runLimiter(secondInstance, secondRequest)).res.statusCode, 429);
});

test("Redis store failures fail closed instead of allowing a request", async () => {
  __setRateLimitDependencies({
    getRedisClient: () => {
      throw new Error("redis unavailable");
    },
  });
  const limiter = createJsonRateLimiter({
    namespace: "failure",
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
  });

  const result = await runLimiter(limiter, createRequest());

  assert.equal(result.nextCalled, false);
  assert.ok(result.nextError instanceof Error);
  assert.equal(result.nextError.code, rateLimitStoreUnavailableCode);
  assert.equal(result.res.statusCode, 200);
});

test("development and test default rate limiting off when Redis is unconfigured", async () => {
  delete process.env.REDIS_URL;
  delete process.env.RATE_LIMIT_ENABLED;
  __setRateLimitDependencies({
    getRedisClient: () => {
      throw new Error("redis unavailable");
    },
  });

  for (const environment of ["development", "test"]) {
    process.env.NODE_ENV = environment;
    const limiter = createJsonRateLimiter({
      namespace: `${environment}-without-redis`,
      windowMs: 60 * 1000,
      limit: 1,
    });
    const result = await runLimiter(limiter, createRequest());

    assert.equal(isRateLimitEnabled(), false);
    assert.equal(result.nextCalled, true);
    assert.equal(result.nextError, undefined);
  }
});

test("an explicit rate-limit enablement fails closed when Redis is unavailable", async () => {
  process.env.NODE_ENV = "development";
  delete process.env.REDIS_URL;
  process.env.RATE_LIMIT_ENABLED = "true";
  __setRateLimitDependencies({
    getRedisClient: () => {
      throw new Error("redis unavailable");
    },
  });

  const limiter = createJsonRateLimiter({
    namespace: "explicit-enabled-without-redis",
    windowMs: 60 * 1000,
    limit: 1,
  });
  const result = await runLimiter(limiter, createRequest());

  assert.equal(isRateLimitEnabled(), true);
  assert.equal(result.nextCalled, false);
  assert.equal(result.nextError?.code, rateLimitStoreUnavailableCode);
});

test("an explicit rate-limit disablement bypasses an unavailable Redis store", async () => {
  process.env.NODE_ENV = "development";
  delete process.env.REDIS_URL;
  process.env.RATE_LIMIT_ENABLED = "false";
  __setRateLimitDependencies({
    getRedisClient: () => {
      throw new Error("redis unavailable");
    },
  });

  const limiter = createJsonRateLimiter({
    namespace: "explicit-disabled-without-redis",
    windowMs: 60 * 1000,
    limit: 1,
  });
  const result = await runLimiter(limiter, createRequest());

  assert.equal(isRateLimitEnabled(), false);
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});

test("production keeps rate limiting enabled when Redis is unconfigured", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.REDIS_URL;
  delete process.env.RATE_LIMIT_ENABLED;
  __setRateLimitDependencies({
    getRedisClient: () => {
      throw new Error("redis unavailable");
    },
  });

  const limiter = createJsonRateLimiter({
    namespace: "production-without-redis",
    windowMs: 60 * 1000,
    limit: 1,
  });
  const result = await runLimiter(limiter, createRequest());

  assert.equal(isRateLimitEnabled(), true);
  assert.equal(result.nextCalled, false);
  assert.equal(result.nextError?.code, rateLimitStoreUnavailableCode);
});

test("a configured Redis environment keeps the existing default rate limiter behavior", async () => {
  process.env.NODE_ENV = "development";
  process.env.REDIS_URL = "redis://configured.example.test:6379/0";
  delete process.env.RATE_LIMIT_ENABLED;

  const limiter = createJsonRateLimiter({
    namespace: "configured-redis",
    windowMs: 60 * 1000,
    limit: 1,
  });
  const result = await runLimiter(limiter, createRequest());

  assert.equal(isRateLimitEnabled(), true);
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});

test("hostile Redis errors are replaced by fixed safe error metadata before generic logging", async () => {
  const secret = "rediss://redis-user:redis-secret@cache.internal:6380/0 EVAL payload=private";
  __setRateLimitDependencies({
    getRedisClient: () => {
      throw new Error(secret);
    },
  });
  const limiter = createJsonRateLimiter({
    namespace: "hostile-store-error",
    windowMs: 60 * 1000,
    limit: 1,
    enabled: true,
  });
  const { nextError } = await runLimiter(limiter, createRequest());
  const records = [];
  const logger = {
    error(record) {
      records.push(record);
    },
  };
  const response = createResponse();
  response.headersSent = false;

  createErrorMiddleware({ logger })(nextError, createRequest(), response, () => {});

  assert.equal(nextError.message, "Rate limit store unavailable");
  assert.equal(nextError.code, rateLimitStoreUnavailableCode);
  assert.equal(records.length, 1);
  const serialized = JSON.stringify(records[0]);
  for (const fragment of ["rediss://", "redis-secret", "cache.internal", "EVAL", "payload=private"]) {
    assert.equal(serialized.includes(fragment), false);
  }
});

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
