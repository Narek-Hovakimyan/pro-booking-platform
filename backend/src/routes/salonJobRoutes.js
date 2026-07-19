import express from "express";
import {
  closeSalonJob,
  createSalonJob,
  getSalonJobById,
  listMySalonJobs,
  listSalonJobs,
  updateSalonJob,
} from "../controllers/salons/salonJobController.js";
import {
  applyToSalonJob,
  listJobApplications,
  listManagedSalonJobApplications,
  listMySalonJobApplications,
  updateSalonJobApplicationStatus,
} from "../controllers/salons/salonJobApplicationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public / semi-public job listing (no :id param ambiguity)
router.get("/", listSalonJobs);
router.get("/mine", protect, listMySalonJobs);

// Static application routes (no :id param ambiguity, must be before /:id routes)
router.get("/applications/my-submissions", protect, listMySalonJobApplications);
router.get("/applications/managed", protect, listManagedSalonJobApplications);
router.patch("/applications/:applicationId/status", protect, updateSalonJobApplicationStatus);

// Per-job application routes
router.post("/:id/applications", protect, applyToSalonJob);
router.get("/:id/applications", protect, listJobApplications);

// Existing job CRUD (must be after static /applications routes to avoid param capture)
router.get("/:id", getSalonJobById);
router.post("/", protect, createSalonJob);
router.put("/:id", protect, updateSalonJob);
router.patch("/:id/close", protect, closeSalonJob);

export default router;
