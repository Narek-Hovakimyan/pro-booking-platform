import express from "express";
import {
  barberProfileController,
  getBarberCardSummary,
  getProfileByBarberId,
  upsertProfileByBarberId,
} from "../controllers/barberProfileController.js";
import { getMyBarberClients } from "../controllers/barberClientController.js";
import {
  getCertifications,
  getEventCertificates,
  addCertification,
  updateCertification,
  deleteCertification,
} from "../controllers/certificationController.js";
import {
  getMyDepositSettings,
  updateMyDepositSettings,
} from "../controllers/depositSettingsController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";
import {
  handleAvatarUpload,
  handleCertificationImageUpload,
} from "../middleware/uploadMiddleware.js";
import { updateSalonDefaultSchedule } from "../controllers/salonController.js";

const router = express.Router();

const requireBarberRole = (req, res, next) => {
  if (req.user?.role !== "barber") {
    return res.status(403).json({ message: "Only barbers can access this resource" });
  }
  return next();
};

router.get("/", barberProfileController.getAll);
router.get("/card-summary", getBarberCardSummary);
router.get("/me/clients", protect, requireBarberSubscription, getMyBarberClients);
router.get("/profile/:barberId", getProfileByBarberId);
router.put(
  "/profile/:barberId",
  protect,
  handleAvatarUpload,
  upsertProfileByBarberId
);
router.get("/:id", barberProfileController.getById);
router.post("/", protect, barberProfileController.create);
router.put("/:id", protect, barberProfileController.update);
router.delete("/:id", protect, barberProfileController.remove);

// Certification routes
router.get("/:barberId/certifications", getCertifications);
router.get("/:barberId/event-certificates", getEventCertificates);
router.post(
  "/certifications",
  protect,
  requireBarberSubscription,
  handleCertificationImageUpload,
  addCertification
);
router.put(
  "/certifications/:certId",
  protect,
  requireBarberSubscription,
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
