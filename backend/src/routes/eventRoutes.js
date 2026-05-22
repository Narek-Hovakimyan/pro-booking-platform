import express from "express";
import {
  getEvents,
  getMyEvents,
  getEventById,
  createEvent,
  updateEvent,
  cancelEvent,
  registerForEvent,
  cancelRegistration,
  getMyRegistrations,
  getEventRegistrations,
  approveRegistration,
  rejectRegistration,
  waitlistRegistration,
  checkInRegistration,
  updateAttendance,
  issueCertificates,
} from "../controllers/eventController.js";
import { issueEventRegistrationCertificate, issueEventRegistrationCertificateUpload } from "../controllers/certificateController.js";
import {
  createEventReview,
  getEventReviews,
} from "../controllers/eventReviewController.js";
import { protect } from "../middleware/authMiddleware.js";
import { handleEventImageUpload, handleCertificateFileUpload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", getEvents);
router.get("/mine", protect, getMyEvents);
router.get("/my-registrations", protect, getMyRegistrations);
router.get("/:id/reviews", getEventReviews);
router.get("/:id", getEventById);

// Protected routes
router.post("/", protect, handleEventImageUpload, createEvent);
router.put("/:id", protect, handleEventImageUpload, updateEvent);
router.delete("/:id", protect, cancelEvent);

// Registration routes
router.post("/:id/register", protect, registerForEvent);
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
  handleCertificateFileUpload,
  issueEventRegistrationCertificateUpload
);
router.put("/:id/attendance", protect, updateAttendance);
router.post("/:id/issue-certificates", protect, issueCertificates);
router.post("/:id/reviews", protect, createEventReview);

export default router;
