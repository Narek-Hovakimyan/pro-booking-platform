import express from "express";
import {
  getBarbers,
  getMyProfile,
  sendEmailVerificationController,
  updateMyProfile,
  verifyEmailController,
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import { handleAvatarUpload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.get("/me", protect, getMyProfile);
router.put("/me", protect, handleAvatarUpload, updateMyProfile);
router.post("/me/email/verification", protect, sendEmailVerificationController);
router.get("/me/email/verify", verifyEmailController);
router.get("/barbers", getBarbers);

export default router;
