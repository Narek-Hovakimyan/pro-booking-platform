import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const middlewarePath = path.join(__dirname, "subscriptionMiddleware.js");

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const createLog = () => {
  const calls = [];
  return {
    calls,
    error(...args) {
      calls.push(args);
    },
  };
};

const assertNoSensitiveLeak = (value) => {
  const logged = JSON.stringify(value);
  assert.equal(logged.includes("token-123"), false);
  assert.equal(logged.includes("client@example.com"), false);
  assert.equal(logged.includes("+15555550123"), false);
  assert.equal(logged.includes("authorization"), false);
};

let cachedSourcePromise;

const loadSubscriptionMiddleware = async (barberHasPaidAccess) => {
  cachedSourcePromise ||= fs.readFile(middlewarePath, "utf8");
  const source = await cachedSourcePromise;
  const transformed = source
    .replace(/^import .*;\n/gm, "")
    .replace(/export const /g, "const ")
    .concat("\nreturn { requireBarberSubscription };");

  const factory = new Function("barberHasPaidAccess", transformed);
  return factory(barberHasPaidAccess);
};

test("middleware logs structured safe context and preserves 500 response", async () => {
  const err = new Error("lookup failed");
  const log = createLog();
  const next = () => {
    throw new Error("next should not be called");
  };
  const { requireBarberSubscription } = await loadSubscriptionMiddleware(async () => {
    throw err;
  });

  const req = {
    id: "req-5",
    user: {
      _id: "barber-1",
      id: "barber-1",
      role: "barber",
      email: "client@example.com",
      phone: "+15555550123",
      token: "token-123",
    },
    headers: {
      authorization: "Bearer secret",
    },
    log,
  };
  const res = createResponse();

  await requireBarberSubscription(req, res, next);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    message: "Could not verify subscription status",
  });
  assert.equal(log.calls.length, 1);
  const [context, message] = log.calls[0];
  assert.equal(context.err, err);
  assert.equal(context.event, "subscription.access_check_failed");
  assert.equal(context.userId, "barber-1");
  assert.equal(context.requestId, "req-5");
  assert.equal(message, "Could not verify subscription status");
  assertNoSensitiveLeak(log.calls);
});

test("middleware preserves 500 response when logger is absent", async () => {
  const err = new Error("lookup failed");
  const { requireBarberSubscription } = await loadSubscriptionMiddleware(async () => {
    throw err;
  });

  const res = createResponse();
  await requireBarberSubscription(
    {
      id: "req-6",
      user: { _id: "barber-2", role: "barber" },
    },
    res,
    () => {
      throw new Error("next should not be called");
    }
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    message: "Could not verify subscription status",
  });
});

test("middleware preserves 500 response when logger throws", async () => {
  const err = new Error("lookup failed");
  const { requireBarberSubscription } = await loadSubscriptionMiddleware(async () => {
    throw err;
  });

  const res = createResponse();
  await requireBarberSubscription(
    {
      id: "req-7",
      user: { _id: "barber-3", role: "barber" },
      log: {
        error() {
          throw new Error("logger exploded");
        },
      },
    },
    res,
    () => {
      throw new Error("next should not be called");
    }
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    message: "Could not verify subscription status",
  });
});
