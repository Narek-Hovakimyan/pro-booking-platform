import express from "express";
import {
  getScheduleByBarber,
  getScheduleByBarberAndSalon,
  upsertSchedule,
  upsertScheduleByBarberAndSalon,
} from "../controllers/schedules/scheduleController.js";
import {
  getPersonalScheduleByBarber,
  upsertPersonalScheduleByBarber,
} from "../controllers/schedules/personalScheduleController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

// Personal onboarding schedule routes must precede the dynamic salon route.
router.get("/:barberId/personal", protect, getPersonalScheduleByBarber);
router.put("/:barberId/personal", protect, upsertPersonalScheduleByBarber);

// Legacy route: get schedule by barber only (kept for backward compatibility)
router.get("/:barberId", getScheduleByBarber);

// Per-salon route: get schedule by barber + salon
router.get("/:barberId/:salonId", getScheduleByBarberAndSalon);

// Legacy route: upsert schedule (kept for backward compatibility)
router.put("/", protect, requireBarberSubscription, upsertSchedule);

// Per-salon route: upsert schedule by barber + salon
router.put("/:barberId/:salonId", protect, requireBarberSubscription, upsertScheduleByBarberAndSalon);

export default router;
