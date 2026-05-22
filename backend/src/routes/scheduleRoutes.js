import express from "express";
import {
  getScheduleByBarber,
  getScheduleByBarberAndSalon,
  upsertSchedule,
  upsertScheduleByBarberAndSalon,
} from "../controllers/scheduleController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Legacy route: get schedule by barber only (kept for backward compatibility)
router.get("/:barberId", getScheduleByBarber);

// Per-salon route: get schedule by barber + salon
router.get("/:barberId/:salonId", getScheduleByBarberAndSalon);

// Legacy route: upsert schedule (kept for backward compatibility)
router.put("/", protect, upsertSchedule);

// Per-salon route: upsert schedule by barber + salon
router.put("/:barberId/:salonId", protect, upsertScheduleByBarberAndSalon);

export default router;
