import express from "express";
import {
  getBarbers,
  getMyProfile,
  sendEmailVerificationController,
  updateMyProfile,
  verifyEmailController,
} from "../../controllers/users/userController.js";
import { deleteMyAccount } from "../../controllers/users/accountDeletionController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { requireAuthCookieRequestSecurity } from "../../middleware/authCsrfMiddleware.js";
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
router.delete(
  "/me",
  protect,
  securityMutationLimiter,
  requireAuthCookieRequestSecurity,
  deleteMyAccount
);
router.post("/me/email/verification", protect, securityMutationLimiter, sendEmailVerificationController);
router.get("/me/email/verify", emailVerificationLimiter, verifyEmailController);
router.get("/barbers", getBarbers);

export default router;
