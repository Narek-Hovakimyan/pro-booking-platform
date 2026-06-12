import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { resetAllowlistCache } from "../middleware/platformMiddleware.js";
import User from "../models/User.js";
import platformRoutes from "./platformRoutes.js";

afterEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.PLATFORM_ADMIN_IDS;
  resetAllowlistCache();
});

/* ── Route structure tests ────────────────────────────── */

test("platform routes apply protect and requirePlatformAdmin middleware", () => {
  const stack = platformRoutes.stack;
  assert.ok(stack.length > 0, "Platform routes should have at least one route");

  const accessCheckRoute = stack.find(
    (layer) => layer.route && layer.route.path === "/access-check"
  );
  assert.ok(accessCheckRoute, "/access-check route should exist");

  const middlewareNames = accessCheckRoute.route.stack.map((s) => s.name);
  assert.ok(
    middlewareNames.includes("protect"),
    "Route should use protect middleware"
  );
  assert.ok(
    middlewareNames.includes("requirePlatformAdmin"),
    "Route should use requirePlatformAdmin middleware"
  );
});

/* ── Billing route structure tests ───────────────────── */

test("all billing routes are registered and use protect + requirePlatformAdmin", () => {
  const billingRoutes = [
    "/billing/salons",
    "/billing/salons/:salonId",
    "/billing/salons/:salonId/payments",
    "/billing/payments",
  ];

  for (const billingPath of billingRoutes) {
    const route = platformRoutes.stack.find(
      (layer) => layer.route && layer.route.path === billingPath
    );
    assert.ok(route, `Route ${billingPath} should exist`);

    const middlewareNames = route.route.stack.map((s) => s.name);
    assert.ok(
      middlewareNames.includes("protect"),
      `${billingPath} should use protect middleware`
    );
    assert.ok(
      middlewareNames.includes("requirePlatformAdmin"),
      `${billingPath} should use requirePlatformAdmin middleware`
    );

    // All billing routes are GET
    const methods = route.route.methods;
    assert.ok(methods.get, `${billingPath} should be GET`);
  }
});

test("billing/salons route has listSalonBillingSummaries handler", () => {
  const route = platformRoutes.stack.find(
    (layer) => layer.route && layer.route.path === "/billing/salons"
  );
  assert.ok(route, "/billing/salons route should exist");

  const handlerName = route.route.stack[2].name;
  assert.equal(handlerName, "listSalonBillingSummaries");
});

test("billing/salons/:salonId route has getSalonBillingDetailHandler handler", () => {
  const route = platformRoutes.stack.find(
    (layer) => layer.route && layer.route.path === "/billing/salons/:salonId"
  );
  assert.ok(route, "/billing/salons/:salonId route should exist");

  const handlerName = route.route.stack[2].name;
  assert.equal(handlerName, "getSalonBillingDetailHandler");
});

test("billing/salons/:salonId/payments route has getSalonPaymentsHandler handler", () => {
  const route = platformRoutes.stack.find(
    (layer) =>
      layer.route && layer.route.path === "/billing/salons/:salonId/payments"
  );
  assert.ok(route, "/billing/salons/:salonId/payments route should exist");

  const handlerName = route.route.stack[2].name;
  assert.equal(handlerName, "getSalonPaymentsHandler");
});

test("billing/payments route has listAllSalonPayments handler", () => {
  const route = platformRoutes.stack.find(
    (layer) => layer.route && layer.route.path === "/billing/payments"
  );
  assert.ok(route, "/billing/payments route should exist");

  const handlerName = route.route.stack[2].name;
  assert.equal(handlerName, "listAllSalonPayments");
});

/* ── Simulated request/response handler tests ─────────── */

const makeReqRes = (userOverrides = {}) => {
  let statusCode = 200;
  let body;
  const req = {
    user: userOverrides._id
      ? {
          _id: userOverrides._id || "64b000000000000000000001",
          name: userOverrides.name || "Test User",
          email: userOverrides.email || "test@example.com",
          role: userOverrides.role || "barber",
          platformRole: userOverrides.platformRole || null,
          ...userOverrides,
        }
      : undefined,
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
  return { req, res };
};

/**
 * Call the /access-check route handler directly via Router.handle.
 *
 * The route middleware chain is: protect -> requirePlatformAdmin -> handler.
 * Since protect is the first middleware, we need to simulate it by
 * either directly testing the handler via a custom approach, or by
 * stubbing protect to just pass through.
 *
 * Simpler approach: test the route's handler directly by walking
 * the middleware stack up to the final handler (3rd item in stack).
 * But since protect/requirePlatformAdmin are external middlewares that
 * check req.user, we simulate the chain manually.
 */

/**
 * Wrap the route's middleware chain into a single callable.
 * This skips the actual `protect` import and simulates
 * a pre-authenticated request going through requirePlatformAdmin + handler.
 */
const callAccessCheck = async (req, res) => {
  const routeLayer = platformRoutes.stack.find(
    (l) => l.route && l.route.path === "/access-check"
  );
  assert.ok(routeLayer, "access-check route not found");

  const stack = routeLayer.route.stack;
  // stack[0] = protect, stack[1] = requirePlatformAdmin, stack[2] = handler
  const requirePlatformAdminFn = stack[1].handle;
  const handlerFn = stack[2].handle;

  let middlewareError = null;
  const next = (err) => {
    middlewareError = err;
  };

  // Run requirePlatformAdmin
  await requirePlatformAdminFn(req, res, next);

  if (res.statusCode >= 400) {
    // Middleware rejected — handler should not be called
    return null;
  }

  // Run handler
  await handlerFn(req, res, next);
  return res.body;
};

const runRoutePlatformGate = async (routePath, req, res) => {
  const routeLayer = platformRoutes.stack.find(
    (layer) => layer.route && layer.route.path === routePath
  );
  assert.ok(routeLayer, `${routePath} route not found`);

  const stack = routeLayer.route.stack;
  const requirePlatformAdminFn = stack[1].handle;

  let nextCalled = false;
  await requirePlatformAdminFn(req, res, () => {
    nextCalled = true;
  });

  return nextCalled;
};

/* ── Route handler tests ──────────────────────────────── */

test("unauthenticated request rejected with 401", async () => {
  const { req, res } = makeReqRes({}); // no user
  const routeLayer = platformRoutes.stack.find(
    (l) => l.route && l.route.path === "/access-check"
  );
  const stack = routeLayer.route.stack;
  const requirePlatformAdminFn = stack[1].handle;

  let middlewareError = null;
  await requirePlatformAdminFn(req, res, (err) => {
    middlewareError = err;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Not authorized, no token");
});

test("authenticated normal barber rejected with 403", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000001",
    role: "barber",
    platformRole: null,
  });

  await callAccessCheck(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "FORBIDDEN");
});

test("authenticated normal client rejected with 403", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000002",
    role: "client",
    platformRole: null,
  });

  await callAccessCheck(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "FORBIDDEN");
});

test("user with platformRole admin allowed and returns identity info", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000003",
    name: "Platform Admin",
    email: "admin@example.com",
    role: "barber",
    platformRole: "admin",
    token: "should-not-leak",
    password: "should-not-leak",
    subscription: { status: "active" },
    emailVerificationTokenHash: "should-not-leak",
  });

  const body = await callAccessCheck(req, res);
  assert.ok(body, "Body should be defined");
  assert.deepEqual(Object.keys(body).sort(), [
    "email",
    "id",
    "name",
    "platformRole",
  ]);
  assert.equal(body.id, "64b000000000000000000003");
  assert.equal(body.name, "Platform Admin");
  assert.equal(body.email, "admin@example.com");
  assert.equal(body.platformRole, "admin");
  assert.equal(body.token, undefined);
  assert.equal(body.password, undefined);
  assert.equal(body.subscription, undefined);
  assert.equal(body.emailVerificationTokenHash, undefined);
});

test("env allowlisted email allowed and returns identity info", async () => {
  process.env.PLATFORM_ADMIN_EMAILS = "allowlisted@example.com";
  resetAllowlistCache();

  const { req, res } = makeReqRes({
    _id: "64b000000000000000000004",
    name: "Allowlisted Admin",
    email: "allowlisted@example.com",
    role: "barber",
    platformRole: null,
  });

  const body = await callAccessCheck(req, res);
  assert.ok(body, "Body should be defined");
  assert.equal(body.id, "64b000000000000000000004");
  assert.equal(body.platformRole, null); // DB field is null, but access granted by allowlist
});

test("env allowlisted id allowed and returns identity info", async () => {
  process.env.PLATFORM_ADMIN_IDS = "64b000000000000000000010";
  resetAllowlistCache();

  const { req, res } = makeReqRes({
    _id: "64b000000000000000000010",
    name: "Allowlisted By ID",
    email: "any@example.com",
    role: "barber",
    platformRole: null,
  });

  const body = await callAccessCheck(req, res);
  assert.ok(body, "Body should be defined");
  assert.equal(body.id, "64b000000000000000000010");
  assert.equal(body.name, "Allowlisted By ID");
});

test("billing route rejects normal client", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000020",
    role: "client",
    platformRole: null,
  });

  const nextCalled = await runRoutePlatformGate("/billing/salons", req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "FORBIDDEN");
});

test("billing route rejects normal barber", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000021",
    role: "barber",
    platformRole: null,
  });

  const nextCalled = await runRoutePlatformGate("/billing/salons", req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("billing route rejects salon owner/admin without platform admin role", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000022",
    role: "barber",
    platformRole: null,
    salon: "64b000000000000000010000",
    salonStatus: "approved",
    salons: [
      {
        salon: "64b000000000000000010000",
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "accepted",
      },
    ],
  });

  const nextCalled = await runRoutePlatformGate("/billing/salons", req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("billing route allows platformRole admin", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000023",
    role: "barber",
    platformRole: "admin",
  });

  const nextCalled = await runRoutePlatformGate("/billing/salons", req, res);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("billing route allows env allowlisted platform admin", async () => {
  process.env.PLATFORM_ADMIN_EMAILS = "billing-admin@example.com";
  resetAllowlistCache();

  const { req, res } = makeReqRes({
    _id: "64b000000000000000000024",
    role: "client",
    email: "billing-admin@example.com",
    platformRole: null,
  });

  const nextCalled = await runRoutePlatformGate("/billing/payments", req, res);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
