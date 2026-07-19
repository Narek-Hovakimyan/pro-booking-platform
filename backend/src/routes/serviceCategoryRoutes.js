import express from "express";
import {
  listServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
} from "../controllers/services/serviceCategoryController.js";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", optionalAuth, listServiceCategories);
router.post("/", protect, createServiceCategory);
router.put("/:id", protect, updateServiceCategory);
router.delete("/:id", protect, deleteServiceCategory);

export default router;
