import express from "express";
import {
  getMyBarberOnboarding,
  updateMyBarberOnboardingWorkplace,
  finalizeMyBarberOnboarding,
} from "../../controllers/barbers/barberOnboardingController.js";
import { protect } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", protect, getMyBarberOnboarding);
router.patch("/me", protect, updateMyBarberOnboardingWorkplace);
router.post("/me/finalize", protect, finalizeMyBarberOnboarding);

export default router;
