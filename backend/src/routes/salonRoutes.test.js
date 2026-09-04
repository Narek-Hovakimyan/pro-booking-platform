import assert from "node:assert/strict";
import { test } from "node:test";

import salonRoutes from "./salons/salonRoutes.js";

const findRoute = (path, method) =>
  salonRoutes.stack.find(
    (layer) => layer.route?.path === path && layer.route?.methods?.[method]
  )?.route;

test("public salon list route uses optional auth before controller", () => {
  const route = findRoute("/", "get");

  assert.ok(route, "expected GET /api/salons route");
  assert.deepEqual(
    route.stack.map((stackLayer) => stackLayer.name),
    ["optionalAuth", "listSalons"]
  );
});

test("join application policy route is protected and distinct from public salon routes", () => {
  const route = findRoute("/:salonId/join-application-policy", "patch");

  assert.ok(route, "expected PATCH join application policy route");
  assert.deepEqual(
    route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "updateSalonJoinApplicationPolicy"]
  );
});
