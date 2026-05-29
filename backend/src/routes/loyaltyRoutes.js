import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMyPrograms,
  createProgram,
  updateProgram,
  deactivateProgram,
  getMyProgress,
} from "../controllers/loyaltyController.js";

const router = Router();

// Barber: manage programs
router.get("/programs/me", protect, getMyPrograms);
router.post("/programs", protect, createProgram);
router.put("/programs/:id", protect, updateProgram);
router.delete("/programs/:id", protect, deactivateProgram);

// Client: get my progress
router.get("/progress/me", protect, getMyProgress);

export default router;
