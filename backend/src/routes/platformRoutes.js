import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requirePlatformAdmin } from "../middleware/platformMiddleware.js";

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

export default router;
