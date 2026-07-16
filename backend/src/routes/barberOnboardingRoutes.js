import express from "express";
import {
  getMyBarberOnboarding,
  updateMyBarberOnboardingWorkplace,
} from "../controllers/barberOnboardingController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", protect, getMyBarberOnboarding);
router.patch("/me", protect, updateMyBarberOnboardingWorkplace);

export default router;
