import assert from "node:assert/strict";
import { test } from "node:test";

import { promoValidationLimiter } from "../middleware/rateLimitMiddleware.js";
import voucherRoutes from "./promotions/voucherRoutes.js";

test("voucher routes expose CRUD and validate endpoints in safe order", () => {
  const routes = voucherRoutes.stack.map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods),
    handlers: layer.route.stack.map((stackLayer) => stackLayer.name),
  }));

  assert.deepEqual(routes[0], {
    path: "/validate",
    methods: ["post"],
    handlers: ["protect", "<anonymous>", "validateVoucherCode"],
  });
  assert.equal(
    voucherRoutes.stack[0].route.stack[1].handle,
    promoValidationLimiter
  );
  assert.deepEqual(routes.find((route) => route.path === "/"), {
    path: "/",
    methods: ["post"],
    handlers: ["protect", "requireBarberSubscription", "createVoucher"],
  });
  assert.deepEqual(routes.find((route) => route.path === "/owner/:ownerType/:ownerId"), {
    path: "/owner/:ownerType/:ownerId",
    methods: ["get"],
    handlers: ["protect", "getOwnerVouchers"],
  });
  assert.deepEqual(routes.find((route) => route.path === "/:id"), {
    path: "/:id",
    methods: ["get"],
    handlers: ["protect", "getVoucherById"],
  });
  assert.deepEqual(routes.find((route) => route.path === "/:id" && route.methods.includes("put")), {
    path: "/:id",
    methods: ["put"],
    handlers: ["protect", "requireBarberSubscription", "updateVoucher"],
  });
  assert.deepEqual(routes.find((route) => route.path === "/:id" && route.methods.includes("delete")), {
    path: "/:id",
    methods: ["delete"],
    handlers: ["protect", "requireBarberSubscription", "deleteVoucher"],
  });
});
