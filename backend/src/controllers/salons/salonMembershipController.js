import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import {
  isSalonAdmin,
  isSalonOwner,
  sameId,
} from "../../utils/salonPermissions.js";
import {
  barberFields,
  requireBarber,
  syncLegacySalonFields,
  closeCurrentWorkHistory,
} from "../../utils/salonHelpers.js";
import {
  serializeRequest,
  serializeSalon,
  serializeUser,
} from "../../utils/salonUtils.js";
import { revokeSalonSeatsForRemovedMember } from "../../services/subscriptionService.js";
import { createNotification } from "../notifications/notificationController.js";
import { sendControllerError } from "../../utils/controllerError.js";
import {
  cancelSalonJoinRequestLifecycle,
  cancelSalonJoinRequestBySalonLifecycle,
  decideSalonJoinRequestLifecycle,
  requestSalonJoinLifecycle,
} from "../../services/salon/salonJoinRequestLifecycleService.js";

const sessionQuery = (query, session) =>
  query?.session ? query.session(session) : query;

const runTransaction = async (callback) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const isValidSalonId = (salonId) =>
  typeof salonId === "string" &&
  /^[a-f\d]{24}$/i.test(salonId) &&
  mongoose.Types.ObjectId.isValid(salonId);

const sendLifecycleError = (res, error, fallbackMessage) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ message: error.message || fallbackMessage });
  }

  return res.status(400).json({ message: fallbackMessage });
};

export const requestToJoinSalon = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const result = await requestSalonJoinLifecycle({
      salonId: req.params.salonId,
      barber: req.user,
    });

    if (result.notification) {
      await createNotification(result.notification);
    }

    return res.status(result.statusCode).json({
      request: serializeRequest(result.request),
      salonStatus: result.salonStatus,
    });
  } catch (error) {
    return sendLifecycleError(res, error, "Could not send salon request");
  }
};

export const cancelJoinRequest = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const result = await cancelSalonJoinRequestLifecycle({
      requestId: req.params.requestId,
      barberId: req.user._id,
    });

    return res.json({
      request: serializeRequest(result.request),
      salonStatus: result.salonStatus,
    });
  } catch (error) {
    return sendLifecycleError(res, error, "Could not cancel salon request");
  }
};

export const cancelJoinRequestBySalon = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const salonId = req.params?.salonId;
    if (!isValidSalonId(salonId)) {
      return res.status(400).json({ message: "Invalid salonId" });
    }

    const result = await cancelSalonJoinRequestBySalonLifecycle({
      salonId,
      barberId: req.user._id,
    });

    return res.json({ salonStatus: result.salonStatus });
  } catch (error) {
    return sendLifecycleError(res, error, "Could not cancel salon request");
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

    const result = await decideSalonJoinRequestLifecycle({
      requestId: req.params.requestId,
      status,
      actorId: req.user._id,
    });

    if (result.notification) {
      await createNotification(result.notification);
    }

    return res.json({
      request: serializeRequest(result.request),
      status,
    });
  } catch (error) {
    return sendLifecycleError(res, error, "Could not update salon request");
  }
};

export const leaveSalon = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return undefined;

    const { salonId } = req.body;

    if (!salonId) {
      return res.status(400).json({ message: "salonId is required" });
    }

    const result = await runTransaction(async (session) => {
      const [barber, salon] = await Promise.all([
        sessionQuery(User.findById(req.user._id), session),
        sessionQuery(Salon.findById(salonId), session),
      ]);

      if (!barber) {
        const error = new Error("Barber not found");
        error.statusCode = 404;
        throw error;
      }

      if (isSalonOwner(salon, barber._id)) {
        const error = new Error(
          "Salon owner cannot leave without transferring ownership or deleting salon"
        );
        error.statusCode = 400;
        throw error;
      }

      const isInSalon = (barber.salons || []).some(
        (s) => s.salon?.toString() === salonId.toString() && s.status === "approved"
      ) || (barber.salonStatus === "approved" && sameId(barber.salon, salonId));
      const wasAdmin = isSalonAdmin(salon, barber._id);

      if (!isInSalon && !wasAdmin) {
        return { barber, salon, membershipRemoved: false };
      }

      if (Array.isArray(barber.salons)) {
        barber.salons = barber.salons.filter(
          (s) => s.salon?.toString() !== salonId.toString()
        );
      }

      closeCurrentWorkHistory(barber, salonId);

      const remainingApproved = (barber.salons || []).filter((s) => s.status === "approved");
      if (remainingApproved.length > 0 && !remainingApproved.some((s) => s.isPrimary)) {
        remainingApproved[0].isPrimary = true;
      }

      syncLegacySalonFields(barber);
      if (wasAdmin) {
        salon.admins = (salon.admins || []).filter(
          (adminId) => !sameId(adminId, barber._id)
        );
      }
      await barber.save({ session });
      if (wasAdmin) await salon.save({ session });

      return { barber, salon, membershipRemoved: isInSalon };
    });

    const { barber, salon, membershipRemoved } = result;
    if (!membershipRemoved) {
      return res.json({
        message: "You are not currently part of this salon",
        user: serializeUser(barber),
      });
    }

    await revokeSalonSeatsForRemovedMember({
      salonId,
      barberId: barber._id,
      revokedBy: barber._id,
    });

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
    return res.status(error.statusCode || 400).json({
      message: error.message || "Could not leave salon",
    });
  }
};
