import BarberProfile from "../models/BarberProfile.js";
import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import Schedule from "../models/Schedule.js";
import User from "../models/User.js";
import { sanitizeMediaUrl } from "../utils/mediaUrl.js";
import {
  findManageableSalonsForUser,
} from "../services/salon/salonMembershipService.js";
import { getSalonStatusForBarber } from "../services/salon/salonStatusService.js";
import { getSalonReviewStats } from "./salonReviewController.js";
import {
  buildPublicSalonResponse,
  serializeSalon,
  serializeUser,
} from "../utils/salonUtils.js";
import { normalizeSalonDefaultSchedule } from "../utils/salonScheduleUtils.js";
import {
  requireBarber,
  openCurrentWorkHistory,
} from "../utils/salonHelpers.js";
import { sendControllerError } from "../utils/controllerError.js";

/**
 * Get the primary approved salon for a barber.
 * Uses the new salons array, falls back to legacy fields.
 * NOTE: Currently unused — kept for potential future use.
 */
const getPrimaryApprovedSalon = async (user) => {
  if (!user) return null;

  // Try new salons array first
  if (Array.isArray(user.salons) && user.salons.length > 0) {
    const approved = user.salons.filter((s) => s.status === "approved");
    const primary = approved.find((s) => s.isPrimary) || approved[0];

    if (primary?.salon) {
      return Salon.findById(primary.salon);
    }
  }

  // Fallback to legacy fields
  if (user?.salonStatus === "approved" && user?.salon) {
    return Salon.findById(user.salon);
  }

  return null;
};

/**
 * Get all approved salons for a barber.
 * NOTE: Currently unused — kept for potential future use.
 */
const getApprovedSalons = async (user) => {
  if (!user) return [];

  if (Array.isArray(user.salons) && user.salons.length > 0) {
    const approvedEntries = user.salons.filter((s) => s.status === "approved");
    const salonIds = approvedEntries.map((s) => s.salon);
    const salons = await Salon.find({ _id: { $in: salonIds } });

    return salons;
  }

  // Fallback to legacy
  if (user?.salonStatus === "approved" && user?.salon) {
    const salon = await Salon.findById(user.salon);
    return salon ? [salon] : [];
  }

  return [];
};

export const listSalons = async (req, res) => {
  try {
    let query = {};

    // If excludeForBarber is provided, filter out salons the barber is already connected to
    if (req.query.excludeForBarber) {
      const barberId = req.query.excludeForBarber;
      const barber = await User.findById(barberId);

      if (barber) {
        // Get salon IDs from barber's salons array (approved + pending)
        const barberSalonIds = (barber.salons || [])
          .filter((s) => s.status === "approved" || s.status === "pending")
          .map((s) => s.salon?.toString())
          .filter(Boolean);

        // Get salon IDs the barber owns
        const ownedSalonIds = await Salon.find({ ownerId: barberId }).distinct("_id");
        const ownedIds = ownedSalonIds.map((id) => id.toString());

        // Get salon IDs with pending SalonJoinRequest
        const pendingRequestSalonIds = await SalonJoinRequest.find({
          barberId,
          status: "pending",
        }).distinct("salonId");
        const pendingRequestIds = pendingRequestSalonIds.map((id) => id.toString());

        // Combine all excluded IDs
        const excludeIds = [...new Set([...barberSalonIds, ...ownedIds, ...pendingRequestIds])];

        if (excludeIds.length > 0) {
          query._id = { $nin: excludeIds };
        }
      }
    }

    // Optional search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { name: searchRegex },
        { city: searchRegex },
      ];
    }

    const salons = await Salon.find(query).sort({ name: 1 });
    const salonIds = salons.map((salon) => salon._id);

    // Find barbers using the new salons array OR legacy fields
    const barbers = await User.find({
      role: "barber",
      $or: [
        { "salons.status": "approved" },
        { salonStatus: "approved", salon: { $in: salonIds } },
      ],
    }).select("-password");

    const profiles = await BarberProfile.find({
      barberId: { $in: barbers.map((barber) => barber._id) },
    });

    const [reviewStatsBySalonId] = await Promise.all([
      getSalonReviewStats(salonIds),
    ]);

    const barbersBySalonId = new Map();

    salons.forEach((salon) => {
      barbersBySalonId.set(String(salon._id), []);
    });

    barbers.forEach((barber) => {
      // Check new salons array first
      if (Array.isArray(barber.salons) && barber.salons.length > 0) {
        const approvedEntries = barber.salons.filter((s) => s.status === "approved");
        approvedEntries.forEach((entry) => {
          const salonId = String(entry.salon);
          const salonBarbers = barbersBySalonId.get(salonId) || [];
          salonBarbers.push(barber);
          barbersBySalonId.set(salonId, salonBarbers);
        });
      } else if (barber.salonStatus === "approved" && barber.salon) {
        // Fallback to legacy
        const salonBarbers = barbersBySalonId.get(String(barber.salon)) || [];
        salonBarbers.push(barber);
        barbersBySalonId.set(String(barber.salon), salonBarbers);
      }
    });

    return res.json(
      salons.map((salon) => {
        return buildPublicSalonResponse({
          salon,
          reviewStats: reviewStatsBySalonId.get(String(salon._id)),
          barbers: barbersBySalonId.get(String(salon._id)) || [],
          profiles,
        });
      })
    );
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch salons");
  }
};

export const listManageableSalons = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const salons = await findManageableSalonsForUser(req.user._id);

    return res.json(salons.map((salon) => serializeSalon(salon)));
  } catch (error) {
    return sendControllerError(res, error, "Could not load manageable salons");
  }
};

export const getSalonProfile = async (req, res) => {
  try {
    const salon = await Salon.findById(req.params.salonId);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    // Find barbers using new salons array OR legacy fields
    const barbers = await User.find({
      role: "barber",
      $or: [
        { "salons.salon": salon._id, "salons.status": "approved" },
        { salon: salon._id, salonStatus: "approved" },
      ],
    }).select("-password");

    const profiles = await BarberProfile.find({
      barberId: { $in: barbers.map((barber) => barber._id) },
    });

    const [reviewStatsBySalonId] = await Promise.all([
      getSalonReviewStats(salon._id, { latestLimit: 5 }),
    ]);

    return res.json(
      buildPublicSalonResponse({
        salon,
        reviewStats: reviewStatsBySalonId.get(String(salon._id)),
        barbers,
        profiles,
      })
    );
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch salon");
  }
};

export const getMySalonStatus = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const status = await getSalonStatusForBarber(req.user._id);

    return res.json(status);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch salon status");
  }
};

export const createSalon = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    // Check if barber already owns a salon (not just works in one)
    const ownedSalon = await Salon.findOne({ ownerId: req.user._id });
    if (ownedSalon) {
      return res.status(400).json({
        message: "You already own a salon. You cannot create another one.",
      });
    }

    const { name, city = "", address = "", phone = "", imageUrl = "" } = req.body;
    const safeImageUrl = sanitizeMediaUrl(imageUrl);


    if (!name?.trim()) {
      return res.status(400).json({ message: "Salon name is required" });
    }

    const salon = await Salon.create({
      name: name.trim(),
      city,
      address,
      phone,
      imageUrl: safeImageUrl,
      ownerId: req.user._id,

      admins: [],
    });

    const user = await User.findById(req.user._id);

    // Update new salons array
    user.salons = user.salons || [];
    user.salons.push({
      salon: salon._id,
      status: "approved",
      joinedAt: new Date(),
      isPrimary: true,
    });

    // Update legacy fields
    user.salon = salon._id;
    user.salonStatus = "approved";
    openCurrentWorkHistory(user, salon);
    await user.save();

    return res.status(201).json({
      salon: serializeSalon(salon),
      user: serializeUser(user),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not create salon",
    });
  }
};

export const updateSalonDefaultSchedule = async (req, res) => {

  try {
    const { salonId } = req.params;
    const barberId = req.user._id;
    const defaultSchedule = normalizeSalonDefaultSchedule(req.body);

    // 1. Save to barber.salons[X].defaultSchedule
    const barber = await User.findOneAndUpdate(
      { _id: barberId, "salons.salon": salonId },
      {
        $set: {
          "salons.$.defaultSchedule": defaultSchedule,
        },
      },
      { returnDocument: "after" }
    );

    if (!barber) {
      return res.status(404).json({ message: "Barber not found in this salon" });
    }

    // 2. Also update/create the Schedule model so the Schedule page reads the same data
    await Schedule.findOneAndUpdate(
      { barberId, salonId },
      {
        barberId,
        salonId,
        defaultSchedule,
      },
      { returnDocument: "after", runValidators: true, upsert: true }
    );

    const salonEntry = barber.salons.find((s) => s.salon?.toString() === salonId);

    return res.json({
      message: "Default schedule updated",
      defaultSchedule: salonEntry?.defaultSchedule || defaultSchedule,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update default schedule",
    });
  }
};
