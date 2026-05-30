/**
 * Pure helper functions and constants for event logic.
 * No req, res, database writes, or external mutations.
 */

// ─── Registration status constants ───
export const APPROVED_REGISTRATION_STATUS = "approved";
export const PENDING_REGISTRATION_STATUS = "pending";
export const CANCELLED_REGISTRATION_STATUS = "cancelled";
export const REJECTED_REGISTRATION_STATUS = "rejected";
export const WAITLISTED_REGISTRATION_STATUS = "waitlisted";

// ─── Event type / visibility constants ───
export const EVENT_TYPE_VALUES = [
  "training",
  "masterclass",
  "salon_opening",
  "discount_day",
  "competition",
  "networking",
];
export const EVENT_VISIBILITY_VALUES = ["public", "private"];

// ─── ID helpers ───
export const getId = (value) => value?._id || value?.id || value;

// ─── Registration user helpers ───
export const getRegistrationUserId = (registration) =>
  getId(registration?.userId || registration?.barberId);

export const normalizeRegistrationRecord = (registration, userId) => {
  if (!registration) return registration;

  if (!registration.userId) {
    registration.userId = registration.barberId || userId || null;
  }

  return registration;
};

export const buildUserRegistrationQuery = (userId) => ({
  $or: [{ userId }, { barberId: userId }],
});

// ─── Response mappers ───
export const mapCertificateResponse = (certificate) =>
  certificate
    ? {
        certificateId: certificate.certificateId,
        verificationCode: certificate.verificationCode,
        issuedAt: certificate.issuedAt,
        status: certificate.status,
        revokedAt: certificate.revokedAt || null,
        revokedReason: certificate.revokedReason || "",
      }
    : null;

export const mapRegistrationResponse = (registration, certificate = null) => {
  const user = registration?.userId || registration?.barberId || {};
  const userId = getRegistrationUserId(registration);
  const createdAt =
    registration?.createdAt || registration?.registeredAt || null;

  return {
    _id: registration?._id,
    userId,
    userName: user?.name || "User",
    userEmail: user?.email || "",
    userPhone: user?.phone || "",
    userCity: user?.city || "",
    userRole: user?.role || "client",
    userAvatar: user?.avatarUrl || user?.avatar || "",
    barberId: userId,
    barberName: user?.name || "User",
    barberEmail: user?.email || "",
    barberPhone: user?.phone || "",
    barberAvatar: user?.avatarUrl || user?.avatar || "",
    status: registration?.status || PENDING_REGISTRATION_STATUS,
    message: registration?.message || "",
    rejectionReason: registration?.rejectionReason || "",
    attendanceStatus: registration?.attendanceStatus || "pending",
    attended: Boolean(registration?.attended),
    checkedInAt: registration?.checkedInAt || null,
    reminderSentAt: registration?.reminderSentAt || null,
    certificate: mapCertificateResponse(
      certificate || registration?.certificate
    ),
    certificateIssuedAt:
      registration?.certificateIssuedAt || certificate?.issuedAt || null,
    createdAt,
    updatedAt: registration?.updatedAt || null,
  };
};

import { sanitizeMediaUrl } from "./mediaUrl.js";

// ─── Event payload / image helpers ───

export const getUploadedEventImagePath = (file) =>
  file ? `/uploads/events/${file.filename}` : "";

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const isEmptyInput = (value) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

export const parseEventPayload = (
  body = {},
  file = null,
  { applyDefaults = true } = {}
) => {
  const payload = { ...body };

  if (hasOwn(body, "duration")) {
    payload.duration = isEmptyInput(body.duration)
      ? applyDefaults
        ? undefined
        : Number.NaN
      : Number(body.duration);
  }

  if (hasOwn(body, "price")) {
    payload.price = isEmptyInput(body.price)
      ? applyDefaults
        ? 0
        : Number.NaN
      : Number(body.price);
  } else if (applyDefaults) {
    payload.price = 0;
  }

  if (hasOwn(body, "maxParticipants")) {
    payload.maxParticipants = isEmptyInput(body.maxParticipants)
      ? applyDefaults
        ? 20
        : Number.NaN
      : Number(body.maxParticipants);
  } else if (applyDefaults) {
    payload.maxParticipants = 20;
  }

  if (hasOwn(body, "type") || applyDefaults) {
    payload.type = EVENT_TYPE_VALUES.includes(body.type) ? body.type : "training";
  }

  if (hasOwn(body, "visibility") || applyDefaults) {
    payload.visibility = EVENT_VISIBILITY_VALUES.includes(body.visibility)
      ? body.visibility
      : "public";
  }

  if (hasOwn(body, "certificatesEnabled")) {
    payload.certificatesEnabled =
      body.certificatesEnabled === true ||
      body.certificatesEnabled === "true" ||
      body.certificatesEnabled === "on";
  }

  const uploadedImagePath = getUploadedEventImagePath(file);
  if (uploadedImagePath || hasOwn(body, "imageUrl") || applyDefaults) {
    payload.imageUrl = uploadedImagePath || sanitizeMediaUrl(body.imageUrl) || "";
  }

  return payload;
};

// ─── Date/time helpers ───
export const getEventDateTime = (event) => {
  if (!event?.date || !event?.time) return null;

  const dateTime = new Date(`${event.date}T${event.time}:00+04:00`);

  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
};

export const isEventInPast = (event) => {
  const startsAt = getEventDateTime(event);

  return startsAt ? startsAt < new Date() : false;
};

// ─── Event date/time and numeric validation helpers ───

/**
 * Validate that a date/time pair can form a valid future DateTime in +04:00.
 * Returns { isValid: true } or { isValid: false, message }.
 */
export const validateEventDateTime = (date, time) => {
  if (typeof date !== "string" || typeof time !== "string") {
    return { isValid: false, message: "Invalid date or time" };
  }

  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    return { isValid: false, message: "Invalid date or time" };
  }

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return { isValid: false, message: "Invalid date or time" };
  }

  const parsed = new Date(`${date}T${time}:00+04:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { isValid: false, message: "Invalid date or time" };
  }
  if (parsed < new Date()) {
    return { isValid: false, message: "Event date/time must be in the future" };
  }
  return { isValid: true };
};

/**
 * Validate numeric fields for event creation/update.
 * Only validates fields that are !== undefined.
 * Returns { isValid: true } or { isValid: false, message }.
 */
export const validateEventNumbers = (fields) => {
  const { duration, price, maxParticipants } = fields;

  if (duration !== undefined) {
    const num = Number(duration);
    if (!Number.isFinite(num) || num <= 0) {
      return { isValid: false, message: "Duration must be a positive number" };
    }
  }

  if (price !== undefined) {
    const num = Number(price);
    if (!Number.isFinite(num) || num < 0) {
      return { isValid: false, message: "Price must be a non-negative number" };
    }
  }

  if (maxParticipants !== undefined) {
    const num = Number(maxParticipants);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
      return { isValid: false, message: "maxParticipants must be a non-negative integer" };
    }
  }

  return { isValid: true };
};
