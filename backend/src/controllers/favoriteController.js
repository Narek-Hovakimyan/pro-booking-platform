import Favorite from "../models/Favorite.js";
import SalonFavorite from "../models/SalonFavorite.js";
import User from "../models/User.js";
import { getSalonReviewStats } from "./salonReviewController.js";
import { getPaidAccessByBarberIds } from "../services/subscriptionService.js";
import { sendControllerError } from "../utils/controllerError.js";

const userFields = "name phone role city salonName imageUrl profession barberType specialty";
const salonFields = "name city address phone imageUrl";

const requireClient = (req, res) => {
  if (req.user?.role !== "client") {
    res.status(403).json({ message: "Only clients can manage favorites" });
    return false;
  }

  return true;
};

export const getClientFavorites = async (req, res) => {
  try {
    if (!requireClient(req, res)) return undefined;

    const clientId = req.user.id;

    const favorites = await Favorite.find({ clientId })
      .populate("barberId", userFields)
      .sort({ createdAt: -1 });

    // Phase 11: Hide unpaid/expired barbers from favorites response.
    // Favorite records remain in DB so they reappear when the barber renews.
    const barberIds = favorites
      .map((favorite) => favorite.barberId?._id || favorite.barberId)
      .map((barberId) => String(barberId))
      .filter(Boolean);

    if (barberIds.length === 0) {
      return res.json(favorites);
    }

    const paidAccessMap = await getPaidAccessByBarberIds(barberIds);

    const visibleFavorites = favorites.filter((favorite) => {
      const barberId = favorite.barberId?._id || favorite.barberId;
      return paidAccessMap.get(String(barberId)) === true;
    });

    return res.json(visibleFavorites);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch favorites");
  }
};

export const addFavorite = async (req, res) => {
  try {
    if (!requireClient(req, res)) return undefined;

    const { barberId } = req.body;

    if (!barberId) {
      return res.status(400).json({ message: "barberId is required" });
    }

    const favorite = await Favorite.findOneAndUpdate(
      { clientId: req.user.id, barberId },
      { clientId: req.user.id, barberId },
      { returnDocument: "after", runValidators: true, upsert: true }
    ).populate("barberId", userFields);
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { favoriteBarbers: barberId },
    });

    return res.status(201).json(favorite);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not add favorite",
    });
  }
};

export const removeFavorite = async (req, res) => {
  try {
    if (!requireClient(req, res)) return undefined;

    await Favorite.findOneAndDelete({
      clientId: req.user.id,
      barberId: req.params.barberId,
    });
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { favoriteBarbers: req.params.barberId },
    });

    return res.json({ barberId: req.params.barberId });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not remove favorite",
    });
  }
};

export const getFavoriteBarbers = getClientFavorites;

export const addFavoriteBarber = async (req, res) => {
  req.body.barberId = req.params.barberId;
  return addFavorite(req, res);
};

export const removeFavoriteBarber = removeFavorite;

export const getFavoriteSalons = async (req, res) => {
  try {
    if (!requireClient(req, res)) return undefined;

    const favorites = await SalonFavorite.find({ clientId: req.user.id })
      .populate("salonId", salonFields)
      .sort({ createdAt: -1 });
    const salonIds = favorites
      .map((favorite) => favorite.salonId?._id || favorite.salonId)
      .filter(Boolean);
    const [barbers, reviewStatsBySalonId] = await Promise.all([
      User.find({
        role: "barber",
        salon: { $in: salonIds },
        salonStatus: "approved",
      }).select("name phone role city avatarUrl salon salonStatus"),
      getSalonReviewStats(salonIds),
    ]);
    const barbersBySalonId = new Map();

    barbers.forEach((barber) => {
      const key = String(barber.salon);
      barbersBySalonId.set(key, [...(barbersBySalonId.get(key) || []), barber]);
    });

    return res.json(
      favorites.map((favorite) => {
        const favoriteObject = favorite.toObject();
        const salon = favoriteObject.salonId;
        const salonId = salon?._id || salon;
        const reviewStats = reviewStatsBySalonId.get(String(salonId));

        return {
          ...favoriteObject,
          salonId: salon
            ? {
                ...salon,
                id: salon._id,
                averageRating: reviewStats?.averageRating || 0,
                totalReviews: reviewStats?.totalReviews || 0,
                reviewsCount: reviewStats?.reviewsCount || 0,
                barbers: barbersBySalonId.get(String(salonId)) || [],
              }
            : salon,
        };
      })
    );
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch favorite salons");
  }
};

export const addFavoriteSalon = async (req, res) => {
  try {
    if (!requireClient(req, res)) return undefined;

    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({ message: "salonId is required" });
    }

    const favorite = await SalonFavorite.findOneAndUpdate(
      { clientId: req.user.id, salonId },
      { clientId: req.user.id, salonId },
      { returnDocument: "after", runValidators: true, upsert: true }
    ).populate("salonId", salonFields);
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { favoriteSalons: salonId },
    });

    return res.status(201).json(favorite);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not add favorite salon",
    });
  }
};

export const removeFavoriteSalon = async (req, res) => {
  try {
    if (!requireClient(req, res)) return undefined;

    await SalonFavorite.findOneAndDelete({
      clientId: req.user.id,
      salonId: req.params.salonId,
    });
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { favoriteSalons: req.params.salonId },
    });

    return res.json({ salonId: req.params.salonId });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not remove favorite salon",
    });
  }
};
