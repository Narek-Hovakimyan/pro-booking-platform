import Salon from "../models/Salon.js";
import User from "../models/User.js";
import {
  canRemoveBarber,
  isSalonAdmin,
  isSalonOwner,
  sameId,
} from "../utils/salonPermissions.js";
import {
  requireBarber,
  syncLegacySalonFields,
  closeCurrentWorkHistory,
} from "../utils/salonHelpers.js";
import {
  serializeSalon,
  serializeUser,
} from "../utils/salonUtils.js";
import { getSalonAdminsForSalon } from "../services/salon/salonAdminService.js";
import { getSalonStaff as getSalonStaffForSalon, SalonStaffError } from "../services/salon/salonStaffService.js";
import { createNotification } from "./notificationController.js";

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
