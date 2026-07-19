import express from "express";
import {
  addFavoriteBarber,
  addFavorite,
  addFavoriteSalon,
  getFavoriteBarbers,
  getFavoriteSalons,
  getClientFavorites,
  removeFavoriteBarber,
  removeFavorite,
  removeFavoriteSalon,
} from "../controllers/engagement/favoriteController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/barbers", protect, getFavoriteBarbers);
router.post("/barbers/:barberId", protect, addFavoriteBarber);
router.delete("/barbers/:barberId", protect, removeFavoriteBarber);
router.get("/salons", protect, getFavoriteSalons);
router.post("/salons/:salonId", protect, addFavoriteSalon);
router.delete("/salons/:salonId", protect, removeFavoriteSalon);
router.get("/", protect, getClientFavorites);
router.post("/", protect, addFavorite);
router.delete("/:barberId", protect, removeFavorite);

export default router;
