import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createVoucher,
  deleteVoucher,
  getOwnerVouchers,
  getVoucherById,
  updateVoucher,
  validateVoucherCode,
} from "../controllers/voucherController.js";

const router = express.Router();

// POST /api/vouchers/validate — must be before /:id
router.post("/validate", protect, validateVoucherCode);

router.post("/", protect, createVoucher);
router.get("/owner/:ownerType/:ownerId", protect, getOwnerVouchers);
router.get("/:id", protect, getVoucherById);
router.put("/:id", protect, updateVoucher);
router.delete("/:id", protect, deleteVoucher);

export default router;
