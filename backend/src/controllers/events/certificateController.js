import crypto from "crypto";

import Event from "../../models/Event.js";
import EventCertificate from "../../models/EventCertificate.js";
import EventRegistration from "../../models/EventRegistration.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { createNotification } from "../notifications/notificationController.js";
import { canManageSalonRequest } from "../../utils/salonPermissions.js";
import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";
import { getEventDateTime } from "../../utils/eventUtils.js";
import { sendControllerError } from "../../utils/controllerError.js";

const APPROVED_REGISTRATION_STATUS = "approved";

const getId = (value) => value?._id || value?.id || value;

const sameId = (left, right) => String(left || "") === String(right || "");

const getRegistrationUserId = (registration) =>
  getId(registration?.userId || registration?.barberId);

const hasEventEnded = (event) => {
  const startsAt = getEventDateTime(event);

  if (!startsAt) return false;

  const durationMs = Math.max(0, Number(event?.duration || 0)) * 60 * 1000;
  const endsAt = new Date(startsAt.getTime() + durationMs);

  return endsAt < new Date();
};

async function getEventAuthorization(event, user) {
  const userId = getId(user);
  const eventOrganizerId = getId(event?.organizerId);
  const salonId = getId(event?.salonId);
  const salon = salonId ? await Salon.findById(salonId) : null;
  const isOrganizer = sameId(eventOrganizerId, userId);
  const canManageSalon = salon ? canManageSalonRequest(salon, userId) : false;

  return {
    salon,
    isOrganizer,
    canManage: isOrganizer || canManageSalon,
  };
}

const makeCertificateId = () =>
  `CERT-${new Date().getFullYear()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;

const makeVerificationCode = () =>
  crypto.randomBytes(12).toString("hex").toUpperCase();

const createUniqueCertificateCodes = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const certificateId = makeCertificateId();
    const verificationCode = makeVerificationCode();
    const existing = await EventCertificate.findOne({
      $or: [{ certificateId }, { verificationCode }],
    });

    if (!existing) {
      return { certificateId, verificationCode };
    }
  }

  throw new Error("Could not generate certificate code");
};

const getName = (value, fallback = "User") => value?.name || fallback;

const getPublicCertificatePayload = (certificate) => ({
  certificateId: certificate.certificateId,
  participantName: certificate.participantName,
  eventTitle: certificate.eventTitle,
  organizerName: certificate.organizerName,
  salonName: certificate.salonName || "",
  eventDate: certificate.eventDate,
  issuedAt: certificate.issuedAt,
  status: certificate.status,
  revokedAt: certificate.revokedAt || null,
  revokedReason: certificate.revokedReason || "",
  certificateType: certificate.certificateType || "auto",
  fileUrl: certificate.fileUrl || "",
  fileType: certificate.fileType || "",
  originalFileName: certificate.originalFileName || "",
});

export async function createCertificateForRegistration({
  event,
  registration,
  actor,
}) {
  if (!event?.certificatesEnabled) {
    const error = new Error("Certificates are not enabled for this event");
    error.statusCode = 400;
    throw error;
  }

  if (!registration || !sameId(getId(registration.eventId), getId(event._id))) {
    const error = new Error("Registration not found");
    error.statusCode = 404;
    throw error;
  }

  if (registration.status !== APPROVED_REGISTRATION_STATUS) {
    const error = new Error("Participant must be approved");
    error.statusCode = 400;
    throw error;
  }

  if (!registration.attended) {
    const error = new Error("Participant must be marked as attended");
    error.statusCode = 400;
    throw error;
  }

  if (!hasEventEnded(event)) {
    const error = new Error("Certificate can be issued only after the event ends");
    error.statusCode = 400;
    throw error;
  }

  const existing = await EventCertificate.findOne({
    $or: [
      { registrationId: registration._id },
      {
        eventId: event._id,
        userId: getRegistrationUserId(registration),
        registrationId: registration._id,
      },
    ],
  });

  if (existing) {
    const error = new Error("Certificate already issued");
    error.statusCode = 400;
    throw error;
  }

  const [participant, organizer, salon] = await Promise.all([
    User.findById(getRegistrationUserId(registration)).select("name"),
    User.findById(getId(event.organizerId)).select("name"),
    event.salonId ? Salon.findById(getId(event.salonId)).select("name") : null,
  ]);
  const { certificateId, verificationCode } =
    await createUniqueCertificateCodes();

  const certificate = await EventCertificate.create({
    eventId: event._id,
    registrationId: registration._id,
    userId: getRegistrationUserId(registration),
    organizerId: getId(event.organizerId),
    salonId: getId(event.salonId) || null,
    certificateId,
    participantName: getName(participant),
    eventTitle: event.title || "",
    organizerName: getName(organizer, getName(actor, "Organizer")),
    salonName: salon?.name || "",
    eventDate: event.date || "",
    issuedAt: new Date(),
    status: "issued",
    verificationCode,
  });

  registration.certificateId = certificate._id;
  registration.certificateIssuedAt = certificate.issuedAt;
  await registration.save();

  await createNotification({
    userId: getRegistrationUserId(registration),
    type: "event_certificate_issued",
    message: `Your certificate for ${event.title} has been issued`,
  });

  return certificate;
}

export const issueEventRegistrationCertificate = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Only organizer can issue certificates",
      });
    }

    const registration = await EventRegistration.findOne({
      _id: req.params.registrationId,
      eventId: event._id,
    });

    const certificate = await createCertificateForRegistration({
      event,
      registration,
      actor: req.user,
    });

    return res.status(201).json({
      message: "Certificate issued",
      certificate: getPublicCertificatePayload(certificate),
    });
  } catch (error) {
    const statusCode =
      error?.code === 11000 ? 400 : error?.statusCode || 500;
    const message =
      error?.code === 11000
        ? "Certificate already issued"
        : error.message || "Could not issue certificate";

    return res.status(statusCode).json({ message });
  }
};

export const issueEventRegistrationCertificateUpload = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Only organizer can issue certificates",
      });
    }

    const registration = await EventRegistration.findOne({
      _id: req.params.registrationId,
      eventId: event._id,
    });

    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    const existing = await EventCertificate.findOne({
      registrationId: registration._id,
    });

    if (existing) {
      return res.status(400).json({ message: "Certificate already issued" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Certificate file is required" });
    }

    const certificate = await createCertificateForRegistration({
      event,
      registration,
      actor: req.user,
    });

    const relativePath = `/uploads/certificate-files/${req.file.filename}`;

    certificate.certificateType = "uploaded";
    certificate.fileUrl = relativePath;
    certificate.fileType = req.file.mimetype;
    certificate.originalFileName = req.file.originalname;
    await certificate.save();

    return res.status(201).json({
      message: "Certificate issued with uploaded file",
      certificate: getPublicCertificatePayload(certificate),
    });
  } catch (error) {
    if (req.file) {
      deleteUploadedFile(`/uploads/certificate-files/${req.file.filename}`);
    }

    const statusCode =
      error?.code === 11000 ? 400 : error?.statusCode || 500;
    const message =
      error?.code === 11000
        ? "Certificate already issued"
        : error.message || "Could not issue certificate";

    return res.status(statusCode).json({ message });
  }
};

export const getCertificateById = async (req, res) => {
  try {
    const certificate = await EventCertificate.findOne({
      certificateId: req.params.certificateId,
    }).lean();

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    return res.json(getPublicCertificatePayload(certificate));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch certificate");
  }
};

export const verifyCertificate = async (req, res) => {
  try {
    const certificate = await EventCertificate.findOne({
      verificationCode: req.params.verificationCode,
    }).lean();

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    return res.json(getPublicCertificatePayload(certificate));
  } catch (error) {
    return sendControllerError(res, error, "Could not verify certificate");
  }
};

export const revokeCertificate = async (req, res) => {
  try {
    const certificate = await EventCertificate.findOne({
      certificateId: req.params.certificateId,
    });

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    const event = await Event.findById(certificate.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Only organizer can revoke certificates",
      });
    }

    if (certificate.status === "revoked") {
      return res.status(400).json({ message: "Certificate already revoked" });
    }

    const revokedReason = req.body?.revokedReason?.trim?.() || "";
    certificate.status = "revoked";
    certificate.revokedAt = new Date();
    certificate.revokedReason = revokedReason;
    await certificate.save();

    await createNotification({
      userId: certificate.userId,
      type: "event_certificate_revoked",
      message: revokedReason
        ? `Your certificate for ${certificate.eventTitle} was revoked. Reason: ${revokedReason}`
        : `Your certificate for ${certificate.eventTitle} was revoked`,
    });

    return res.json({
      message: "Certificate revoked",
      certificate: getPublicCertificatePayload(certificate),
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not revoke certificate");
  }
};
