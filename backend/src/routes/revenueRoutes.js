import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";
import { getMyRevenue } from "../controllers/billing/revenueController.js";

const router = Router();

router.get("/me", protect, requireBarberSubscription, getMyRevenue);

export default router;
