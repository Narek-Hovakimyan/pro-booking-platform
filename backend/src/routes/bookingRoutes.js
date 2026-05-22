import express from "express";
import {
  acceptRescheduleRequest,
  createBooking,
  createRescheduleRequest,
  debugBookingAvailability,
  getBarberBookings,
  getBarberMonthlyIncome,
  getClientBookings,
  getClientReliability,
  delayBooking,
  markLateCancel,
  markNoShow,
  rejectRescheduleRequest,
  updateBooking,
} from "../controllers/bookingController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/client/:clientId", protect, getClientBookings);
router.get("/client/:clientId/reliability", protect, getClientReliability);
router.get("/barber/:barberId/income", protect, getBarberMonthlyIncome);
router.get("/barber/:barberId", protect, getBarberBookings);
router.post("/availability-debug", protect, debugBookingAvailability);
router.post("/", protect, createBooking);
router.post("/:id/reschedule-request", protect, createRescheduleRequest);
router.patch("/:id/reschedule-request/accept", protect, acceptRescheduleRequest);
router.patch("/:id/reschedule-request/reject", protect, rejectRescheduleRequest);
router.put("/:id", protect, updateBooking);
router.patch("/:id/delay", protect, delayBooking);
router.patch("/:id/no-show", protect, markNoShow);
router.patch("/:id/late-cancel", protect, markLateCancel);

export default router;
