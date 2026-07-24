import express from "express";
import {
  createEntry,
  getMyEntries,
  getBarberEntries,
  cancelEntry,
  markNotified,
  approveEntry,
  rejectEntry,
  offerEntry,
  acceptOfferEntry,
  declineOfferEntry,
} from "../../controllers/bookings/waitlistController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { waitlistActionLimiter } from "../../middleware/rateLimitMiddleware.js";
import { requireBarberSubscription } from "../../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.post("/", protect, waitlistActionLimiter, createEntry);
router.get("/me", protect, getMyEntries);
router.get("/barber/:barberId", protect, getBarberEntries);
router.patch("/:id/cancel", protect, waitlistActionLimiter, cancelEntry);
router.patch("/:id/notify", protect, waitlistActionLimiter, markNotified);
router.patch("/:id/approve", protect, requireBarberSubscription, waitlistActionLimiter, approveEntry);
router.patch("/:id/reject", protect, requireBarberSubscription, waitlistActionLimiter, rejectEntry);
router.patch("/:id/offer", protect, requireBarberSubscription, waitlistActionLimiter, offerEntry);
router.patch("/:id/accept-offer", protect, waitlistActionLimiter, acceptOfferEntry);
router.patch("/:id/decline-offer", protect, waitlistActionLimiter, declineOfferEntry);

export default router;
