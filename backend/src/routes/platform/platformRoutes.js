import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import {
  PLATFORM_CAPABILITIES,
  requirePlatformCapability,
} from "../../middleware/platformMiddleware.js";
import { requireRecentAuthentication } from "../../middleware/recentAuthenticationMiddleware.js";
import { securityMutationLimiter } from "../../middleware/rateLimitMiddleware.js";
import { getPlatformDashboardSummaryHandler } from "../../controllers/platform/platformDashboardController.js";
import {
  listSalonBillingSummaries,
  getSalonBillingDetailHandler,
  getSalonPaymentsHandler,
  getSalonTransactionsHandler,
  getSalonPaymentAttemptsHandler,
  listAllSalonPayments,
  listAllSalonPaymentAttempts,
  listIndividualBillingSummaries,
  getIndividualPaymentsHandler,
  getIndividualTransactionsHandler,
  getIndividualPaymentAttemptsHandler,
  activateSubscription,
  updateSeatCount,
  assignSeat,
  revokeSeat,
  cancelSubscription,
  confirmPayment,
} from "../../controllers/platform/platformBillingController.js";

const router = express.Router();

/**
 * GET /api/platform/access-check
 * Protected — platform superuser only.
 * Returns safe platform superuser identity info.
 */
router.get(
  "/access-check",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  (req, res) => {
    return res.json({
      id: req.user._id,
      email: req.user.email || "",
      name: req.user.name,
      canAccessPlatform: true,
    });
  }
);

/**
 * GET /api/platform/dashboard/summary
 * Safe read-only platform dashboard summary.
 * Protected — platform superuser only.
 */
router.get(
  "/dashboard/summary",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  getSalonBillingDetailHandler
);

/**
 * Legacy payment history endpoint, retained temporarily for external clients.
 * Protected — platform superuser only.
 */
router.get(
  "/billing/salons/:salonId/payments",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  getSalonPaymentsHandler
);

router.get(
  "/billing/salons/:salonId/transactions",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  getSalonTransactionsHandler
);

router.get(
  "/billing/salons/:salonId/payment-attempts",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  getSalonPaymentAttemptsHandler
);

/**
 * Legacy payment history endpoint, retained temporarily for external clients.
 * Protected — platform superuser only.
 */
router.get(
  "/billing/payments",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  listAllSalonPayments
);

router.get(
  "/billing/payment-attempts",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  listAllSalonPaymentAttempts
);

/**
 * GET /api/platform/billing/individuals
 * List individual barber billing summaries (paginated + filtered).
 * Protected — platform superuser only.
 */
router.get(
  "/billing/individuals",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  listIndividualBillingSummaries
);

/**
 * Legacy payment history endpoint, retained temporarily for external clients.
 * Protected — platform superuser only.
 */
router.get(
  "/billing/individuals/:barberId/payments",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  getIndividualPaymentsHandler
);

router.get(
  "/billing/individuals/:barberId/transactions",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  getIndividualTransactionsHandler
);

router.get(
  "/billing/individuals/:barberId/payment-attempts",
  protect,
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_READ),
  getIndividualPaymentAttemptsHandler
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_MANAGE),
  securityMutationLimiter,
  requireRecentAuthentication,
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_MANAGE),
  securityMutationLimiter,
  requireRecentAuthentication,
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_MANAGE),
  securityMutationLimiter,
  requireRecentAuthentication,
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_MANAGE),
  securityMutationLimiter,
  requireRecentAuthentication,
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_MANAGE),
  securityMutationLimiter,
  requireRecentAuthentication,
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
  requirePlatformCapability(PLATFORM_CAPABILITIES.BILLING_MANAGE),
  securityMutationLimiter,
  requireRecentAuthentication,
  confirmPayment
);

export default router;
