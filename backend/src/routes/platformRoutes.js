import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requirePlatformAdmin } from "../middleware/platformMiddleware.js";
import {
  listSalonBillingSummaries,
  getSalonBillingDetailHandler,
  getSalonPaymentsHandler,
  listAllSalonPayments,
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

export default router;
