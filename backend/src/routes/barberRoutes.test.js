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

test("barber client CRM route is registered before generic barber id route", () => {
  const paths = barberRoutes.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);

  assert.ok(
    paths.indexOf("/me/clients") < paths.indexOf("/:id"),
    "/me/clients must be registered before /:id"
  );
});
