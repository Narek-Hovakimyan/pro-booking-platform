/**
 * Pure helper functions and constants for barber profile logic.
 * No req, res, database queries, database writes, or external mutations.
 */

// ─── Constants ───
export const defaultScheduleFallback = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

export const timeKeyPattern = /^\d{2}:\d{2}$/;

// ─── Event certificate payload mapper ───
export const getPublicEventCertificatePayload = (certificate) => ({
  certificateId: certificate.certificateId,
  eventTitle: certificate.eventTitle,
  organizerName: certificate.organizerName,
  salonName: certificate.salonName || "",
  eventDate: certificate.eventDate,
  issuedAt: certificate.issuedAt,
  status: certificate.status,
  revokedAt: certificate.revokedAt || null,
  certificateType: certificate.certificateType || "auto",
  fileUrl: certificate.fileUrl || "",
  fileType: certificate.fileType || "",
  originalFileName: certificate.originalFileName || "",
});

// ─── Time helpers ───
export const isTimeKey = (time) => {
  if (typeof time !== "string" || !timeKeyPattern.test(time)) return false;

  const [hours, minutes] = time.split(":").map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

export const timeToMinutes = (time) => {
  if (!isTimeKey(time)) return null;

  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
};

// ─── Default schedule helpers ───
export const sanitizeDefaultSchedule = (defaultSchedule = {}) => {
  const hasBreak = Boolean(defaultSchedule.hasBreak);
  const startTime = defaultSchedule.startTime || defaultScheduleFallback.startTime;
  const endTime = defaultSchedule.endTime || defaultScheduleFallback.endTime;
  const breakStart = hasBreak ? defaultSchedule.breakStart || "" : "";
  const breakEnd = hasBreak ? defaultSchedule.breakEnd || "" : "";
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const breakStartMinutes = timeToMinutes(breakStart);
  const breakEndMinutes = timeToMinutes(breakEnd);

  if (startMinutes === null || endMinutes === null) {
    throw new Error("Default working hours must use HH:mm format");
  }

  if (endMinutes <= startMinutes) {
    throw new Error("Default end time must be later than start time");
  }

  if (hasBreak) {
    if (breakStartMinutes === null || breakEndMinutes === null) {
      throw new Error("Default break time must use HH:mm format");
    }

    if (breakEndMinutes <= breakStartMinutes) {
      throw new Error("Default break end must be later than break start");
    }

    if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
      throw new Error("Default break time must be inside working hours");
    }
  }

  return {
    startTime,
    endTime,
    hasBreak,
    breakStart,
    breakEnd,
  };
};

export const getDefaultSchedule = (profile) => ({
  ...defaultScheduleFallback,
  ...(profile?.defaultSchedule || {}),
});

export const parseDefaultSchedulePayload = (defaultSchedule) => {
  if (typeof defaultSchedule !== "string") return defaultSchedule;

  return JSON.parse(defaultSchedule);
};

// ─── File path helpers ───
export const getUploadedAvatarPath = (file) =>
  file ? `/uploads/avatars/${file.filename}` : "";

export const getUploadedCertImagePath = (file) =>
  file ? `/uploads/certifications/${file.filename}` : "";

// ─── Certification helpers ───
export const getLegacyCertification = (profile) =>
  profile?._doc?.certification || profile?.certification || null;

export const isSameCertification = (firstCert, secondCert) => {
  if (!firstCert || !secondCert) return false;
  if (firstCert._id && secondCert._id) {
    return String(firstCert._id) === String(secondCert._id);
  }

  return (
    firstCert.title === secondCert.title &&
    firstCert.issuedBy === secondCert.issuedBy &&
    String(firstCert.issueDate || "") === String(secondCert.issueDate || "")
  );
};

export const normalizeCertifications = (profile) => {
  if (!profile) return { certifications: [], changed: false };

  let changed = false;

  if (!Array.isArray(profile.certifications)) {
    profile.certifications = profile.certifications
      ? [profile.certifications]
      : [];
    changed = true;
  }

  const legacyCertification = getLegacyCertification(profile);

  if (
    legacyCertification &&
    !profile.certifications.some((cert) =>
      isSameCertification(cert, legacyCertification)
    )
  ) {
    profile.certifications.push(legacyCertification);
    changed = true;
  }

  return { certifications: profile.certifications, changed };
};

export const parseCertificationDate = (value, fieldLabel) => {
  if (!value) {
    return { error: `${fieldLabel} is required` };
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return { error: `${fieldLabel} must be a valid date` };
  }

  return { value: parsedDate };
};

export const isFutureDate = (date) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return date > today;
};
