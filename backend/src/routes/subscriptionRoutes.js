import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { paymentLimiter } from "../middleware/rateLimitMiddleware.js";
import {
  getMySubscription,
  getDefaultPlan,
  devGrantSubscription,
  devExtendSubscription,
  createPaymentIntent,
  getSalonSubscription,
  getSalonSubscriptionSeats,
  assignSeat,
  revokeSeat,
  updateSeatCount,
  getMySubscriptionPayments,
  getSalonSubscriptionPayments,
  getPaymentAttempt,
  cancelPaymentAttempt,
  devConfirmSeatUpdate,
  devConfirmPaymentAttempt,
} from "../controllers/billing/subscriptionController.js";

const router = express.Router();

// GET /api/subscriptions/plan/default — must be before /me
router.get("/plan/default", getDefaultPlan);

// GET /api/subscriptions/me
router.get("/me", protect, getMySubscription);

// GET /api/subscriptions/payments/me
router.get("/payments/me", protect, getMySubscriptionPayments);

// POST /api/subscriptions/dev/grant
router.post("/dev/grant", protect, paymentLimiter, devGrantSubscription);

// POST /api/subscriptions/dev/extend
router.post("/dev/extend", protect, paymentLimiter, devExtendSubscription);

// POST /api/subscriptions/payment-intent
router.post("/payment-intent", protect, paymentLimiter, createPaymentIntent);

// GET /api/subscriptions/payment-attempts/:attemptId
router.get("/payment-attempts/:attemptId", protect, getPaymentAttempt);

// POST /api/subscriptions/payment-attempts/:attemptId/cancel
router.post("/payment-attempts/:attemptId/cancel", protect, paymentLimiter, cancelPaymentAttempt);

// POST /api/subscriptions/payment-attempts/:attemptId/dev-confirm-seat-update
router.post(
  "/payment-attempts/:attemptId/dev-confirm-seat-update",
  protect,
  paymentLimiter,
  devConfirmSeatUpdate
);

// POST /api/subscriptions/payment-attempts/:attemptId/dev-confirm
router.post(
  "/payment-attempts/:attemptId/dev-confirm",
  protect,
  paymentLimiter,
  devConfirmPaymentAttempt
);

/* ══════════════════════════════════════════════════════════
 *  Phase 2 — Salon seat assignment
 * ══════════════════════════════════════════════════════════ */

// GET /api/subscriptions/salon/:salonId
router.get("/salon/:salonId", protect, getSalonSubscription);

// GET /api/subscriptions/salon/:salonId/payments
router.get("/salon/:salonId/payments", protect, getSalonSubscriptionPayments);

// GET /api/subscriptions/salon/:salonId/seats
router.get("/salon/:salonId/seats", protect, getSalonSubscriptionSeats);

// POST /api/subscriptions/salon/:salonId/seats
router.post("/salon/:salonId/seats", protect, paymentLimiter, assignSeat);

// PATCH /api/subscriptions/seats/:seatId/revoke
router.patch("/seats/:seatId/revoke", protect, paymentLimiter, revokeSeat);

// PATCH /api/subscriptions/salon/:salonId/seat-count
router.patch("/salon/:salonId/seat-count", protect, paymentLimiter, updateSeatCount);

export default router;
