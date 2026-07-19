import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { resetAllowlistCache } from "../middleware/platformMiddleware.js";
import platformRoutes from "./platform/platformRoutes.js";

afterEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.PLATFORM_ADMIN_IDS;
  resetAllowlistCache();
});

const writeBillingRoutes = [
  "/billing/salons/:salonId/subscription/activate",
  "/billing/salons/:salonId/subscription/seat-count",
  "/billing/salons/:salonId/seats/assign",
  "/billing/salons/:salonId/seats/revoke",
  "/billing/payments/:paymentId/confirm",
];

/* ── Middleware helper ────────────────────────────────── */

const checkMiddleware = (route, expectedMiddlewares) => {
  const middlewareNames = route.route.stack.map((s) => s.name || "anonymous");
  for (const name of expectedMiddlewares) {
    assert.ok(middlewareNames.includes(name), `Route should use ${name} middleware`);
  }
  return middlewareNames;
};

/* ── Route structure tests ────────────────────────────── */

test("all routes have protect + requirePlatformSuperuser middleware", () => {
  const expectedPaths = [
    { path: "/access-check", method: "get" },
    { path: "/dashboard/summary", method: "get" },
    { path: "/billing/salons", method: "get" },
    { path: "/billing/salons/:salonId", method: "get" },
    { path: "/billing/salons/:salonId/payments", method: "get" },
    { path: "/billing/payments", method: "get" },
    { path: "/billing/individuals", method: "get" },
    { path: "/billing/individuals/:barberId/payments", method: "get" },
    { path: "/billing/salons/:salonId/subscription/activate", method: "patch" },
    { path: "/billing/salons/:salonId/subscription/seat-count", method: "patch" },
    { path: "/billing/salons/:salonId/seats/assign", method: "post" },
    { path: "/billing/salons/:salonId/seats/revoke", method: "post" },
    { path: "/billing/payments/:paymentId/confirm", method: "post" },
  ];

  const stack = platformRoutes.stack;
  assert.ok(stack.length >= expectedPaths.length, "Platform routes should have all expected routes");

  for (const { path, method } of expectedPaths) {
    const route = stack.find(
      (layer) => layer.route && layer.route.path === path
    );
    assert.ok(route, `Route ${path} should exist`);
    assert.ok(route.route.methods[method], `${path} should accept ${method.toUpperCase()}`);
    checkMiddleware(route, ["protect", "requirePlatformSuperuser"]);
  }
});

test("read handler names are correct", () => {
  const stack = platformRoutes.stack;

  const getHandlerName = (path) => {
    const route = stack.find((l) => l.route && l.route.path === path);
    if (!route) return null;
    return route.route.stack[2].handle.name || route.route.stack[2].name;
  };

  assert.equal(getHandlerName("/billing/salons"), "listSalonBillingSummaries");
  assert.equal(getHandlerName("/dashboard/summary"), "getPlatformDashboardSummaryHandler");
  assert.equal(getHandlerName("/billing/salons/:salonId"), "getSalonBillingDetailHandler");
  assert.equal(getHandlerName("/billing/salons/:salonId/payments"), "getSalonPaymentsHandler");
  assert.equal(getHandlerName("/billing/payments"), "listAllSalonPayments");
  assert.equal(getHandlerName("/billing/individuals"), "listIndividualBillingSummaries");
  assert.equal(getHandlerName("/billing/individuals/:barberId/payments"), "getIndividualPaymentsHandler");
});

test("write handler names are correct", () => {
  const stack = platformRoutes.stack;

  const getHandlerName = (path) => {
    const route = stack.find((l) => l.route && l.route.path === path);
    if (!route) return null;
    return route.route.stack[2].handle.name || route.route.stack[2].name;
  };

  assert.equal(getHandlerName("/billing/salons/:salonId/subscription/activate"), "activateSubscription");
  assert.equal(getHandlerName("/billing/salons/:salonId/subscription/seat-count"), "updateSeatCount");
  assert.equal(getHandlerName("/billing/salons/:salonId/seats/assign"), "assignSeat");
  assert.equal(getHandlerName("/billing/salons/:salonId/seats/revoke"), "revokeSeat");
  assert.equal(getHandlerName("/billing/payments/:paymentId/confirm"), "confirmPayment");
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
 * The route middleware chain is: protect -> requirePlatformSuperuser -> handler.
 * Since protect is the first middleware, we need to simulate it by
 * either directly testing the handler via a custom approach, or by
 * stubbing protect to just pass through.
 *
 * Simpler approach: test the route's handler directly by walking
 * the middleware stack up to the final handler (3rd item in stack).
 * But since protect/requirePlatformSuperuser are external middlewares that
 * check req.user, we simulate the chain manually.
 */

/**
 * Wrap the route's middleware chain into a single callable.
 * This skips the actual `protect` import and simulates
 * a pre-authenticated request going through requirePlatformSuperuser + handler.
 */
const callAccessCheck = async (req, res) => {
  const routeLayer = platformRoutes.stack.find(
    (l) => l.route && l.route.path === "/access-check"
  );
  assert.ok(routeLayer, "access-check route not found");

  const stack = routeLayer.route.stack;
  // stack[0] = protect, stack[1] = requirePlatformSuperuser, stack[2] = handler
  const requirePlatformSuperuserFn = stack[1].handle;
  const handlerFn = stack[2].handle;

  let middlewareError = null;
  const next = (err) => {
    middlewareError = err;
  };

  // Run requirePlatformSuperuser
  await requirePlatformSuperuserFn(req, res, next);

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
  const requirePlatformSuperuserFn = stack[1].handle;

  let nextCalled = false;
  await requirePlatformSuperuserFn(req, res, () => {
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
  const requirePlatformSuperuserFn = stack[1].handle;

  let middlewareError = null;
  await requirePlatformSuperuserFn(req, res, (err) => {
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

test("user with platformRole superuser allowed and returns identity info", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000003",
    name: "Platform Superuser",
    email: "superuser@example.com",
    role: "barber",
    platformRole: "superuser",
    token: "should-not-leak",
    password: "should-not-leak",
    subscription: { status: "active" },
    emailVerificationTokenHash: "should-not-leak",
  });

  const body = await callAccessCheck(req, res);
  assert.ok(body, "Body should be defined");
  assert.deepEqual(Object.keys(body).sort(), [
    "canAccessPlatform",
    "email",
    "id",
    "name",
  ]);
  assert.equal(body.id, "64b000000000000000000003");
  assert.equal(body.name, "Platform Superuser");
  assert.equal(body.email, "superuser@example.com");
  assert.equal(body.canAccessPlatform, true);
  assert.equal(body.platformRole, undefined);
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
    emailVerified: true,
    role: "barber",
    platformRole: null,
  });

  const body = await callAccessCheck(req, res);
  assert.ok(body, "Body should be defined");
  assert.equal(body.id, "64b000000000000000000004");
  assert.equal(body.canAccessPlatform, true);
  assert.equal(body.platformRole, undefined);
});

test("old platformRole admin is rejected without env allowlist", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000013",
    role: "barber",
    email: "old-admin@example.com",
    platformRole: "admin",
  });

  await callAccessCheck(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "FORBIDDEN");
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

test("individual billing route rejects normal client", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000030",
    role: "client",
    platformRole: null,
  });

  const nextCalled = await runRoutePlatformGate("/billing/individuals", req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("individual billing route rejects normal barber", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000031",
    role: "barber",
    platformRole: null,
  });

  const nextCalled = await runRoutePlatformGate(
    "/billing/individuals/:barberId/payments",
    req,
    res
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("dashboard summary route rejects normal users and old admin role", async () => {
  const client = makeReqRes({
    _id: "64b000000000000000000033",
    role: "client",
    platformRole: null,
  });
  assert.equal(await runRoutePlatformGate("/dashboard/summary", client.req, client.res), false);
  assert.equal(client.res.statusCode, 403);

  const barber = makeReqRes({
    _id: "64b000000000000000000034",
    role: "barber",
    platformRole: null,
  });
  assert.equal(await runRoutePlatformGate("/dashboard/summary", barber.req, barber.res), false);
  assert.equal(barber.res.statusCode, 403);

  const oldAdmin = makeReqRes({
    _id: "64b000000000000000000035",
    role: "barber",
    platformRole: "admin",
  });
  assert.equal(await runRoutePlatformGate("/dashboard/summary", oldAdmin.req, oldAdmin.res), false);
  assert.equal(oldAdmin.res.statusCode, 403);
});

test("dashboard summary route allows platformRole superuser", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000036",
    role: "barber",
    platformRole: "superuser",
  });

  const nextCalled = await runRoutePlatformGate("/dashboard/summary", req, res);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
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

test("billing route rejects salon owner/admin without platform superuser role", async () => {
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

test("billing route allows platformRole superuser", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000023",
    role: "barber",
    platformRole: "superuser",
  });

  const nextCalled = await runRoutePlatformGate("/billing/salons", req, res);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("individual billing route allows platformRole superuser", async () => {
  const { req, res } = makeReqRes({
    _id: "64b000000000000000000032",
    role: "barber",
    platformRole: "superuser",
  });

  const nextCalled = await runRoutePlatformGate("/billing/individuals", req, res);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("billing route allows env allowlisted platform superuser", async () => {
  process.env.PLATFORM_ADMIN_EMAILS = "billing-admin@example.com";
  resetAllowlistCache();

  const { req, res } = makeReqRes({
    _id: "64b000000000000000000024",
    role: "client",
    email: "billing-admin@example.com",
    emailVerified: true,
    platformRole: null,
  });

  const nextCalled = await runRoutePlatformGate("/billing/payments", req, res);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("write billing routes reject business-role users and allow platform superusers only", async () => {
  for (const routePath of writeBillingRoutes) {
    const client = makeReqRes({
      _id: "64b000000000000000000025",
      role: "client",
      platformRole: null,
    });
    assert.equal(await runRoutePlatformGate(routePath, client.req, client.res), false);
    assert.equal(client.res.statusCode, 403);

    const barber = makeReqRes({
      _id: "64b000000000000000000026",
      role: "barber",
      platformRole: null,
    });
    assert.equal(await runRoutePlatformGate(routePath, barber.req, barber.res), false);
    assert.equal(barber.res.statusCode, 403);

    const salonAdmin = makeReqRes({
      _id: "64b000000000000000000027",
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
    assert.equal(await runRoutePlatformGate(routePath, salonAdmin.req, salonAdmin.res), false);
    assert.equal(salonAdmin.res.statusCode, 403);

    const platformSuperuser = makeReqRes({
      _id: "64b000000000000000000028",
      role: "barber",
      platformRole: "superuser",
    });
    assert.equal(await runRoutePlatformGate(routePath, platformSuperuser.req, platformSuperuser.res), true);
    assert.equal(platformSuperuser.res.statusCode, 200);
  }
});

test("write billing routes allow env allowlisted platform superuser", async () => {
  process.env.PLATFORM_ADMIN_IDS = "64b000000000000000000029";
  resetAllowlistCache();

  for (const routePath of writeBillingRoutes) {
    const allowlisted = makeReqRes({
      _id: "64b000000000000000000029",
      role: "client",
      platformRole: null,
    });

    assert.equal(await runRoutePlatformGate(routePath, allowlisted.req, allowlisted.res), true);
    assert.equal(allowlisted.res.statusCode, 200);
  }
});
