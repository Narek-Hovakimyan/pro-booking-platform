import assert from "node:assert/strict";
import { test } from "node:test";

import serviceRoutes from "./services/serviceRoutes.js";

test("service list route uses optional auth before controller", () => {
  const route = serviceRoutes.stack.find(
    (layer) => layer.route?.path === "/:barberId" && layer.route?.methods?.get
  );

  assert.ok(route, "expected GET /:barberId service route");
  assert.deepEqual(
    route.route.stack.map((stackLayer) => stackLayer.name),
    ["optionalAuth", "requirePublicBarberReadiness", "getServicesByBarber"]
  );
});

test("service mutation routes still require subscription", () => {
  const postRoute = serviceRoutes.stack.find(
    (layer) => layer.route?.path === "/" && layer.route?.methods?.post
  );
  const putRoute = serviceRoutes.stack.find(
    (layer) => layer.route?.path === "/:id" && layer.route?.methods?.put
  );
  const deleteRoute = serviceRoutes.stack.find(
    (layer) => layer.route?.path === "/:id" && layer.route?.methods?.delete
  );

  assert.deepEqual(
    postRoute.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberSubscription", "createService"]
  );
  assert.deepEqual(
    putRoute.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberSubscription", "updateService"]
  );
  assert.deepEqual(
    deleteRoute.route.stack.map((stackLayer) => stackLayer.name),
    ["protect", "requireBarberSubscription", "deleteService"]
  );
});
