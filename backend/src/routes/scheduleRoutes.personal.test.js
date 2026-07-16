import assert from "node:assert/strict";
import { test } from "node:test";

import scheduleRoutes from "./scheduleRoutes.js";

const paths = scheduleRoutes.stack
  .map((layer) => layer.route?.path)
  .filter(Boolean);

test("personal schedule routes are registered before the dynamic salon route", () => {
  const personalIndex = paths.indexOf("/:barberId/personal");
  const salonIndex = paths.indexOf("/:barberId/:salonId");

  assert.notEqual(personalIndex, -1);
  assert.notEqual(salonIndex, -1);
  assert.ok(personalIndex < salonIndex);
});

test("personal GET and PUT routes require authentication", () => {
  const personalRoutes = scheduleRoutes.stack.filter(
    (layer) => layer.route?.path === "/:barberId/personal"
  );

  assert.equal(personalRoutes.length, 2);
  for (const layer of personalRoutes) {
    assert.equal(layer.route.stack.length >= 2, true);
  }
});
