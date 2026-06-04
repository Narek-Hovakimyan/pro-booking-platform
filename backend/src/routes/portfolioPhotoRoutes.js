import express from "express";
import {
  getPortfolioByBarber,
  getMyPortfolio,
  addPortfolioPhoto,
  updatePortfolioPhoto,
  deletePortfolioPhoto,
} from "../controllers/portfolioPhotoController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireBarberSubscription } from "../middleware/subscriptionMiddleware.js";
import { handlePortfolioImageUpload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// Public
router.get("/barber/:barberId", getPortfolioByBarber);

// Protected
router.get("/me", protect, getMyPortfolio);
router.post("/", protect, requireBarberSubscription, handlePortfolioImageUpload, addPortfolioPhoto);
router.put("/:id", protect, requireBarberSubscription, updatePortfolioPhoto);
router.delete("/:id", protect, requireBarberSubscription, deletePortfolioPhoto);

export default router;
