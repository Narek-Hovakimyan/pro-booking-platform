import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMySubscription,
  getDefaultPlan,
  devGrantSubscription,
  getSalonSubscription,
  getSalonSubscriptionSeats,
  assignSeat,
  revokeSeat,
  updateSeatCount,
} from "../controllers/subscriptionController.js";

const router = express.Router();

// GET /api/subscriptions/plan/default — must be before /me
router.get("/plan/default", getDefaultPlan);

// GET /api/subscriptions/me
router.get("/me", protect, getMySubscription);

// POST /api/subscriptions/dev/grant
router.post("/dev/grant", protect, devGrantSubscription);

/* ══════════════════════════════════════════════════════════
 *  Phase 2 — Salon seat assignment
 * ══════════════════════════════════════════════════════════ */

// GET /api/subscriptions/salon/:salonId
router.get("/salon/:salonId", protect, getSalonSubscription);

// GET /api/subscriptions/salon/:salonId/seats
router.get("/salon/:salonId/seats", protect, getSalonSubscriptionSeats);

// POST /api/subscriptions/salon/:salonId/seats
router.post("/salon/:salonId/seats", protect, assignSeat);

// PATCH /api/subscriptions/seats/:seatId/revoke
router.patch("/seats/:seatId/revoke", protect, revokeSeat);

// PATCH /api/subscriptions/salon/:salonId/seat-count
router.patch("/salon/:salonId/seat-count", protect, updateSeatCount);

export default router;
