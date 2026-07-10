import WaitlistEntry from "../models/WaitlistEntry.js";
import {
  createWaitlistEntry,
  cancelWaitlistEntry,
  getClientWaitlistEntries,
  getBarberWaitlistEntries,
  notifyMatchingWaitlistEntries,
  rejectWaitlistEntry,
  offerWaitlistEntry,
  acceptWaitlistOffer,
  declineWaitlistOffer,
} from "../services/waitlist/waitlistService.js";
import { sendControllerError } from "../utils/controllerError.js";

const getWaitlistActionStatus = (error) => {
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "FORBIDDEN") return 403;
  if (error.code === "CONFLICT") return 409;
  if (error.code === "VALIDATION_ERROR" || error.code === "INVALID_STATUS") return 400;
  return 500;
};

const waitlistCreationClientErrorMessages = new Set([
  "Service is not available for this barber",
  "Barber not found",
  "Salon not found",
  "Barber does not work in selected salon",
]);

const isWaitlistCreationClientError = (message = "") =>
  message.includes("date must be") ||
  message.includes("Preferred start time") ||
  message.includes("Preferred end time") ||
  message.includes("Preferred start time must be before preferred end time") ||
  waitlistCreationClientErrorMessages.has(message);

const sendWaitlistError = (res, error, fallbackMessage) => {
  if (error.code === "DUPLICATE_WAITLIST_ENTRY") {
    return res.status(409).json({ message: error.message });
  }

  const statusCode = getWaitlistActionStatus(error);

  if (statusCode !== 500) {
    return res.status(statusCode).json({
      message: error.message || fallbackMessage,
    });
  }

  return sendControllerError(res, error, fallbackMessage);
};

/**
 * POST /api/waitlist
 * Client creates a new waitlist entry.
 */
export const createEntry = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only clients can join waitlist" });
    }

    const { barberId, salonId, serviceId, date, preferredStartTime, preferredEndTime, note } =
      req.body;

    if (!barberId || !serviceId || !date) {
      return res.status(400).json({
        message: "barberId, serviceId, and date are required",
      });
    }

    const entry = await createWaitlistEntry({
      clientId: req.user._id,
      barberId,
      salonId: salonId || null,
      serviceId,
      date,
      preferredStartTime: preferredStartTime || "",
      preferredEndTime: preferredEndTime || "",
      note: note || "",
    });

    return res.status(201).json(entry);
  } catch (error) {
    if (isWaitlistCreationClientError(error?.message)) {
      return res.status(400).json({
        message: error.message || "Could not create waitlist entry",
      });
    }

    return sendWaitlistError(res, error, "Could not create waitlist entry");
  }
};

/**
 * GET /api/waitlist/me
 * Client lists their own waitlist entries.
 */
export const getMyEntries = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only clients can view their waitlist" });
    }

    const entries = await getClientWaitlistEntries(req.user._id);
    return res.json(entries);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch waitlist entries");
  }
};

/**
 * GET /api/waitlist/barber/:barberId
 * Barber lists waitlist entries for their own barberId.
 */
export const getBarberEntries = async (req, res) => {
  try {
    const { barberId } = req.params;

    if (req.user.role !== "barber" || String(req.user._id) !== String(barberId)) {
      return res.status(403).json({
        message: "You can only view waitlist entries for your own barber profile",
      });
    }

    const entries = await getBarberWaitlistEntries(barberId);
    return res.json(entries);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch barber waitlist entries");
  }
};

/**
 * PATCH /api/waitlist/:id/cancel
 * Client cancels their own active waitlist entry.
 */
export const cancelEntry = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only clients can cancel waitlist entries" });
    }

    const entry = await cancelWaitlistEntry(req.params.id, req.user._id);
    return res.json(entry);
  } catch (error) {
    return sendWaitlistError(res, error, "Could not cancel waitlist entry");
  }
};

/**
 * PATCH /api/waitlist/:id/notify
 * Barber manually marks a waitlist entry as notified.
 */
export const markNotified = async (req, res) => {
  try {
    const entry = await WaitlistEntry.findById(req.params.id);

    if (!entry) {
      return res.status(404).json({ message: "Waitlist entry not found" });
    }

    if (req.user.role !== "barber" || String(req.user._id) !== String(entry.barberId)) {
      return res.status(403).json({
        message: "Only the owning barber can mark entry as notified",
      });
    }

    if (entry.status !== "active") {
      return res.status(400).json({
        message: "Only active waitlist entries can be marked as notified",
      });
    }

    entry.status = "notified";
    entry.notifiedAt = new Date();
    await entry.save();

    return res.json(entry);
  } catch (error) {
    return sendControllerError(res, error, "Could not mark entry as notified");
  }
};

/**
 * PATCH /api/waitlist/:id/approve
 * Legacy endpoint retained for clients still calling the old route.
 * Booking creation now requires the offer -> client confirmation flow.
 */
export const approveEntry = async (req, res) => {
  return res.status(410).json({
    message: "Use offer flow; client confirmation is required",
  });
};

/**
 * PATCH /api/waitlist/:id/reject
 * Barber rejects an active/notified waitlist entry when no time is available.
 */
export const rejectEntry = async (req, res) => {
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Only barbers can reject waitlist entries" });
    }

    const entry = await rejectWaitlistEntry({
      entryId: req.params.id,
      barberId: req.user._id,
    });

    return res.json(entry);
  } catch (error) {
    return sendWaitlistError(res, error, "Could not reject waitlist entry");
  }
};

/**
 * PATCH /api/waitlist/:id/offer
 * Barber proposes a time for an active/notified waitlist entry.
 * Does NOT create a Booking. Entry becomes "offered" awaiting client response.
 */
export const offerEntry = async (req, res) => {
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Only barbers can offer waitlist times" });
    }

    const entry = await offerWaitlistEntry({
      entryId: req.params.id,
      barberId: req.user._id,
      time: req.body?.time,
    });

    return res.json(entry);
  } catch (error) {
    return sendWaitlistError(res, error, "Could not offer waitlist time");
  }
};

/**
 * PATCH /api/waitlist/:id/accept-offer
 * Client accepts a barber's offered time and creates a confirmed Booking.
 */
export const acceptOfferEntry = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only clients can accept offered times" });
    }

    const result = await acceptWaitlistOffer({
      entryId: req.params.id,
      clientId: req.user._id,
    });

    return res.json(result);
  } catch (error) {
    return sendWaitlistError(res, error, "Could not accept waitlist offer");
  }
};

/**
 * PATCH /api/waitlist/:id/decline-offer
 * Client declines a barber's offered time. No Booking is created.
 */
export const declineOfferEntry = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only clients can decline offered times" });
    }

    const entry = await declineWaitlistOffer({
      entryId: req.params.id,
      clientId: req.user._id,
    });

    return res.json(entry);
  } catch (error) {
    return sendWaitlistError(res, error, "Could not decline waitlist offer");
  }
};
