import express from "express";
import {
  createSalonReview,
  getSalonReviews,
  getSalonReviewsLegacy,
  checkSalonReview,
  addReplyToSalonReview,
  deleteReplyFromSalonReview,
} from "../../controllers/salons/salonReviewController.js";
import { protect } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/check/:bookingId", protect, checkSalonReview);
router.get("/salon/:salonId", getSalonReviews);
router.get("/:salonId", getSalonReviewsLegacy);
router.post("/", protect, createSalonReview);
router.put("/:reviewId/reply", protect, addReplyToSalonReview);
router.delete("/:reviewId/reply", protect, deleteReplyFromSalonReview);

export default router;
