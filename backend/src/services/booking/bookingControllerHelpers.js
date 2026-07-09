import mongoose from "mongoose";
import { storedDateToDateKey } from "../../utils/bookingDateStorage.js";

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
export const sameId = (left, right) =>
  String(left || "") === String(right || "");