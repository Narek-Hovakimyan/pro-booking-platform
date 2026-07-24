import express from "express";
import {
  getBarbers,
  getMyProfile,
  sendEmailVerificationController,
  updateMyProfile,
  verifyEmailController,
} from "../../controllers/users/userController.js";
import { protect } from "../../middleware/authMiddleware.js";
import {
  accountMutationLimiter,
  emailVerificationLimiter,
  securityMutationLimiter,
  uploadLimiter,
} from "../../middleware/rateLimitMiddleware.js";
import { handleAvatarUpload } from "../../middleware/uploadMiddleware.js";

const router = express.Router();

router.get("/me", protect, getMyProfile);
router.put("/me", protect, accountMutationLimiter, uploadLimiter, handleAvatarUpload, updateMyProfile);
router.post("/me/email/verification", protect, securityMutationLimiter, sendEmailVerificationController);
router.get("/me/email/verify", emailVerificationLimiter, verifyEmailController);
router.get("/barbers", getBarbers);

export default router;
