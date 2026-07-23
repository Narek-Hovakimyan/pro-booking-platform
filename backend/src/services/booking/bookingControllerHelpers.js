import mongoose from "mongoose";
import User from "../../models/User.js";
import Salon from "../../models/Salon.js";
import { storedDateToDateKey } from "../../utils/bookingDateStorage.js";
import {
  getApprovedUserSalonIds,
  getPrimaryApprovedSalonId,
} from "../salon/salonMembershipService.js";
import { getMemberRelationshipType } from "../salon/salonRelationshipService.js";

/**
 * Check if a value is a valid MongoDB ObjectId.
 */
export const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

/**
 * Allowed booking delay minutes for the delay endpoint.
 */
export const allowedBookingDelayMinutes = new Set([10, 20]);

/**
 * Convert minutes (since midnight) to "HH:MM" time string.
 */
export const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
};

/**
 * Check if a body field exists as a direct own property.
 */
export const hasOwnBodyField = (body, field) =>
  Object.prototype.hasOwnProperty.call(body || {}, field);

/**
 * Detect if the request body attempts to change the booking date/time.
 */
export const attemptsDateTimeChange = (body, booking) => {
  if (
    hasOwnBodyField(body, "bookingDate") &&
    storedDateToDateKey(body.bookingDate) !==
      storedDateToDateKey(booking.bookingDate)
  ) {
    return true;
  }

  if (
    hasOwnBodyField(body, "dayKey") &&
    String(body.dayKey || "") !== String(booking.dayKey || "")
  ) {
    return true;
  }

  if (
    hasOwnBodyField(body, "time") &&
    String(body.time || "") !== String(booking.time || "")
  ) {
    return true;
  }

  return false;
};

/**
 * Get the HTTP status code from an error object.
 */
export const getErrorStatusCode = (error) => {
  if (error?.statusCode) return error.statusCode;
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return 400;
  }
  return 500;
};

/**
 * Send a controller error response.
 */
export const sendControllerError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);
  const statusCode = getErrorStatusCode(error);
  const message = statusCode === 500
    ? fallbackMessage
    : error?.message || fallbackMessage;
  return res.status(statusCode).json({ message });
};

/**
 * Compare two IDs (supports ObjectId, string, and object with _id).
 */

/**
 * Resolve the salon for a booking based on barber and optional salonId.
 */
export const resolveBookingSalon = async ({ barberId, salonId }) => {
  const barber = await User.findById(barberId).select(
    "salon salonStatus salons role loyaltyDiscountSettings"
  );

  if (!barber || barber.role !== "barber") {
    return { message: "Barber not found" };
  }

  const requestedSalonId = salonId ? String(salonId) : "";
  const approvedSalonIds = getApprovedUserSalonIds(barber);

  if (requestedSalonId) {
    if (!isValidObjectId(requestedSalonId)) {
      return { message: "Invalid salon" };
    }

    const salonExists = await Salon.exists({ _id: requestedSalonId });

    if (!salonExists) {
      return { message: "Salon not found" };
    }

    if (!approvedSalonIds.includes(requestedSalonId)) {
      return { message: "Barber does not work in selected salon" };
    }

    return { barber, salonId: requestedSalonId };
  }

  if (approvedSalonIds.length > 1) {
    return { message: "Salon is required for this barber" };
  }

  const inferredSalonId = getPrimaryApprovedSalonId(barber);

  if (!inferredSalonId) {
    return { barber, salonId: null };
  }

  const inferredSalonExists = await Salon.exists({ _id: inferredSalonId });

  return {
    barber,
    salonId: inferredSalonExists ? inferredSalonId : null,
  };
};

/**
 * Get the client name from a booking, with fallback.
 */
export const getClientName = async (booking, fallbackUser) => {
  if (booking.clientName) return booking.clientName;
  if (fallbackUser?.name) return fallbackUser.name;

  const client = await User.findById(booking.clientId).select("name");
  return client?.name || "Client";
};

/**
 * Check if the user can manage the booking's salon.
 */
export const canManageBookingSalon = async (booking, userId) => {
  if (!booking?.salonId || !userId) return false;

  const salon = await Salon.findById(booking.salonId).select("ownerId admins").lean();
  if (!salon) return false;

  return (
    sameId(salon.ownerId, userId) ||
    (Array.isArray(salon.admins) &&
      salon.admins.some((adminId) => sameId(adminId, userId)))
  );
};

export const canManageBookingPrivateData = async (booking, userId) => {
  if (!booking?.barberId || !(await canManageBookingSalon(booking, userId))) {
    return false;
  }

  const relationship = await getMemberRelationshipType(
    booking.barberId,
    booking.salonId
  );

  return (
    relationship?.relationshipType === "staff" &&
    relationship?.relationshipStatus === "accepted"
  );
};

export const sameId = (left, right) =>
  String(left || "") === String(right || "");
