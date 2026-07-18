import assert from "node:assert/strict";
import { test } from "node:test";

import salonRoutes from "./salonRoutes.js";

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
