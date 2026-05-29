import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getMyRevenue } from "../controllers/revenueController.js";

const router = Router();

router.get("/me", protect, getMyRevenue);

export default router;
