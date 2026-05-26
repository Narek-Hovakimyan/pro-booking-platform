import express from "express";
import {
  createBooking,
  delayBooking,
  getReferenceImage,
  updateBooking,
  updateTreatmentRecord,
} from "../controllers/bookingController.js";
import { handleReferenceImageUpload } from "../middleware/uploadMiddleware.js";
import {
  acceptRescheduleRequest,
  createRescheduleRequest,
  rejectRescheduleRequest,
} from "../controllers/bookingRescheduleController.js";
import {
  getBarberBookings,
  getClientBookings,
} from "../controllers/bookingReadController.js";
import {
  markLateCancel,
  markNoShow,
} from "../controllers/bookingOutcomeController.js";
import {
  debugBookingAvailability,
  getBarberMonthlyIncome,
  getClientReliability,
} from "../controllers/bookingAnalyticsController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/client/:clientId", protect, getClientBookings);
router.get("/client/:clientId/reliability", protect, getClientReliability);
router.get("/barber/:barberId/income", protect, getBarberMonthlyIncome);
router.get("/barber/:barberId", protect, getBarberBookings);
router.post("/availability-debug", protect, debugBookingAvailability);
router.post("/", protect, handleReferenceImageUpload, createBooking);
router.post("/:id/reschedule-request", protect, createRescheduleRequest);
router.patch("/:id/reschedule-request/accept", protect, acceptRescheduleRequest);
router.patch("/:id/reschedule-request/reject", protect, rejectRescheduleRequest);
router.put("/:id", protect, updateBooking);
router.patch("/:id/delay", protect, delayBooking);
router.get("/:bookingId/reference-images/:imageName", protect, getReferenceImage);
router.patch("/:id/no-show", protect, markNoShow);
router.patch("/:id/late-cancel", protect, markLateCancel);
router.put("/:id/treatment-record", protect, updateTreatmentRecord);

export default router;
