import assert from "node:assert/strict";
import { test } from "node:test";

import router from "./barberOnboardingRoutes.js";

const routeLayers = () => router.stack.filter((layer) => layer.route);
const routeFor = (path, method) =>
  routeLayers().find((layer) => layer.route.path === path && layer.route.methods[method]);
const handlerNames = (layer) => layer.route.stack.map((entry) => entry.handle.name);

test("barber onboarding routes register GET, PATCH, and finalization with protect middleware", () => {
  const get = routeFor("/me", "get");
  const patch = routeFor("/me", "patch");
  const finalize = routeFor("/me/finalize", "post");

  assert.ok(get);
  assert.ok(patch);
  assert.ok(finalize);
  assert.deepEqual(handlerNames(get), ["protect", "getMyBarberOnboarding"]);
  assert.deepEqual(handlerNames(patch), ["protect", "updateMyBarberOnboardingWorkplace"]);
  assert.deepEqual(handlerNames(finalize), ["protect", "finalizeMyBarberOnboarding"]);
});

test("barber onboarding routes avoid public, subscription, membership, and parameter routes", () => {
  assert.deepEqual(
    routeLayers().map((layer) => layer.route.path),
    ["/me", "/me", "/me/finalize"]
  );

  for (const layer of routeLayers()) {
    const names = handlerNames(layer);
    assert.equal(names.includes("requireBarberSubscription"), false);
    assert.equal(names.includes("requireSalonMembership"), false);
    assert.equal(String(layer.route.path).includes(":userId"), false);
    assert.equal(String(layer.route.path).includes(":salonId"), false);
  }
});
