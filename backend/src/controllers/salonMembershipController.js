import Salon from "../models/Salon.js";
import SalonJoinRequest from "../models/SalonJoinRequest.js";
import User from "../models/User.js";
import {
  canManageSalonRequest,
  isSalonOwner,
  sameId,
} from "../utils/salonPermissions.js";
import {
  barberFields,
  requireBarber,
  syncLegacySalonFields,
  closeCurrentWorkHistory,
  openCurrentWorkHistory,
} from "../utils/salonHelpers.js";
import {
  serializeRequest,
  serializeSalon,
  serializeUser,
} from "../utils/salonUtils.js";
import { createNotification } from "./notificationController.js";
import { sendControllerError } from "../utils/controllerError.js";

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
    return sendControllerError(res, error, "Could not fetch salon requests");
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
