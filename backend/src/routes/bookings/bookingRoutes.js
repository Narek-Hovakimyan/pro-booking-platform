import express from "express";
import {
  createBooking,
  delayBooking,
  getReferenceImage,
  quoteBookingPrice,
  updateBooking,
  updateTreatmentRecord,
} from "../../controllers/bookings/bookingController.js";
import { handleReferenceImageUpload } from "../../middleware/uploadMiddleware.js";
import {
  acceptRescheduleRequest,
  createRescheduleRequest,
  rejectRescheduleRequest,
} from "../../controllers/bookings/bookingRescheduleController.js";
import {
  getBarberBookings,
  getClientBookings,
} from "../../controllers/bookings/bookingReadController.js";
import {
  markLateCancel,
  markNoShow,
} from "../../controllers/bookings/bookingOutcomeController.js";
import {
  debugBookingAvailability,
  getBarberMonthlyIncome,
  getClientReliability,
} from "../../controllers/bookings/bookingAnalyticsController.js";
import { optionalAuth, protect } from "../../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../../middleware/subscriptionMiddleware.js";
import {
  publicBookingLimiter,
  uploadLimiter,
} from "../../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.get("/client/:clientId", protect, getClientBookings);
router.get("/client/:clientId/reliability", protect, getClientReliability);
router.get("/barber/:barberId/income", protect, requireBarberSubscription, getBarberMonthlyIncome);
router.get("/barber/:barberId", optionalAuth, getBarberBookings);
router.post("/availability-debug", protect, debugBookingAvailability);
router.post("/quote", protect, publicBookingLimiter, quoteBookingPrice);
router.post("/", protect, publicBookingLimiter, uploadLimiter, handleReferenceImageUpload, createBooking);
router.post("/:id/reschedule-request", protect, createRescheduleRequest);
router.patch("/:id/reschedule-request/accept", protect, acceptRescheduleRequest);
router.patch("/:id/reschedule-request/reject", protect, rejectRescheduleRequest);
router.put("/:id", protect, requireBarberSubscription, updateBooking);
router.patch("/:id/delay", protect, requireBarberSubscription, delayBooking);
router.get("/:bookingId/reference-images/:imageName", protect, getReferenceImage);
router.patch("/:id/no-show", protect, requireBarberSubscription, markNoShow);
router.patch("/:id/late-cancel", protect, requireBarberSubscription, markLateCancel);
router.put("/:id/treatment-record", protect, requireBarberSubscription, uploadLimiter, updateTreatmentRecord);

export default router;
