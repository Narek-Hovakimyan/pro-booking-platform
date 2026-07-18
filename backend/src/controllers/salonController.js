import BarberProfile from "../models/BarberProfile.js";
import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import Schedule from "../models/Schedule.js";
import User from "../models/User.js";
import { getPublicBarberReadinessByIds } from "../services/barber/publicBarberReadinessService.js";
import { getPaidAccessByBarberIdsForSalon } from "../services/subscriptionService.js";
import { sanitizeMediaUrl } from "../utils/mediaUrl.js";
import {
  findManageableSalonsForUser,
} from "../services/salon/salonMembershipService.js";
import { isBookableSalonSpecialist } from "../services/salon/salonRelationshipService.js";
import { getSalonStatusForBarber } from "../services/salon/salonStatusService.js";
import { getSalonReviewStats } from "./salonReviewController.js";
import {
  buildPublicSalonResponse,
  serializeSalon,
  serializeUser,
} from "../utils/salonUtils.js";
import { normalizeSalonDefaultSchedule } from "../utils/salonScheduleUtils.js";
import {
  markExplicitAllDaysOffWeeklySchedule,
  normalizeAutoClosedWeeklySchedule,
  sanitizeWeeklySchedule,
} from "../utils/scheduleUtils.js";
import {
  requireBarber,
  openCurrentWorkHistory,
} from "../utils/salonHelpers.js";
import { escapeRegex, normalizeSearch, sendControllerError } from "../utils/controllerError.js";

// Test hooks — allows tests to override dependencies without a DI framework
let getPaidAccessByBarberIdsForSalons = getPaidAccessByBarberIdsForSalon;
let getPublicBarberReadinessByIdsForSalons = getPublicBarberReadinessByIds;
let getSalonReviewStatsForSalons = getSalonReviewStats;
export const __salonControllerTestHooks = {
  resetGetPaidAccessByBarberIds() {
    getPaidAccessByBarberIdsForSalons = getPaidAccessByBarberIdsForSalon;
  },
  setGetPaidAccessByBarberIds(fn) {
    getPaidAccessByBarberIdsForSalons = fn;
  },
  resetGetPublicBarberReadinessByIds() {
    getPublicBarberReadinessByIdsForSalons = getPublicBarberReadinessByIds;
  },
  setGetPublicBarberReadinessByIds(fn) {
    getPublicBarberReadinessByIdsForSalons = fn;
  },
  resetGetSalonReviewStats() {
    getSalonReviewStatsForSalons = getSalonReviewStats;
  },
  setGetSalonReviewStats(fn) {
    getSalonReviewStatsForSalons = fn;
  },
};

const isPublicReadyForSalon = (readinessByBarberId, barberId, salonId) => {
  const readiness = readinessByBarberId.get(String(barberId));
  return (
    readiness?.publicReady === true &&
    readiness?.eligibleSalonIds?.has(String(salonId)) === true
  );
};

const getApprovedSalonEntry = (barber, salonId) => {
  const hasCanonicalEntry = (barber?.salons || []).some(
    (entry) => String(entry?.salon?._id || entry?.salon) === String(salonId)
  );
  const approvedEntry = (barber?.salons || []).find(
    (entry) =>
      String(entry?.salon?._id || entry?.salon) === String(salonId) &&
      entry?.status === "approved"
  );

  if (approvedEntry) return approvedEntry;
  if (hasCanonicalEntry) return null;

  if (
    String(barber?.salon?._id || barber?.salon) === String(salonId) &&
    barber?.salonStatus === "approved"
  ) {
    return {
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
    };
  }

  return null;
};

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
      if (!req.user?._id) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (String(req.query.excludeForBarber) !== String(req.user._id)) {
        return res.status(403).json({ message: "You can only filter your own salons" });
      }

      const barberId = req.user._id;
      const barber = await User.findById(barberId);

      if (barber) {
        // Only approved canonical memberships are ineligible. A stale pending
        // entry must not hide a salon after its request was rejected/cancelled.
        const barberSalonIds = (barber.salons || [])
          .filter((s) => s.status === "approved")
          .map((s) => s.salon?.toString())
          .filter(Boolean);

        // Get salon IDs the barber owns
        const ownedSalonIds = await Salon.find({
          $or: [{ ownerId: barberId }, { admins: barberId }],
        }).distinct("_id");
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
      const { term, isTooLong } = normalizeSearch(req.query.search);
      if (isTooLong) {
        return res.status(400).json({ message: "Search term is too long" });
      }
      if (term) {
        const escaped = escapeRegex(term);
        query.$or = [
          { name: { $regex: escaped, $options: "i" } },
          { city: { $regex: escaped, $options: "i" } },
        ];
      }
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

    // Phase 10: Only include barbers with active subscription/seat access for each salon
    const barberIds = barbers.map((b) => b._id);
    const [paidAccessEntries, reviewStatsBySalonId, readinessByBarberId] = await Promise.all([
      Promise.all(
        salonIds.map(async (salonId) => [
          String(salonId),
          await getPaidAccessByBarberIdsForSalons(barberIds, salonId),
        ])
      ),
      getSalonReviewStatsForSalons(salonIds),
      getPublicBarberReadinessByIdsForSalons(barberIds),
    ]);
    const paidAccessBySalonId = new Map(paidAccessEntries);

    const barbersBySalonId = new Map();

    salons.forEach((salon) => {
      barbersBySalonId.set(String(salon._id), []);
    });

    barbers.forEach((barber) => {
      // Check new salons array first
      if (Array.isArray(barber.salons) && barber.salons.length > 0) {
        const approvedEntries = barber.salons.filter(isBookableSalonSpecialist);
        approvedEntries.forEach((entry) => {
          const salonId = String(entry.salon);
          if (
            paidAccessBySalonId.get(salonId)?.get(String(barber._id)) !== true ||
            !isPublicReadyForSalon(readinessByBarberId, barber._id, salonId)
          ) {
            return;
          }
          const salonBarbers = barbersBySalonId.get(salonId) || [];
          salonBarbers.push(barber);
          barbersBySalonId.set(salonId, salonBarbers);
        });
      } else if (barber.salonStatus === "approved" && barber.salon) {
        // Fallback to legacy
        const salonId = String(barber.salon);
        if (!barbersBySalonId.has(salonId)) {
          return;
        }
        if (
          paidAccessBySalonId.get(salonId)?.get(String(barber._id)) !== true ||
          !isPublicReadyForSalon(readinessByBarberId, barber._id, salonId)
        ) {
          return;
        }
        const salonBarbers = barbersBySalonId.get(salonId) || [];
        salonBarbers.push(barber);
        barbersBySalonId.set(salonId, salonBarbers);
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
    if (!requireBarber(req, res)) return undefined;

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

    // Phase 10: Only include barbers with active subscription/seat access
    const barberIds = barbers.map((b) => b._id);
    const paidAccessMap = await getPaidAccessByBarberIdsForSalons(
      barberIds,
      salon._id
    );
    const readinessByBarberId =
      await getPublicBarberReadinessByIdsForSalons(barberIds);
    const paidBarbers = barbers.filter(
      (barber) =>
        paidAccessMap.get(String(barber._id)) === true &&
        isPublicReadyForSalon(readinessByBarberId, barber._id, salon._id) &&
        isBookableSalonSpecialist(getApprovedSalonEntry(barber, salon._id))
    );

    const profiles = await BarberProfile.find({
      barberId: { $in: paidBarbers.map((barber) => barber._id) },
    });

    const [reviewStatsBySalonId] = await Promise.all([
      getSalonReviewStatsForSalons(salon._id, { latestLimit: 5 }),
    ]);

    return res.json(
      buildPublicSalonResponse({
        salon,
        reviewStats: reviewStatsBySalonId.get(String(salon._id)),
        barbers: paidBarbers,
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

    const {
      name,
      city = "",
      address = "",
      phone = "",
      imageUrl = "",
      ownerWorksAsSpecialist = true,
    } = req.body;
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
    const hasPrimary = user.salons.some((s) => s.isPrimary);
    user.salons.push({
      salon: salon._id,
      status: "approved",
      joinedAt: new Date(),
      isPrimary: !hasPrimary,
      relationshipType: "staff",
      relationshipStatus: "accepted",
      worksAsSpecialist: ownerWorksAsSpecialist !== false,
    });

    // Update legacy fields only if no primary exists yet
    if (!hasPrimary) {
      user.salon = salon._id;
      user.salonStatus = "approved";
    }
    if (ownerWorksAsSpecialist !== false) {
      openCurrentWorkHistory(user, salon);
    }
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
    const weeklySchedule =
      req.body.weeklySchedule === undefined
        ? undefined
        : normalizeAutoClosedWeeklySchedule(
            markExplicitAllDaysOffWeeklySchedule(
              sanitizeWeeklySchedule(req.body.weeklySchedule)
            )
          );

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
    const scheduleSet = { defaultSchedule };

    if (weeklySchedule !== undefined) {
      scheduleSet.weeklySchedule = weeklySchedule;
    }

    const schedule = await Schedule.findOneAndUpdate(
      { barberId, salonId },
      {
        $set: scheduleSet,
        $setOnInsert: {
          barberId,
          salonId,
        },
      },
      { returnDocument: "after", runValidators: true, upsert: true }
    );

    const salonEntry = barber.salons.find((s) => s.salon?.toString() === salonId);

    return res.json({
      message: "Default schedule updated",
      defaultSchedule: salonEntry?.defaultSchedule || defaultSchedule,
      weeklySchedule: schedule?.weeklySchedule || weeklySchedule || {},
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update default schedule",
    });
  }
};
