import express from "express";
import {
  createService,
  deleteService,
  getServicesByBarber,
  updateService,
} from "../controllers/serviceController.js";
import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";

const router = express.Router();

router.get("/:barberId", optionalAuth, getServicesByBarber);
router.post("/", protect, requireBarberSubscription, createService);
router.put("/:id", protect, requireBarberSubscription, updateService);
router.delete("/:id", protect, requireBarberSubscription, deleteService);

export default router;
