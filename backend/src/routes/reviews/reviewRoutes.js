import express from "express";
import {
  createReview,
  getReviewsByBarber,
  addReplyToReview,
  deleteReplyFromReview,
} from "../../controllers/reviews/reviewController.js";
import { protect } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/:barberId", getReviewsByBarber);
router.post("/", protect, createReview);
router.put("/:reviewId/reply", protect, addReplyToReview);
router.delete("/:reviewId/reply", protect, deleteReplyFromReview);

export default router;
