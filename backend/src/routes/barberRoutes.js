import express from "express";
import {
  barberProfileController,
  getBarberCardSummary,
  getProfileByBarberId,
  upsertProfileByBarberId,
} from "../controllers/barbers/barberProfileController.js";
import {
  getMyLoyaltyDiscountSettings,
  getMyBarberClients,
  updateMyLoyaltyDiscountSettings,
  updateMyBarberClientLoyalty,
} from "../controllers/barbers/barberClientController.js";
import {
  getCertifications,
  getEventCertificates,
  addCertification,
  updateCertification,
  deleteCertification,
} from "../controllers/barbers/certificationController.js";
import {
  getMyDepositSettings,
  updateMyDepositSettings,
} from "../controllers/bookings/depositSettingsController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadLimiter } from "../middleware/rateLimitMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";
import {
  handleAvatarUpload,
  handleCertificationImageUpload,
} from "../middleware/uploadMiddleware.js";
import { updateSalonDefaultSchedule } from "../controllers/salons/salonController.js";

const router = express.Router();

const requireBarberRole = (req, res, next) => {
  if (req.user?.role !== "barber") {
    return res.status(403).json({
      code: "BARBER_ROLE_REQUIRED",
      message: "Only barbers can access this resource",
    });
  }
  return next();
};

const genericBarberProfileMutationTombstone = (_req, res) =>
  res.status(410).json({
    code: "BARBER_PROFILE_GENERIC_WRITE_DEPRECATED",
    message: "This BarberProfile mutation endpoint is no longer supported",
  });

router.get("/", barberProfileController.getAll);
router.get("/card-summary", getBarberCardSummary);
router.get("/me/clients", protect, requireBarberSubscription, getMyBarberClients);
router.get(
  "/me/loyalty-discount-settings",
  protect,
  requireBarberSubscription,
  getMyLoyaltyDiscountSettings
);
router.patch(
  "/me/loyalty-discount-settings",
  protect,
  requireBarberSubscription,
  updateMyLoyaltyDiscountSettings
);
router.patch(
  "/me/clients/:clientId/loyalty",
  protect,
  requireBarberSubscription,
  updateMyBarberClientLoyalty
);
router.get("/profile/:barberId", getProfileByBarberId);
router.put(
  "/profile/:barberId",
  protect,
  requireBarberRole,
  uploadLimiter,
  handleAvatarUpload,
  upsertProfileByBarberId
);
router.get("/:id", barberProfileController.getById);
router.post("/", protect, genericBarberProfileMutationTombstone);
router.put("/:id", protect, genericBarberProfileMutationTombstone);
router.delete("/:id", protect, genericBarberProfileMutationTombstone);

// Certification routes
router.get("/:barberId/certifications", getCertifications);
router.get("/:barberId/event-certificates", getEventCertificates);
router.post(
  "/certifications",
  protect,
  requireBarberSubscription,
  uploadLimiter,
  handleCertificationImageUpload,
  addCertification
);
router.put(
  "/certifications/:certId",
  protect,
  requireBarberSubscription,
  uploadLimiter,
  handleCertificationImageUpload,
  updateCertification
);
router.delete("/certifications/:certId", protect, requireBarberSubscription, deleteCertification);

// Deposit settings
router.get("/me/deposit-settings", protect, requireBarberRole, getMyDepositSettings);
router.patch("/me/deposit-settings", protect, requireBarberRole, updateMyDepositSettings);

// Per-salon default schedule
router.patch("/salons/:salonId/default-schedule", protect, updateSalonDefaultSchedule);

export default router;
