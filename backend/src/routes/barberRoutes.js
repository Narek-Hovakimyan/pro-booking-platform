import express from "express";
import {
  barberProfileController,
  getBarberCardSummary,
  getProfileByBarberId,
  upsertProfileByBarberId,
} from "../controllers/barberProfileController.js";
import {
  getCertifications,
  getEventCertificates,
  addCertification,
  updateCertification,
  deleteCertification,
} from "../controllers/certificationController.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  handleAvatarUpload,
  handleCertificationImageUpload,
} from "../middleware/uploadMiddleware.js";
import { updateSalonDefaultSchedule } from "../controllers/salonController.js";

const router = express.Router();

router.get("/", barberProfileController.getAll);
router.get("/card-summary", getBarberCardSummary);
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
  handleCertificationImageUpload,
  addCertification
);
router.put(
  "/certifications/:certId",
  protect,
  handleCertificationImageUpload,
  updateCertification
);
router.delete("/certifications/:certId", protect, deleteCertification);

// Per-salon default schedule
router.patch("/salons/:salonId/default-schedule", protect, updateSalonDefaultSchedule);

export default router;
