import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requirePlatformAdmin } from "../middleware/platformMiddleware.js";
import {
  listSalonBillingSummaries,
  getSalonBillingDetailHandler,
  getSalonPaymentsHandler,
  listAllSalonPayments,
  activateSubscription,
  updateSeatCount,
  assignSeat,
  revokeSeat,
  confirmPayment,
} from "../controllers/platformBillingController.js";

const router = express.Router();

/**
 * GET /api/platform/access-check
 * Protected — platform admin only.
 * Returns safe platform admin identity info.
 */
router.get("/access-check", protect, requirePlatformAdmin, (req, res) => {
  return res.json({
    id: req.user._id,
    email: req.user.email || "",
    name: req.user.name,
    platformRole: req.user.platformRole || null,
  });
});

/**
 * GET /api/platform/billing/salons
 * List all salon billing summaries (paginated + filtered).
 * Protected — platform admin only.
 */
router.get(
  "/billing/salons",
  protect,
  requirePlatformAdmin,
  listSalonBillingSummaries
);

/**
 * GET /api/platform/billing/salons/:salonId
 * Get full billing detail for one salon.
 * Protected — platform admin only.
 */
router.get(
  "/billing/salons/:salonId",
  protect,
  requirePlatformAdmin,
  getSalonBillingDetailHandler
);

/**
 * GET /api/platform/billing/salons/:salonId/payments
 * Get payment attempts for one salon.
 * Protected — platform admin only.
 */
router.get(
  "/billing/salons/:salonId/payments",
  protect,
  requirePlatformAdmin,
  getSalonPaymentsHandler
);

/**
 * GET /api/platform/billing/payments
 * All salon subscription payments across platform.
 * Protected — platform admin only.
 */
router.get(
  "/billing/payments",
  protect,
  requirePlatformAdmin,
  listAllSalonPayments
);

/**
 * PATCH /api/platform/billing/salons/:salonId/subscription/activate
 * Activate or renew a salon subscription manually.
 * Protected — platform admin only.
 * Body: { seatCount?, months?, note }
 */
router.patch(
  "/billing/salons/:salonId/subscription/activate",
  protect,
  requirePlatformAdmin,
  activateSubscription
);

/**
 * PATCH /api/platform/billing/salons/:salonId/subscription/seat-count
 * Update the seat count on a salon subscription.
 * Protected — platform admin only.
 * Body: { seatCount, note }
 */
router.patch(
  "/billing/salons/:salonId/subscription/seat-count",
  protect,
  requirePlatformAdmin,
  updateSeatCount
);

/**
 * POST /api/platform/billing/salons/:salonId/seats/assign
 * Assign a subscription seat to an accepted staff barber.
 * Protected — platform admin only.
 * Body: { barberId, note }
 */
router.post(
  "/billing/salons/:salonId/seats/assign",
  protect,
  requirePlatformAdmin,
  assignSeat
);

/**
 * POST /api/platform/billing/salons/:salonId/seats/revoke
 * Revoke a subscription seat from an assigned staff barber.
 * Protected — platform admin only.
 * Body: { barberId, note }
 */
router.post(
  "/billing/salons/:salonId/seats/revoke",
  protect,
  requirePlatformAdmin,
  revokeSeat
);

/**
 * POST /api/platform/billing/payments/:paymentId/confirm
 * Manually confirm a salon subscription payment (manual provider only).
 * Protected — platform admin only.
 * Body: { note }
 */
router.post(
  "/billing/payments/:paymentId/confirm",
  protect,
  requirePlatformAdmin,
  confirmPayment
);

export default router;
