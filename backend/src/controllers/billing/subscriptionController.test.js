import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { sendControllerError } from "../../utils/controllerError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllerPath = path.join(__dirname, "subscriptionController.js");

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

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
  assert.equal(logged.includes("payer-secret"), false);
  assert.equal(logged.includes("token-123"), false);
  assert.equal(logged.includes("client@example.com"), false);
  assert.equal(logged.includes("+15555550123"), false);
  assert.equal(logged.includes("authorization"), false);
};

const assertNoInternalErrorLeak = (value) => {
  const serialized = JSON.stringify(value);
  for (const detail of [
    "MongoServerError",
    "provider-secret",
    "token-123",
    "topology",
    "hairbook_internal",
    "subscriptionpaymentattempts",
    "index",
  ]) {
    assert.equal(serialized.includes(detail), false);
  }
};

const createUnexpectedStub = (name) => () => {
  throw new Error(`Unexpected dependency call: ${name}`);
};

let cachedSourcePromise;

const loadSubscriptionController = async (overrides = {}) => {
  cachedSourcePromise ||= fs.readFile(controllerPath, "utf8");
  const source = await cachedSourcePromise;

  const transformed = source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g, "")
    .replace(/export const /g, "const ")
    .concat(
      "\nreturn { getMySubscription, getDefaultPlan, devGrantSubscription, devExtendSubscription, createPaymentIntent, getPaymentAttempt, cancelPaymentAttempt, confirmSubscriptionSeatUpdate, confirmSubscriptionPaymentAttempt, getMySubscriptionPayments, getSalonSubscriptionPayments, getSalonSubscription, getSalonSubscriptionSeats, assignSeat, revokeSeat, updateSeatCount };"
    );

  const factory = new Function(
    "Subscription",
    "SubscriptionSeat",
    "getOrCreateDefaultSubscriptionPlan",
    "getMySubscriptionAccess",
    "extendManualSubscription",
    "getSalonSubscriptionDetails",
    "assignSalonSubscriptionSeat",
    "revokeSalonSubscriptionSeat",
    "updateSalonSubscriptionSeatCount",
    "createSubscriptionPaymentIntent",
    "getMySubscriptionPaymentHistory",
    "getSalonSubscriptionPaymentHistory",
    "getSubscriptionPaymentAttempt",
    "cancelSubscriptionPaymentAttempt",
    "confirmSubscriptionPaymentAttempt",
    "confirmSubscriptionSeatUpdate",
    "sendControllerError",
    transformed
  );

  const defaults = {
    Subscription: {},
    SubscriptionSeat: {},
    getOrCreateDefaultSubscriptionPlan: createUnexpectedStub("getOrCreateDefaultSubscriptionPlan"),
    getMySubscriptionAccess: createUnexpectedStub("getMySubscriptionAccess"),
    extendManualSubscription: createUnexpectedStub("extendManualSubscription"),
    getSalonSubscriptionDetails: createUnexpectedStub("getSalonSubscriptionDetails"),
    assignSalonSubscriptionSeat: createUnexpectedStub("assignSalonSubscriptionSeat"),
    revokeSalonSubscriptionSeat: createUnexpectedStub("revokeSalonSubscriptionSeat"),
    updateSalonSubscriptionSeatCount: createUnexpectedStub("updateSalonSubscriptionSeatCount"),
    createSubscriptionPaymentIntent: createUnexpectedStub("createSubscriptionPaymentIntent"),
    getMySubscriptionPaymentHistory: createUnexpectedStub("getMySubscriptionPaymentHistory"),
    getSalonSubscriptionPaymentHistory: createUnexpectedStub("getSalonSubscriptionPaymentHistory"),
    getSubscriptionPaymentAttempt: createUnexpectedStub("getSubscriptionPaymentAttempt"),
    cancelSubscriptionPaymentAttempt: createUnexpectedStub("cancelSubscriptionPaymentAttempt"),
    confirmSubscriptionPaymentAttempt: createUnexpectedStub("confirmSubscriptionPaymentAttempt"),
    confirmSubscriptionSeatUpdate: createUnexpectedStub("confirmSubscriptionSeatUpdate"),
    sendControllerError,
    ...overrides,
  };

  return factory(
    defaults.Subscription,
    defaults.SubscriptionSeat,
    defaults.getOrCreateDefaultSubscriptionPlan,
    defaults.getMySubscriptionAccess,
    defaults.extendManualSubscription,
    defaults.getSalonSubscriptionDetails,
    defaults.assignSalonSubscriptionSeat,
    defaults.revokeSalonSubscriptionSeat,
    defaults.updateSalonSubscriptionSeatCount,
    defaults.createSubscriptionPaymentIntent,
    defaults.getMySubscriptionPaymentHistory,
    defaults.getSalonSubscriptionPaymentHistory,
    defaults.getSubscriptionPaymentAttempt,
    defaults.cancelSubscriptionPaymentAttempt,
    defaults.confirmSubscriptionPaymentAttempt,
    defaults.confirmSubscriptionSeatUpdate,
    defaults.sendControllerError
  );
};

test("getMySubscription logs structured safe context and preserves 500 response", async () => {
  const err = new Error("db failed");
  const log = createLog();
  const { getMySubscription } = await loadSubscriptionController({
    getMySubscriptionAccess: async () => {
      throw err;
    },
  });

  const req = {
    id: "req-1",
    user: {
      _id: "barber-1",
      id: "barber-1",
      email: "client@example.com",
      phone: "+15555550123",
      token: "token-123",
    },
    log,
  };
  const res = createResponse();

  await getMySubscription(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not fetch subscription access" });
  assert.equal(log.calls.length, 1);
  const [context, message] = log.calls[0];
  assert.equal(context.err, err);
  assert.equal(context.event, "subscription.access_fetch_failed");
  assert.equal(context.userId, "barber-1");
  assert.equal(context.requestId, "req-1");
  assert.equal(message, "Could not fetch subscription access");
  assertNoSensitiveLeak(log.calls);
});

test("getDefaultPlan keeps exact 500 response when logger throws", async () => {
  const err = new Error("plan failed");
  const { getDefaultPlan } = await loadSubscriptionController({
    getOrCreateDefaultSubscriptionPlan: async () => {
      throw err;
    },
  });

  const req = {
    id: "req-2",
    log: {
      error() {
        throw new Error("logger exploded");
      },
    },
  };
  const res = createResponse();

  await getDefaultPlan(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not fetch default plan" });
});

test("devGrantSubscription logs safe structured context and preserves service error response", async () => {
  process.env.NODE_ENV = "development";

  const err = new Error("payment required");
  err.statusCode = 402;
  err.code = "PAYMENT_REQUIRED";
  const log = createLog();

  const { devGrantSubscription } = await loadSubscriptionController({
    extendManualSubscription: async () => {
      throw err;
    },
  });

  const req = {
    id: "req-3",
    user: { _id: "admin-1", id: "admin-1" },
    body: {
      ownerType: "salon",
      ownerId: "salon-1",
      payerId: "payer-secret",
      seatCount: 2,
      months: 3,
      token: "token-123",
      email: "client@example.com",
      phone: "+15555550123",
    },
    headers: {
      authorization: "Bearer secret",
    },
    log,
  };
  const res = createResponse();

  await devGrantSubscription(req, res);

  assert.equal(res.statusCode, 402);
  assert.deepEqual(res.body, {
    message: "payment required",
  });
  assert.equal(log.calls.length, 1);
  const [context, message] = log.calls[0];
  assert.equal(context.err, err);
  assert.equal(context.event, "subscription.dev_grant_failed");
  assert.equal(context.requesterId, "admin-1");
  assert.equal(context.ownerType, "salon");
  assert.equal(context.ownerId, "salon-1");
  assert.equal(context.requestId, "req-3");
  assert.equal(message, "Could not grant subscription");
  assertNoSensitiveLeak(log.calls);
});

test("devGrantSubscription preserves production-disabled behavior exactly", async () => {
  process.env.NODE_ENV = "production";

  const { devGrantSubscription } = await loadSubscriptionController({
    extendManualSubscription: async () => {
      throw new Error("should not run");
    },
  });

  const res = createResponse();
  await devGrantSubscription(
    {
      user: { _id: "admin-1" },
      body: {
        ownerType: "salon",
        ownerId: "salon-1",
        payerId: "payer-secret",
      },
      log: createLog(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "DEV_SUBSCRIPTION_DISABLED",
    message: "Dev subscription activation is disabled in production",
  });
});

test("devGrantSubscription redacts unexpected errors when logger is absent", async () => {
  process.env.NODE_ENV = "development";

  const err = new Error("MongoServerError provider-secret topology hairbook_internal subscriptionpaymentattempts index");

  const { devGrantSubscription } = await loadSubscriptionController({
    extendManualSubscription: async () => {
      throw err;
    },
  });

  const res = createResponse();
  await devGrantSubscription(
    {
      id: "req-4",
      user: { _id: "admin-2" },
      body: {
        ownerType: "barber",
        ownerId: "barber-1",
        payerId: "payer-secret",
      },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    message: "Could not grant subscription",
  });
  assertNoInternalErrorLeak(res.body);
});

const unexpectedControllerError = () => new Error(
  "MongoServerError provider-secret token-123 topology hairbook_internal subscriptionpaymentattempts index"
);

for (const {
  name,
  handler,
  dependency,
  request,
  fallbackMessage,
} of [
  {
    name: "payment intent",
    handler: "createPaymentIntent",
    dependency: "createSubscriptionPaymentIntent",
    request: { user: { _id: "barber-1" }, body: {} },
    fallbackMessage: "Could not prepare payment",
  },
  {
    name: "payment attempt",
    handler: "getPaymentAttempt",
    dependency: "getSubscriptionPaymentAttempt",
    request: { user: { _id: "barber-1" }, params: { attemptId: "attempt-1" } },
    fallbackMessage: "Could not fetch payment attempt",
  },
  {
    name: "salon subscription",
    handler: "getSalonSubscription",
    dependency: "getSalonSubscriptionDetails",
    request: { user: { _id: "owner-1" }, params: { salonId: "salon-1" } },
    fallbackMessage: "Could not fetch salon subscription details",
  },
  {
    name: "subscription seat",
    handler: "assignSeat",
    dependency: "assignSalonSubscriptionSeat",
    request: { user: { _id: "owner-1" }, params: { salonId: "salon-1" }, body: { barberId: "barber-1" } },
    fallbackMessage: "Could not assign seat",
  },
]) {
  test(`${name} controller redacts unexpected persistence/provider errors`, async () => {
    const { [handler]: controller } = await loadSubscriptionController({
      [dependency]: async () => {
        throw unexpectedControllerError();
      },
    });
    const res = createResponse();

    await controller(request, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: fallbackMessage });
    assertNoInternalErrorLeak(res.body);
  });
}

test("payment intent preserves intentional domain status and message", async () => {
  const error = new Error("Only salon owners can prepare this payment");
  error.statusCode = 403;
  const { createPaymentIntent } = await loadSubscriptionController({
    createSubscriptionPaymentIntent: async () => {
      throw error;
    },
  });
  const res = createResponse();

  await createPaymentIntent({ user: { _id: "barber-1" }, body: {} }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Only salon owners can prepare this payment" });
});
