import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import { uploadLimiter } from "../middleware/rateLimitMiddleware.js";
import barberRoutes from "./barberRoutes.js";

const genericTombstoneResponse = {
  code: "BARBER_PROFILE_GENERIC_WRITE_DEPRECATED",
  message: "This BarberProfile mutation endpoint is no longer supported",
};

const findRoute = (path, method) =>
  barberRoutes.stack.find(
    (layer) => layer.route?.path === path && layer.route?.methods?.[method]
  );

const createResponse = (resolve) => ({
  statusCode: 200,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    resolve({ statusCode: this.statusCode, body });
    return this;
  },
});

const executeRoute = (route, req) =>
  new Promise((resolve, reject) => {
    const res = createResponse(resolve);
    let index = 0;

    const next = (error) => {
      if (error) {
        reject(error);
        return;
      }

      const stackLayer = route.route.stack[index++];
      if (!stackLayer) {
        resolve({ nextCalled: true });
        return;
      }

      Promise.resolve(stackLayer.handle(req, res, next)).catch(reject);
    };

    next();
  });

const invokeMiddleware = (middleware, req) =>
  new Promise((resolve, reject) => {
    const res = createResponse(resolve);
    const next = (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ nextCalled: true });
    };

    Promise.resolve(middleware(req, res, next)).catch(reject);
  });

const withAuthenticatedUser = async (user, callback) => {
  const originalFindById = User.findById;
  const originalJwtSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = "barber-route-test-secret";
  User.findById = () => ({ select: async () => user });

  try {
    return await callback({
      headers: {
        authorization: `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}`,
      },
    });
  } finally {
    User.findById = originalFindById;
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  }
};

const noAccessProxy = (name) =>
  new Proxy({}, {
    get() {
      throw new Error(`${name} must not be inspected by the tombstone handler`);
    },
  });

const assertGenericTombstoneRoute = async ({ method, path }) => {
  const route = findRoute(path, method);

  assert.ok(route, `expected ${method.toUpperCase()} ${path} route`);
  assert.deepEqual(
    route.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "genericBarberProfileMutationTombstone"]
  );
  assert.ok(
    !route.route.stack.some((stackLayer) =>
      ["create", "update", "remove"].includes(stackLayer.name)
    ),
    "generic CRUD controller must not be registered"
  );

  const result = await withAuthenticatedUser(
    { _id: "barber-route-test-user", role: "client" },
    (request) =>
      executeRoute(route, {
        ...request,
        params: noAccessProxy("route parameters"),
        body: noAccessProxy("request body"),
      })
  );

  assert.deepEqual(result, { statusCode: 410, body: genericTombstoneResponse });
};

test("barber client CRM route requires auth before controller", () => {
  const route = barberRoutes.stack.find(
    (layer) => layer.route?.path === "/me/clients"
  );

  assert.ok(route, "expected /me/clients route to be registered");
  assert.deepEqual(
    route.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberSubscription", "getMyBarberClients"]
  );
});

test("barber client loyalty route requires auth before controller", () => {
  const route = barberRoutes.stack.find(
    (layer) =>
      layer.route?.path === "/me/clients/:clientId/loyalty" &&
      layer.route?.methods?.patch
  );

  assert.ok(route, "expected PATCH /me/clients/:clientId/loyalty route");
  assert.deepEqual(
    route.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberSubscription", "updateMyBarberClientLoyalty"]
  );
});

test("barber client loyalty route is registered before generic barber id route", () => {
  const paths = barberRoutes.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);

  assert.ok(
    paths.indexOf("/me/clients/:clientId/loyalty") < paths.indexOf("/:id"),
    "/me/clients/:clientId/loyalty must be registered before /:id"
  );
});

test("barber loyalty discount settings routes require auth before controller", () => {
  const getRoute = barberRoutes.stack.find(
    (layer) =>
      layer.route?.path === "/me/loyalty-discount-settings" &&
      layer.route?.methods?.get
  );
  const patchRoute = barberRoutes.stack.find(
    (layer) =>
      layer.route?.path === "/me/loyalty-discount-settings" &&
      layer.route?.methods?.patch
  );

  assert.ok(getRoute, "expected GET /me/loyalty-discount-settings route");
  assert.ok(patchRoute, "expected PATCH /me/loyalty-discount-settings route");
  assert.deepEqual(
    getRoute.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberSubscription", "getMyLoyaltyDiscountSettings"]
  );
  assert.deepEqual(
    patchRoute.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberSubscription", "updateMyLoyaltyDiscountSettings"]
  );
});

test("barber client CRM route is registered before generic barber id route", () => {
  const paths = barberRoutes.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);

  assert.ok(
    paths.indexOf("/me/clients") < paths.indexOf("/:id"),
    "/me/clients must be registered before /:id"
  );
});

test("barber deposit settings routes require auth and barber role middleware", () => {
  const getRoute = barberRoutes.stack.find(
    (layer) => layer.route?.path === "/me/deposit-settings" && layer.route?.methods?.get
  );
  const patchRoute = barberRoutes.stack.find(
    (layer) => layer.route?.path === "/me/deposit-settings" && layer.route?.methods?.patch
  );

  assert.ok(getRoute, "expected GET /me/deposit-settings route");
  assert.ok(patchRoute, "expected PATCH /me/deposit-settings route");
  assert.deepEqual(
    getRoute.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberRole", "getMyDepositSettings"]
  );
  assert.deepEqual(
    patchRoute.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberRole", "updateMyDepositSettings"]
  );
});

test("generic BarberProfile POST is protected and returns the bounded tombstone", async () => {
  await assertGenericTombstoneRoute({ method: "post", path: "/" });
});

test("generic BarberProfile PUT is protected and returns the bounded tombstone", async () => {
  await assertGenericTombstoneRoute({ method: "put", path: "/:id" });
});

test("generic BarberProfile DELETE is protected and returns the bounded tombstone", async () => {
  await assertGenericTombstoneRoute({ method: "delete", path: "/:id" });
});

test("generic BarberProfile tombstones reject unauthenticated callers before 410", async () => {
  const route = findRoute("/", "post");

  const result = await executeRoute(route, {
    headers: {},
    params: noAccessProxy("route parameters"),
    body: noAccessProxy("request body"),
  });

  assert.deepEqual(result, {
    statusCode: 401,
    body: { message: "Not authorized, no token" },
  });
});

test("dedicated self-profile update requires barber role before upload middleware", () => {
  const route = findRoute("/profile/:barberId", "put");

  assert.ok(route, "expected PUT /profile/:barberId route");
  assert.equal(route.route.stack[2].handle, uploadLimiter);
  assert.deepEqual(
    route.route.stack.map((stackLayer, index) =>
      index === 2 ? "uploadLimiter" : stackLayer.name
    ),
    [
      "protect",
      "requireBarberRole",
      "uploadLimiter",
      "handleAvatarUpload",
      "upsertProfileByBarberId",
    ]
  );
});

test("dedicated self-profile update rejects clients before upload processing", async () => {
  const route = findRoute("/profile/:barberId", "put");
  const roleMiddleware = route.route.stack[1].handle;

  const result = await invokeMiddleware(roleMiddleware, { user: { role: "client" } });

  assert.deepEqual(result, {
    statusCode: 403,
    body: {
      code: "BARBER_ROLE_REQUIRED",
      message: "Only barbers can access this resource",
    },
  });
});

test("dedicated self-profile update allows barbers to continue to upload middleware", async () => {
  const route = findRoute("/profile/:barberId", "put");
  const roleMiddleware = route.route.stack[1].handle;

  const result = await invokeMiddleware(roleMiddleware, { user: { role: "barber" } });

  assert.deepEqual(result, { nextCalled: true });
});

test("dedicated self-profile update remains before generic PUT route", () => {
  const routes = barberRoutes.stack.filter((layer) => layer.route);
  const profileRouteIndex = routes.findIndex(
    (layer) => layer.route.path === "/profile/:barberId" && layer.route.methods.put
  );
  const genericPutRouteIndex = routes.findIndex(
    (layer) => layer.route.path === "/:id" && layer.route.methods.put
  );

  assert.ok(profileRouteIndex < genericPutRouteIndex);
});
