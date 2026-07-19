import express from "express";
import {
  getEvents,
  getMyEvents,
  getEventById,
  createEvent,
  updateEvent,
  cancelEvent,
  checkInRegistration,
  updateAttendance,
  issueCertificates,
} from "../../controllers/events/eventController.js";
import {
  registerForEvent,
  cancelRegistration,
  getMyRegistrations,
  getEventRegistrations,
  approveRegistration,
  rejectRegistration,
  waitlistRegistration,
} from "../../controllers/events/eventRegistrationController.js";
import { issueEventRegistrationCertificate, issueEventRegistrationCertificateUpload } from "../../controllers/events/certificateController.js";
import {
  createEventReview,
  getEventReviews,
} from "../../controllers/events/eventReviewController.js";
import { optionalAuth, protect } from "../../middleware/authMiddleware.js";
import { publicBookingLimiter, uploadLimiter } from "../../middleware/rateLimitMiddleware.js";
import { handleEventImageUpload, handleCertificateFileUpload } from "../../middleware/uploadMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", getEvents);
router.get("/mine", protect, getMyEvents);
router.get("/my-registrations", protect, getMyRegistrations);
router.get("/:id/reviews", getEventReviews);
router.get("/:id", optionalAuth, getEventById);

// Protected routes
router.post("/", protect, uploadLimiter, handleEventImageUpload, createEvent);
router.put("/:id", protect, uploadLimiter, handleEventImageUpload, updateEvent);
router.delete("/:id", protect, cancelEvent);

// Registration routes
router.post("/:id/register", protect, publicBookingLimiter, registerForEvent);
router.delete("/:id/register", protect, cancelRegistration);

// Attendance & certificates (Phase 2)
router.get("/:id/registrations", protect, getEventRegistrations);
router.patch("/:id/registrations/:registrationId/approve", protect, approveRegistration);
router.patch("/:id/registrations/:registrationId/reject", protect, rejectRegistration);
router.patch("/:id/registrations/:registrationId/waitlist", protect, waitlistRegistration);
router.patch("/:id/registrations/:registrationId/check-in", protect, checkInRegistration);
router.post(
  "/:eventId/registrations/:registrationId/certificate",
  protect,
  issueEventRegistrationCertificate
);
router.post(
  "/:eventId/registrations/:registrationId/certificate/upload",
  protect,
  uploadLimiter,
  handleCertificateFileUpload,
  issueEventRegistrationCertificateUpload
);
router.put("/:id/attendance", protect, updateAttendance);
router.post("/:id/issue-certificates", protect, issueCertificates);
router.post("/:id/reviews", protect, createEventReview);

export default router;
