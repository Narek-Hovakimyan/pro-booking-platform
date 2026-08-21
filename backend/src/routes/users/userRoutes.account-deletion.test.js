import assert from "node:assert/strict";
import test from "node:test";

import { deleteMyAccount } from "../../controllers/users/accountDeletionController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { requireAuthCookieRequestSecurity } from "../../middleware/authCsrfMiddleware.js";
import { securityMutationLimiter } from "../../middleware/rateLimitMiddleware.js";
import userRoutes from "./userRoutes.js";

test("DELETE /me preserves the protected security-mutation middleware order", () => {
  const route = userRoutes.stack.find((layer) => layer.route?.path === "/me" && layer.route.methods.delete);
  assert.ok(route);
  assert.deepEqual(route.route.stack.map((layer) => layer.handle), [
    protect, securityMutationLimiter, requireAuthCookieRequestSecurity, deleteMyAccount,
  ]);
});
