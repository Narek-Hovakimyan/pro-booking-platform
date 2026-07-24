import assert from "node:assert/strict";
import { test } from "node:test";

import { handlePaymentWebhook } from "../../controllers/billing/paymentController.js";
import { webhookFailureLimiter } from "../../middleware/rateLimitMiddleware.js";
import paymentRoutes from "./paymentRoutes.js";

const webhookRoute = paymentRoutes.stack.find(
  (layer) => layer.route?.path === "/webhook" && layer.route?.methods?.post
)?.route;

test("payment webhook route keeps limiter before the controller", () => {
  assert.ok(webhookRoute, "expected POST /api/payments/webhook route");
  assert.deepEqual(
    webhookRoute.stack.map((layer) => layer.handle),
    [webhookFailureLimiter, handlePaymentWebhook]
  );
});
