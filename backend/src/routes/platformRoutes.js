import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requirePlatformSuperuser } from "../middleware/platformMiddleware.js";
import { getPlatformDashboardSummaryHandler } from "../controllers/platformDashboardController.js";
import {
  listSalonBillingSummaries,
  getSalonBillingDetailHandler,
  getSalonPaymentsHandler,
  listAllSalonPayments,
  listIndividualBillingSummaries,
  getIndividualPaymentsHandler,
  activateSubscription,
  updateSeatCount,
  assignSeat,
  revokeSeat,
  cancelSubscription,
  confirmPayment,
} from "../controllers/platformBillingController.js";

const router = express.Router();

/**
 * GET /api/platform/access-check
 * Protected — platform superuser only.
 * Returns safe platform superuser identity info.
 */
router.get("/access-check", protect, requirePlatformSuperuser, (req, res) => {
  return res.json({
    id: req.user._id,
    email: req.user.email || "",
    name: req.user.name,
    canAccessPlatform: true,
  });
});

/**
 * GET /api/platform/dashboard/summary
 * Safe read-only platform dashboard summary.
 * Protected — platform superuser only.
 */
router.get(
  "/dashboard/summary",
  protect,
  requirePlatformSuperuser,
  getPlatformDashboardSummaryHandler
);

/**
 * GET /api/platform/billing/salons
 * List all salon billing summaries (paginated + filtered).
 * Protected — platform superuser only.
 */
router.get(
  "/billing/salons",
  protect,
  requirePlatformSuperuser,
  listSalonBillingSummaries
);

/**
 * GET /api/platform/billing/salons/:salonId
 * Get full billing detail for one salon.
 * Protected — platform superuser only.
 */
router.get(
  "/billing/salons/:salonId",
  protect,
  requirePlatformSuperuser,
  getSalonBillingDetailHandler
);

/**
 * GET /api/platform/billing/salons/:salonId/payments
 * Get payment attempts for one salon.
 * Protected — platform superuser only.
 */
router.get(
  "/billing/salons/:salonId/payments",
  protect,
  requirePlatformSuperuser,
  getSalonPaymentsHandler
);

/**
 * GET /api/platform/billing/payments
 * All salon subscription payments across platform.
 * Protected — platform superuser only.
 */
router.get(
  "/billing/payments",
  protect,
  requirePlatformSuperuser,
  listAllSalonPayments
);

/**
 * GET /api/platform/billing/individuals
 * List individual barber billing summaries (paginated + filtered).
 * Protected — platform superuser only.
 */
router.get(
  "/billing/individuals",
  protect,
  requirePlatformSuperuser,
  listIndividualBillingSummaries
);

/**
 * GET /api/platform/billing/individuals/:barberId/payments
 * Get individual barber subscription payments.
 * Protected — platform superuser only.
 */
router.get(
  "/billing/individuals/:barberId/payments",
  protect,
  requirePlatformSuperuser,
  getIndividualPaymentsHandler
);

/**
 * PATCH /api/platform/billing/salons/:salonId/subscription/activate
 * Activate or renew a salon subscription manually.
 * Protected — platform superuser only.
 * Body: { seatCount?, months?, note }
 */
router.patch(
  "/billing/salons/:salonId/subscription/activate",
  protect,
  requirePlatformSuperuser,
  activateSubscription
);

/**
 * PATCH /api/platform/billing/salons/:salonId/subscription/seat-count
 * Update the seat count on a salon subscription.
 * Protected — platform superuser only.
 * Body: { seatCount, note }
 */
router.patch(
  "/billing/salons/:salonId/subscription/seat-count",
  protect,
  requirePlatformSuperuser,
  updateSeatCount
);

/**
 * POST /api/platform/billing/salons/:salonId/seats/assign
 * Assign a subscription seat to an accepted staff barber.
 * Protected — platform superuser only.
 * Body: { barberId, note }
 */
router.post(
  "/billing/salons/:salonId/seats/assign",
  protect,
  requirePlatformSuperuser,
  assignSeat
);

/**
 * POST /api/platform/billing/salons/:salonId/seats/revoke
 * Revoke a subscription seat from an assigned staff barber.
 * Protected — platform superuser only.
 * Body: { barberId, note }
 */
router.post(
  "/billing/salons/:salonId/seats/revoke",
  protect,
  requirePlatformSuperuser,
  revokeSeat
);

/**
 * POST /api/platform/billing/salons/:salonId/subscription/cancel
 * Cancel/deactivate a salon subscription (soft cancel).
 * Protected — platform superuser only.
 * Body: { note }
 */
router.post(
  "/billing/salons/:salonId/subscription/cancel",
  protect,
  requirePlatformSuperuser,
  cancelSubscription
);

/**
 * POST /api/platform/billing/payments/:paymentId/confirm
 * Manually confirm a salon subscription payment (manual provider only).
 * Protected — platform superuser only.
 * Body: { note }
 */
router.post(
  "/billing/payments/:paymentId/confirm",
  protect,
  requirePlatformSuperuser,
  confirmPayment
);

export default router;
