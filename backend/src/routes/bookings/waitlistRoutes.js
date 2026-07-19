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
import { requireBarberSubscription } from "../../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.post("/", protect, createEntry);
router.get("/me", protect, getMyEntries);
router.get("/barber/:barberId", protect, getBarberEntries);
router.patch("/:id/cancel", protect, cancelEntry);
router.patch("/:id/notify", protect, markNotified);
router.patch("/:id/approve", protect, requireBarberSubscription, approveEntry);
router.patch("/:id/reject", protect, requireBarberSubscription, rejectEntry);
router.patch("/:id/offer", protect, requireBarberSubscription, offerEntry);
router.patch("/:id/accept-offer", protect, acceptOfferEntry);
router.patch("/:id/decline-offer", protect, declineOfferEntry);

export default router;
