import assert from "node:assert/strict";
import { test } from "node:test";

import {
  messageLimiter,
  paymentLimiter,
  promoValidationLimiter,
  publicBookingLimiter,
  uploadLimiter,
  webhookLimiter,
} from "../middleware/rateLimitMiddleware.js";
import bookingRoutes from "./bookingRoutes.js";
import eventRoutes from "./eventRoutes.js";
import messageRoutes from "./messageRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import portfolioPhotoRoutes from "./portfolioPhotoRoutes.js";
import salonRoutes from "./salons/salonRoutes.js";
import subscriptionRoutes from "./subscriptionRoutes.js";
import userRoutes from "./users/userRoutes.js";

const findRoute = (router, path, method) =>
  router.stack.find(
    (layer) => layer.route?.path === path && layer.route?.methods?.[method]
  )?.route;

const routeHandles = (route) => route.stack.map((layer) => layer.handle);

test("public booking limiter is attached to booking creation and event registration", () => {
  const bookingCreate = findRoute(bookingRoutes, "/", "post");
  const eventRegistration = findRoute(eventRoutes, "/:id/register", "post");

  assert.ok(bookingCreate, "expected POST /api/bookings route");
  assert.ok(eventRegistration, "expected POST /api/events/:id/register route");
  assert.ok(routeHandles(bookingCreate).includes(publicBookingLimiter));
  assert.ok(routeHandles(eventRegistration).includes(publicBookingLimiter));
});

test("promo validation limiter is attached to salon promotion validation", () => {
  const route = findRoute(salonRoutes, "/:salonId/promotions/validate", "post");

  assert.ok(route, "expected salon promotion validation route");
  assert.ok(routeHandles(route).includes(promoValidationLimiter));
});

test("message limiter is attached to message send route", () => {
  const route = findRoute(messageRoutes, "/", "post");

  assert.ok(route, "expected POST /api/messages route");
  assert.ok(routeHandles(route).includes(messageLimiter));
});

test("upload limiter is attached before upload handlers", () => {
  const bookingCreate = findRoute(bookingRoutes, "/", "post");
  const userProfile = findRoute(userRoutes, "/me", "put");
  const portfolioCreate = findRoute(portfolioPhotoRoutes, "/", "post");
  const eventCreate = findRoute(eventRoutes, "/", "post");

  for (const route of [bookingCreate, userProfile, portfolioCreate, eventCreate]) {
    assert.ok(route, "expected upload route");
    assert.ok(routeHandles(route).includes(uploadLimiter));
  }
});

test("payment limiter is attached to payment attempt actions", () => {
  const paymentIntent = findRoute(subscriptionRoutes, "/payment-intent", "post");
  const cancelAttempt = findRoute(
    subscriptionRoutes,
    "/payment-attempts/:attemptId/cancel",
    "post"
  );
  const devConfirm = findRoute(
    subscriptionRoutes,
    "/payment-attempts/:attemptId/dev-confirm",
    "post"
  );

  for (const route of [paymentIntent, cancelAttempt, devConfirm]) {
    assert.ok(route, "expected subscription payment route");
    assert.ok(routeHandles(route).includes(paymentLimiter));
  }
});

test("webhook limiter is attached to payment webhook", () => {
  const route = findRoute(paymentRoutes, "/webhook", "post");

  assert.ok(route, "expected POST /api/payments/webhook route");
  assert.ok(routeHandles(route).includes(webhookLimiter));
});
