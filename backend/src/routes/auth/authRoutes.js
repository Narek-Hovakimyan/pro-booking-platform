import express from "express";
import { loginUser, registerUser, forgotPassword, resetPassword, googleAuth } from "../../controllers/auth/authController.js";
import {
  logoutAllAuthSessions,
  logoutAuthSession,
  refreshAuthSession,
} from "../../controllers/auth/authSessionController.js";
import { requireAuthCookieRequestSecurity } from "../../middleware/authCsrfMiddleware.js";
import { protect } from "../../middleware/authMiddleware.js";
import {
  authLimiter,
  securityMutationLimiter,
} from "../../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/register", authLimiter, requireAuthCookieRequestSecurity, registerUser);
router.post("/login", authLimiter, requireAuthCookieRequestSecurity, loginUser);
router.post("/google", authLimiter, requireAuthCookieRequestSecurity, googleAuth);

router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/refresh", authLimiter, requireAuthCookieRequestSecurity, refreshAuthSession);
router.post("/logout", authLimiter, requireAuthCookieRequestSecurity, logoutAuthSession);
router.post(
  "/logout-all",
  protect,
  securityMutationLimiter,
  requireAuthCookieRequestSecurity,
  logoutAllAuthSessions
);

export default router;
