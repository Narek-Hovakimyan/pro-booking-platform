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

export const parseEventPayload = (body = {}, file = null) => ({
  ...body,
  duration:
    body.duration === undefined || body.duration === ""
      ? body.duration
      : Number(body.duration),
  price:
    body.price === undefined || body.price === ""
      ? 0
      : Number(body.price),
  maxParticipants:
    body.maxParticipants === undefined || body.maxParticipants === ""
      ? 20
      : Number(body.maxParticipants),
  type: EVENT_TYPE_VALUES.includes(body.type) ? body.type : "training",
  visibility: EVENT_VISIBILITY_VALUES.includes(body.visibility)
    ? body.visibility
    : "public",
  certificatesEnabled: Object.prototype.hasOwnProperty.call(
    body,
    "certificatesEnabled"
  )
    ? body.certificatesEnabled === true ||
      body.certificatesEnabled === "true" ||
      body.certificatesEnabled === "on"
    : undefined,
  imageUrl: getUploadedEventImagePath(file) || sanitizeMediaUrl(body.imageUrl) || "",

});

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
