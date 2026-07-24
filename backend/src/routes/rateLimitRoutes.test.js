import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accountMutationLimiter,
  bookingMutationLimiter,
  emailVerificationLimiter,
  messageMutationLimiter,
  messageReadLimiter,
  messageLimiter,
  paymentLimiter,
  promoValidationLimiter,
  publicBookingLimiter,
  securityMutationLimiter,
  uploadLimiter,
  waitlistActionLimiter,
  webhookLimiter,
} from "../middleware/rateLimitMiddleware.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";
import bookingRoutes from "./bookings/bookingRoutes.js";
import waitlistRoutes from "./bookings/waitlistRoutes.js";
import eventRoutes from "./events/eventRoutes.js";
import messageRoutes from "./messaging/messageRoutes.js";
import paymentRoutes from "./billing/paymentRoutes.js";
import portfolioPhotoRoutes from "./portfolio/portfolioPhotoRoutes.js";
import salonRoutes from "./salons/salonRoutes.js";
import subscriptionRoutes from "./billing/subscriptionRoutes.js";
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
  assert.ok(routeHandles(route).includes(messageMutationLimiter));
  assert.ok(!routeHandles(route).includes(messageLimiter));
});

test("booking mutation limiter is attached to protected booking mutations after authentication", () => {
  const createReschedule = findRoute(bookingRoutes, "/:id/reschedule-request", "post");
  const acceptReschedule = findRoute(bookingRoutes, "/:id/reschedule-request/accept", "patch");
  const updateBookingRoute = findRoute(bookingRoutes, "/:id", "put");
  const treatmentRecordRoute = findRoute(bookingRoutes, "/:id/treatment-record", "put");

  for (const route of [
    createReschedule,
    acceptReschedule,
    updateBookingRoute,
    treatmentRecordRoute,
  ]) {
    assert.ok(route, "expected protected booking mutation route");
    const handles = routeHandles(route);
    assert.ok(handles.includes(bookingMutationLimiter));
  }

  assert.deepEqual(routeHandles(createReschedule), [protect, bookingMutationLimiter, createReschedule.stack[2].handle]);
  assert.deepEqual(routeHandles(acceptReschedule), [protect, bookingMutationLimiter, acceptReschedule.stack[2].handle]);
  assert.deepEqual(routeHandles(updateBookingRoute), [
    protect,
    requireBarberSubscription,
    bookingMutationLimiter,
    updateBookingRoute.stack[3].handle,
  ]);
  assert.deepEqual(routeHandles(treatmentRecordRoute), [
    protect,
    requireBarberSubscription,
    bookingMutationLimiter,
    uploadLimiter,
    treatmentRecordRoute.stack[4].handle,
  ]);
});

test("waitlist action limiter is attached to protected waitlist actions after authentication", () => {
  const createEntryRoute = findRoute(waitlistRoutes, "/", "post");
  const cancelEntryRoute = findRoute(waitlistRoutes, "/:id/cancel", "patch");
  const approveEntryRoute = findRoute(waitlistRoutes, "/:id/approve", "patch");

  for (const route of [createEntryRoute, cancelEntryRoute, approveEntryRoute]) {
    assert.ok(route, "expected protected waitlist action route");
    assert.ok(routeHandles(route).includes(waitlistActionLimiter));
  }

  assert.deepEqual(routeHandles(createEntryRoute), [protect, waitlistActionLimiter, createEntryRoute.stack[2].handle]);
  assert.deepEqual(routeHandles(cancelEntryRoute), [protect, waitlistActionLimiter, cancelEntryRoute.stack[2].handle]);
  assert.deepEqual(routeHandles(approveEntryRoute), [
    protect,
    requireBarberSubscription,
    waitlistActionLimiter,
    approveEntryRoute.stack[3].handle,
  ]);
});

test("message read limiter is attached to protected message reads", () => {
  const listRoute = findRoute(messageRoutes, "/", "get");
  const readRoute = findRoute(messageRoutes, "/read/:otherUserId", "put");
  const conversationRoute = findRoute(messageRoutes, "/conversation/:otherUserId", "get");

  for (const route of [listRoute, readRoute, conversationRoute]) {
    assert.ok(route, "expected protected message read route");
    assert.ok(routeHandles(route).includes(messageReadLimiter));
  }

  assert.deepEqual(routeHandles(listRoute), [protect, messageReadLimiter, listRoute.stack[2].handle]);
  assert.deepEqual(routeHandles(readRoute), [protect, messageReadLimiter, readRoute.stack[2].handle]);
  assert.deepEqual(routeHandles(conversationRoute), [
    protect,
    messageReadLimiter,
    conversationRoute.stack[2].handle,
  ]);
});

test("account and email verification limiters are attached to user routes", () => {
  const updateProfileRoute = findRoute(userRoutes, "/me", "put");
  const sendVerificationRoute = findRoute(userRoutes, "/me/email/verification", "post");
  const verifyEmailRoute = findRoute(userRoutes, "/me/email/verify", "get");

  assert.ok(updateProfileRoute, "expected PUT /api/users/me route");
  assert.ok(sendVerificationRoute, "expected POST /api/users/me/email/verification route");
  assert.ok(verifyEmailRoute, "expected GET /api/users/me/email/verify route");

  assert.deepEqual(routeHandles(updateProfileRoute), [
    protect,
    accountMutationLimiter,
    uploadLimiter,
    updateProfileRoute.stack[3].handle,
    updateProfileRoute.stack[4].handle,
  ]);
  assert.deepEqual(routeHandles(sendVerificationRoute), [
    protect,
    securityMutationLimiter,
    sendVerificationRoute.stack[2].handle,
  ]);
  assert.deepEqual(routeHandles(verifyEmailRoute), [
    emailVerificationLimiter,
    verifyEmailRoute.stack[1].handle,
  ]);
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
