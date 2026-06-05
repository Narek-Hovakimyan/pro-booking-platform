import express from "express";
import { protect } from "../middleware/authMiddleware.js";
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
  devConfirmPaymentAttempt,
} from "../controllers/subscriptionController.js";

const router = express.Router();

// GET /api/subscriptions/plan/default — must be before /me
router.get("/plan/default", getDefaultPlan);

// GET /api/subscriptions/me
router.get("/me", protect, getMySubscription);

// GET /api/subscriptions/payments/me
router.get("/payments/me", protect, getMySubscriptionPayments);

// POST /api/subscriptions/dev/grant
router.post("/dev/grant", protect, devGrantSubscription);

// POST /api/subscriptions/dev/extend
router.post("/dev/extend", protect, devExtendSubscription);

// POST /api/subscriptions/payment-intent
router.post("/payment-intent", protect, createPaymentIntent);

// GET /api/subscriptions/payment-attempts/:attemptId
router.get("/payment-attempts/:attemptId", protect, getPaymentAttempt);

// POST /api/subscriptions/payment-attempts/:attemptId/cancel
router.post("/payment-attempts/:attemptId/cancel", protect, cancelPaymentAttempt);

// POST /api/subscriptions/payment-attempts/:attemptId/dev-confirm
router.post(
  "/payment-attempts/:attemptId/dev-confirm",
  protect,
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
router.post("/salon/:salonId/seats", protect, assignSeat);

// PATCH /api/subscriptions/seats/:seatId/revoke
router.patch("/seats/:seatId/revoke", protect, revokeSeat);

// PATCH /api/subscriptions/salon/:salonId/seat-count
router.patch("/salon/:salonId/seat-count", protect, updateSeatCount);

export default router;
