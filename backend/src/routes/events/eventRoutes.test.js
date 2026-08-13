import assert from "node:assert/strict";
import { test } from "node:test";

import eventRoutes from "./eventRoutes.js";

const findRoute = (path, method) =>
  eventRoutes.stack.find(
    (layer) => layer.route?.path === path && layer.route?.methods?.[method]
  )?.route;

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test("event reviews route applies optionalAuth before getEventReviews", () => {
  const route = findRoute("/:id/reviews", "get");

  assert.ok(route, "expected GET /:id/reviews route");
  assert.deepEqual(
    route.stack.map((layer) => layer.name),
    ["optionalAuth", "getEventReviews"]
  );
});

test("event reviews invalid token is rejected before the controller", async () => {
  const route = findRoute("/:id/reviews", "get");
  const res = createResponse();
  let controllerReached = false;

  await route.stack[0].handle(
    { headers: { authorization: "Bearer malformed-token" } },
    res,
    () => { controllerReached = true; }
  );

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Not authorized, token failed" });
  assert.equal(controllerReached, false);
});
