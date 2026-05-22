import BarberProfile from "../models/BarberProfile.js";
import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import Schedule from "../models/Schedule.js";
import User from "../models/User.js";
import { sanitizeMediaUrl } from "../utils/mediaUrl.js";
import {
  canManageSalonRequest,

  canRemoveBarber,
  isSalonAdmin,
  isSalonOwner,
  sameId,
} from "../utils/salonPermissions.js";
import {
  findManageableSalonsForUser,
} from "../services/salon/salonMembershipService.js";
import { getSalonAdminsForSalon } from "../services/salon/salonAdminService.js";
import { getSalonStaff as getSalonStaffForSalon, SalonStaffError } from "../services/salon/salonStaffService.js";


import { getSalonStatusForBarber } from "../services/salon/salonStatusService.js";
import { createNotification } from "./notificationController.js";
import { getSalonReviewStats } from "./salonReviewController.js";
import {
  buildPublicSalonResponse,
  serializeSalon,
  serializeRequest,
  serializeUser,
} from "../utils/salonUtils.js";
import { normalizeSalonDefaultSchedule } from "../utils/salonScheduleUtils.js";

const barberFields = "name phone city avatarUrl salon salonStatus role workHistory salons";

const requireBarber = (req, res) => {
  if (req.user?.role !== "barber") {
    res.status(403).json({ message: "Only barbers can use salon features" });
    return false;
  }

  return true;
};

/**
 * Get the primary approved salon for a barber.
 * Uses the new salons array, falls back to legacy fields.
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

/**
 * Update legacy salon/salonStatus fields to match the new salons array.
 * Priority: approved > pending > none
 */
const syncLegacySalonFields = (barber) => {
  const approved = (barber.salons || []).filter((s) => s.status === "approved");
  const pending = (barber.salons || []).filter((s) => s.status === "pending");

  if (approved.length > 0) {
    const primary = approved.find((s) => s.isPrimary) || approved[0];
    barber.salon = primary.salon;
    barber.salonStatus = "approved";
  } else if (pending.length > 0) {
    barber.salon = pending[0].salon;
    barber.salonStatus = "pending";
  } else {
    barber.salon = null;
    barber.salonStatus = "none";
  }
};

const closeCurrentWorkHistory = (barber, salonId, endedAt = new Date()) => {
  if (!barber) return;

  barber.workHistory = Array.isArray(barber.workHistory) ? barber.workHistory : [];
  barber.workHistory.forEach((item) => {
    if (item?.isCurrent && (!salonId || sameId(item.salon, salonId))) {
      item.endDate = endedAt;
      item.isCurrent = false;
    }
  });
};

const openCurrentWorkHistory = (barber, salon, startedAt = new Date()) => {
  if (!barber || !salon?._id) return;

  barber.workHistory = Array.isArray(barber.workHistory) ? barber.workHistory : [];

  const existingCurrentForSalon = barber.workHistory.find(
    (item) => item?.isCurrent && sameId(item.salon, salon._id)
  );

  if (existingCurrentForSalon) {
    existingCurrentForSalon.salonName = salon.name || existingCurrentForSalon.salonName;
    existingCurrentForSalon.endDate = null;
    return;
  }

  // Do NOT close other salons' work history - barber can work at multiple salons simultaneously
  // Only add a new work history entry for THIS salon

  barber.workHistory.push({
    salon: salon._id,
    salonName: salon.name || "",
    startDate: startedAt,
    endDate: null,
    isCurrent: true,
  });
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
    return res.status(500).json({
      message: error.message || "Could not fetch salons",
    });
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
    return res.status(500).json({
      message: error.message || "Could not load manageable salons",
    });
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
    return res.status(500).json({
      message: error.message || "Could not fetch salon",
    });
  }
};

export const getMySalonStatus = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const status = await getSalonStatusForBarber(req.user._id);

    return res.json(status);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch salon status",
    });
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

export const requestToJoinSalon = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const salon = await Salon.findById(req.params.salonId);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    const barber = await User.findById(req.user._id);

    // Check existing entries in salons array
    const existingEntry = (barber.salons || []).find(
      (s) => s.salon?.toString() === salon._id.toString()
    );

    if (existingEntry) {
      if (existingEntry.status === "pending") {
        return res.status(400).json({
          message: "You already have a pending request for this salon",
        });
      }

      if (existingEntry.status === "approved") {
        return res.status(400).json({
          message: "You already work in this salon",
        });
      }

      // If rejected, allow new request - update status back to pending
      existingEntry.status = "pending";
      existingEntry.joinedAt = null;
    } else {
      // Add new entry to salons array
      barber.salons = barber.salons || [];
      barber.salons.push({
        salon: salon._id,
        status: "pending",
        joinedAt: null,
        isPrimary: false,
      });
    }

    // Update legacy fields only if barber has no approved salons
    const hasApproved = (barber.salons || []).some((s) => s.status === "approved");
    if (!hasApproved) {
      barber.salon = salon._id;
      barber.salonStatus = "pending";
    }

    const request = await SalonJoinRequest.create({
      salonId: salon._id,
      barberId: req.user._id,
      status: "pending",
    });

    await barber.save();

    await createNotification({
      userId: salon.ownerId,
      type: "salon_join_requested",
      message: `${req.user.name} wants to join ${salon.name}`,
    });

    return res.status(201).json({
      request: serializeRequest(await request.populate("salonId")),
      salonStatus: "pending",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Salon request already pending" });
    }

    return res.status(400).json({
      message: error.message || "Could not send salon request",
    });
  }
};

export const cancelJoinRequest = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const request = await SalonJoinRequest.findOne({
      _id: req.params.requestId,
      barberId: req.user._id,
      status: "pending",
    });

    if (!request) {
      return res.status(404).json({ message: "Pending request not found" });
    }

    request.status = "cancelled";
    await request.save();

    const barber = await User.findById(req.user._id);

    // Remove this salon from salons array
    if (Array.isArray(barber.salons)) {
      barber.salons = barber.salons.filter(
        (s) => s.salon?.toString() !== request.salonId?.toString()
      );
    }

    // Update legacy fields
    syncLegacySalonFields(barber);
    await barber.save();

    return res.json({ request: serializeRequest(request), salonStatus: barber.salonStatus || "none" });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not cancel salon request",
    });
  }
};

export const getOwnerJoinRequests = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const managedSalons = await Salon.find({
      $or: [{ ownerId: req.user._id }, { admins: req.user._id }],
    });
    const managedSalonIds = managedSalons.map((salon) => salon._id);
    const requests = await SalonJoinRequest.find({
      salonId: { $in: managedSalonIds },
      status: "pending",
    })
      .populate("salonId")
      .populate("barberId", barberFields)
      .sort({ createdAt: -1 });

    return res.json(
      requests.map((request) => {
        const rawRequest = request.toObject();

        return {
          ...rawRequest,
          id: rawRequest._id,
          salon: serializeSalon(rawRequest.salonId),
          barber: rawRequest.barberId,
        };
      })
    );
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch salon requests",
    });
  }
};

export const decideJoinRequest = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const { status } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid request status" });
    }

    const request = await SalonJoinRequest.findById(req.params.requestId)
      .populate("salonId")
      .populate("barberId", barberFields);

    if (!request || request.status !== "pending") {
      return res.status(404).json({ message: "Pending request not found" });
    }

    const salon = request.salonId;
    const canManage = canManageSalonRequest(salon, req.user._id);

    if (!canManage) {
      return res.status(403).json({ message: "Only salon owner or admin can manage requests" });
    }

    if (status === "accepted") {
      const barber = await User.findById(request.barberId._id);

      if (!barber) {
        return res.status(404).json({ message: "Barber not found" });
      }

      // Check if barber already has this salon approved in another entry
      const existingApproved = (barber.salons || []).some(
        (s) => s.salon?.toString() === salon._id.toString() && s.status === "approved"
      );

      if (existingApproved) {
        return res.status(400).json({
          message: "Barber already works in this salon",
        });
      }

      request.status = status;
      await request.save();

      // Update salons array
      const existingEntry = (barber.salons || []).find(
        (s) => s.salon?.toString() === salon._id.toString()
      );

      if (existingEntry) {
        existingEntry.status = "approved";
        existingEntry.joinedAt = new Date();

        // If this is the barber's FIRST approved salon, set as primary
        const otherApproved = (barber.salons || []).filter(
          (s) => s.status === "approved" && s !== existingEntry
        );
        if (otherApproved.length === 0) {
          existingEntry.isPrimary = true;
        }
      } else {
        barber.salons = barber.salons || [];
        barber.salons.push({
          salon: salon._id,
          status: "approved",
          joinedAt: new Date(),
          isPrimary: (barber.salons || []).filter((s) => s.status === "approved").length === 0,
        });
      }

      // Update legacy fields only if barber has no other approved salons
      const hasOtherApproved = (barber.salons || []).some(
        (s) => s.status === "approved" && s.salon?.toString() !== salon._id.toString()
      );
      if (!hasOtherApproved) {
        barber.salon = salon._id;
        barber.salonStatus = "approved";
      }
      openCurrentWorkHistory(barber, salon);
      await barber.save();

      await createNotification({
        userId: request.barberId._id,
        type: "salon_join_accepted",
        message: `Your request to join ${salon.name} was accepted`,
      });
    } else {
      request.status = status;
      await request.save();

      const barber = await User.findById(request.barberId._id);

      if (barber) {
        // Update salons array
        const existingEntry = (barber.salons || []).find(
          (s) => s.salon?.toString() === salon._id.toString()
        );

        if (existingEntry) {
          existingEntry.status = "rejected";
        }

        // Update legacy fields
        syncLegacySalonFields(barber);
        await barber.save();
      }

      await createNotification({
        userId: request.barberId._id,
        type: "salon_join_rejected",
        message: `Your request to join ${salon.name} was rejected`,
      });
    }

    return res.json({
      request: serializeRequest(request),
      status,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update salon request",
    });
  }
};

export const leaveSalon = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const { salonId } = req.body;

    if (!salonId) {
      return res.status(400).json({ message: "salonId is required" });
    }

    const barber = await User.findById(req.user._id);

    if (!barber) {
      return res.status(404).json({ message: "Barber not found" });
    }

    // Check if barber is in this salon via new array or legacy
    const isInSalon = (barber.salons || []).some(
      (s) => s.salon?.toString() === salonId.toString() && s.status === "approved"
    ) || (barber.salonStatus === "approved" && sameId(barber.salon, salonId));

    if (!isInSalon) {
      return res.json({
        message: "You are not currently part of this salon",
        user: serializeUser(barber),
      });
    }

    const salon = await Salon.findById(salonId);

    if (isSalonOwner(salon, barber._id)) {
      return res.status(400).json({
        message:
          "Salon owner cannot leave without transferring ownership or deleting salon",
      });
    }

    // Remove salon from salons array
    if (Array.isArray(barber.salons)) {
      barber.salons = barber.salons.filter(
        (s) => s.salon?.toString() !== salonId.toString()
      );
    }

    closeCurrentWorkHistory(barber, salonId);

    // If leaving primary salon and has other approved, set first remaining as primary
    const remainingApproved = (barber.salons || []).filter((s) => s.status === "approved");
    if (remainingApproved.length > 0 && !remainingApproved.some((s) => s.isPrimary)) {
      remainingApproved[0].isPrimary = true;
    }

    // Update legacy fields
    syncLegacySalonFields(barber);
    await barber.save();

    if (salon?.ownerId) {
      await createNotification({
        userId: salon.ownerId,
        type: "salon_barber_left",
        message: `${barber.name} left ${salon.name}`,
      });
    }

    return res.json({
      message: "You left the salon",
      user: serializeUser(barber),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not leave salon",
    });
  }
};

export const removeBarberFromSalon = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const salon = await Salon.findById(req.params.salonId);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    if (!canRemoveBarber(salon, req.user._id, req.params.barberId)) {
      return res.status(403).json({
        message: "You do not have permission to remove this barber",
      });
    }

    const barber = await User.findById(req.params.barberId);

    if (!barber || barber.role !== "barber") {
      return res.status(404).json({ message: "Barber not found" });
    }

    // Check if barber belongs to this salon via new array or legacy
    const isInSalon = (barber.salons || []).some(
      (s) => s.salon?.toString() === salon._id.toString() && s.status === "approved"
    ) || (barber.salon && sameId(barber.salon, salon._id));

    if (!isInSalon) {
      return res.status(400).json({
        message: "Barber does not belong to this salon",
      });
    }

    // Remove this salon from salons array
    if (Array.isArray(barber.salons)) {
      barber.salons = barber.salons.filter(
        (s) => s.salon?.toString() !== salon._id.toString()
      );
    }

    closeCurrentWorkHistory(barber, salon._id);

    // If removing primary and has other approved, set first remaining as primary
    const remainingApproved = (barber.salons || []).filter((s) => s.status === "approved");
    if (remainingApproved.length > 0 && !remainingApproved.some((s) => s.isPrimary)) {
      remainingApproved[0].isPrimary = true;
    }

    // Update legacy fields
    syncLegacySalonFields(barber);
    await barber.save();

    await createNotification({
      userId: barber._id,
      type: "salon_barber_removed",
      message: `You were removed from ${salon.name}`,
    });

    return res.json({
      message: "Barber removed from salon",
      barber: serializeUser(barber),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not remove barber from salon",
    });
  }
};

export const promoteToAdmin = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const salon = await Salon.findById(req.params.salonId);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    // Only owner can promote
    if (!isSalonOwner(salon, req.user._id)) {
      return res.status(403).json({
        message: "Only salon owner can promote admins",
      });
    }

    const barber = await User.findById(req.params.barberId);

    if (!barber || barber.role !== "barber") {
      return res.status(404).json({ message: "Barber not found" });
    }

    // Check if barber is approved in this salon
    const isInSalon = (barber.salons || []).some(
      (s) => s.salon?.toString() === salon._id.toString() && s.status === "approved"
    ) || (barber.salon && sameId(barber.salon, salon._id));

    if (!isInSalon) {
      return res.status(400).json({
        message: "Barber is not in this salon",
      });
    }

    // Check if already an admin
    if (isSalonAdmin(salon, barber._id)) {
      return res.status(400).json({
        message: "Barber is already an admin",
      });
    }

    // Add to admins array
    salon.admins = salon.admins || [];
    salon.admins.push(barber._id);
    await salon.save();

    // Notify barber
    await createNotification({
      userId: barber._id,
      type: "salon_admin_promoted",
      message: `You have been promoted to admin of ${salon.name}`,
    });

    return res.json({
      message: `${barber.name} promoted to admin`,
      salon: serializeSalon(salon),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not promote barber to admin",
    });
  }
};

export const demoteAdmin = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const salon = await Salon.findById(req.params.salonId);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    // Only owner can demote
    if (!isSalonOwner(salon, req.user._id)) {
      return res.status(403).json({
        message: "Only salon owner can demote admins",
      });
    }

    const barber = await User.findById(req.params.barberId);

    if (!barber || barber.role !== "barber") {
      return res.status(404).json({ message: "Barber not found" });
    }

    // Check if barber is an admin
    if (!isSalonAdmin(salon, barber._id)) {
      return res.status(400).json({
        message: "Barber is not an admin of this salon",
      });
    }

    // Remove from admins array
    salon.admins = (salon.admins || []).filter(
      (adminId) => !sameId(adminId, barber._id)
    );
    await salon.save();

    // Notify barber
    await createNotification({
      userId: barber._id,
      type: "salon_admin_demoted",
      message: `You have been removed as admin of ${salon.name}`,
    });

    return res.json({
      message: `${barber.name} removed as admin`,
      salon: serializeSalon(salon),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not demote admin",
    });
  }
};

export const getSalonAdmins = async (req, res) => {
  try {
    const payload = await getSalonAdminsForSalon(req.params.salonId);

    return res.json(payload);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch salon admins",
    });
  }
};

export const getSalonStaff = async (req, res) => {
  try {
    const staff = await getSalonStaffForSalon(req.params.salonId, req.user._id);


    return res.json(staff);
  } catch (error) {
    if (error instanceof SalonStaffError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res.status(500).json({
      message: error.message || "Could not fetch salon staff",
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
