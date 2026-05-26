import express from "express";
import {
  getPortfolioByBarber,
  getMyPortfolio,
  addPortfolioPhoto,
  updatePortfolioPhoto,
  deletePortfolioPhoto,
} from "../controllers/portfolioPhotoController.js";
import { protect } from "../middleware/authMiddleware.js";
import { handlePortfolioImageUpload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// Public
router.get("/barber/:barberId", getPortfolioByBarber);

// Protected
router.get("/me", protect, getMyPortfolio);
router.post("/", protect, handlePortfolioImageUpload, addPortfolioPhoto);
router.put("/:id", protect, updatePortfolioPhoto);
router.delete("/:id", protect, deletePortfolioPhoto);

export default router;
