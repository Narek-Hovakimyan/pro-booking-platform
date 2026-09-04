import assert from "node:assert/strict";
import { test } from "node:test";

import salonJobRoutes from "./salonJobRoutes.js";

test("job onboarding confirmation is a protected static application route", () => {
  const route = salonJobRoutes.stack.find(
    (layer) => layer.route?.path === "/applications/:applicationId/onboarding/confirm"
  );

  assert.ok(route);
  assert.ok(route.route.methods.post);
  assert.equal(route.route.stack.length, 2);
});
