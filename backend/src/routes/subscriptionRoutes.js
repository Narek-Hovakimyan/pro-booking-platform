import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMySubscription,
  getDefaultPlan,
  devGrantSubscription,
} from "../controllers/subscriptionController.js";

const router = express.Router();

// GET /api/subscriptions/plan/default — must be before /me
router.get("/plan/default", getDefaultPlan);

// GET /api/subscriptions/me
router.get("/me", protect, getMySubscription);

// POST /api/subscriptions/dev/grant
router.post("/dev/grant", protect, devGrantSubscription);

export default router;
