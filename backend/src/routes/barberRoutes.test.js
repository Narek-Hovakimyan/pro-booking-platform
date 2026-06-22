import assert from "node:assert/strict";
import { test } from "node:test";

import barberRoutes from "./barberRoutes.js";

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
