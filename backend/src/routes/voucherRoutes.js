import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";
import {
  createVoucher,
  deleteVoucher,
  getOwnerVouchers,
  getPublicVouchers,
  getVoucherById,
  updateVoucher,
  validateVoucherCode,
} from "../controllers/voucherController.js";
import { promoValidationLimiter } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// POST /api/vouchers/validate — must be before /:id
router.post("/validate", protect, promoValidationLimiter, validateVoucherCode);

// GET /api/vouchers/public/:ownerType/:ownerId — must be before /:id
router.get("/public/:ownerType/:ownerId", getPublicVouchers);

router.post("/", protect, requireBarberSubscription, createVoucher);
router.get("/owner/:ownerType/:ownerId", protect, getOwnerVouchers);
router.get("/:id", protect, getVoucherById);
router.put("/:id", protect, requireBarberSubscription, updateVoucher);
router.delete("/:id", protect, requireBarberSubscription, deleteVoucher);

export default router;
