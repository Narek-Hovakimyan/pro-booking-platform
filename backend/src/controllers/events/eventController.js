import Event from "../../models/Event.js";
import EventCertificate from "../../models/EventCertificate.js";
import EventRegistration from "../../models/EventRegistration.js";
import EventReview from "../../models/EventReview.js";
import Salon from "../../models/Salon.js";
import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";
import { createCertificateForRegistration } from "./certificateController.js";
import { createNotification } from "../notifications/notificationController.js";
import {
  getEventAuthorization,
  getEventDetailAuthorization,
} from "../../utils/eventAuthorization.js";
import { getEventNotificationData } from "../../utils/eventNotificationData.js";
import {
  canUserCreateEventForSalon,
  userHasAnyManageableSalon,
} from "../../services/salon/salonMembershipService.js";
import {
  getOrganizerEventsWithStats,
  getPublicEventsWithStats,
} from "../../services/events/publicEventListingService.js";
import {
  getId,
  APPROVED_REGISTRATION_STATUS,
  PENDING_REGISTRATION_STATUS,
  getRegistrationUserId,
  normalizeRegistrationRecord,
  buildUserRegistrationQuery,
  mapRegistrationResponse,
  parseEventPayload,
  validateEventDateTime,
  validateEventNumbers,
} from "../../utils/eventUtils.js";
import { sendControllerError } from "../../utils/controllerError.js";

/**
 * GET /api/events
 * Query params: status (default "upcoming"), salonId, search
 * Returns events with registration count, sorted by date ascending
 */
export const getEvents = async (req, res) => {
  try {
    const result = await getPublicEventsWithStats(req.query);
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch events");
  }
};

/**
 * GET /api/events/mine
 * Auth: authenticated barber organizer
 * Returns events organized by the current user, including private events
 */
export const getMyEvents = async (req, res) => {
  try {
    return res.json(await getOrganizerEventsWithStats(req.user._id));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch your events");
  }
};

/**
 * GET /api/events/:id
 * Returns single event with registered barbers list
 */
export const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .lean();

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canView, canViewParticipants } =
      await getEventDetailAuthorization(event, req.user);

    if (!canView) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Get registered barbers
    let registrationsQuery = EventRegistration.find({
      eventId: event._id,
      status: APPROVED_REGISTRATION_STATUS,
    });

    if (canViewParticipants) {
      registrationsQuery = registrationsQuery
        .populate("userId", "name")
        .populate("barberId", "name");
    }

    const [registrations, reviews] = await Promise.all([
      registrationsQuery,
      EventReview.find({ eventId: event._id })
        .populate("userId", "name avatarUrl")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const registrationCount = registrations.length;
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
          reviews.length
        : 0;

    const response = {
      ...event,
      registrationCount,
      averageRating,
      reviewsCount: reviews.length,
      reviews: reviews.map((review) => ({
        ...review,
        userName: review?.userId?.name || "User",
        userAvatarUrl: review?.userId?.avatarUrl || "",
      })),
    };

    if (canViewParticipants) {
      response.registeredBarbers = registrations.map((r) => ({
        _id: getRegistrationUserId(r),
        name: (r.userId || r.barberId)?.name || "User",
        registeredAt: r.createdAt || r.registeredAt,
      }));
    }

    return res.json(response);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch event");
  }
};

const respondBeforeEventPersistence = (res, uploadedImagePath, status, message) => {
  if (uploadedImagePath) deleteUploadedFile(uploadedImagePath);
  return res.status(status).json({ message });
};

/**
 * POST /api/events
 * Auth: barber with salon owner/admin access or approved salon membership
 */
export const createEvent = async (req, res) => {
  const uploadedImagePath = req.file ? `/uploads/events/${req.file.filename}` : "";
  let eventCreated = false;
  try {
    const {
      title,
      description,
      type,
      instructor,
      instructorBio,
      date,
      time,
      duration,
      price,
      maxParticipants,
      location,
      salonId,
      imageUrl,
      visibility,
      certificatesEnabled,
    } = parseEventPayload(req.body, req.file);

    if (
      !title ||
      !instructor ||
      !date ||
      !time ||
      duration === undefined ||
      duration === null ||
      !location
    ) {
      return respondBeforeEventPersistence(res, uploadedImagePath, 400, "Title, instructor, date, time, duration, and location are required");
    }

    const dateTimeResult = validateEventDateTime(date, time);
    if (!dateTimeResult.isValid) {
      return respondBeforeEventPersistence(res, uploadedImagePath, 400, dateTimeResult.message);
    }

    const numResult = validateEventNumbers({ duration, price, maxParticipants });
    if (!numResult.isValid) {
      return respondBeforeEventPersistence(res, uploadedImagePath, 400, numResult.message);
    }

    if (req.user?.role !== "barber") {
      return respondBeforeEventPersistence(res, uploadedImagePath, 403, "Only barbers who manage a salon can create events");
    }

    if (salonId) {
      const salon = await Salon.findById(salonId);
      if (!salon) {
        return respondBeforeEventPersistence(res, uploadedImagePath, 404, "Salon not found");
      }

      if (!(await canUserCreateEventForSalon(req.user, salon))) {
        return respondBeforeEventPersistence(res, uploadedImagePath, 403, "Only salon owners, admins, or approved salon barbers can create events");
      }
    } else if (!(await userHasAnyManageableSalon(req.user))) {
      return respondBeforeEventPersistence(res, uploadedImagePath, 403, "Only salon owners, admins, or approved salon barbers can create events");
    }

    const event = await Event.create({
      title,
      description,
      type,
      instructor,
      instructorBio,
      date,
      time,
      duration: Number(duration),
      price,
      maxParticipants,
      location,
      salonId: salonId || null,
      organizerId: req.user._id,
      imageUrl,
      visibility,
      certificatesEnabled,
    });
    eventCreated = true;

    const populated = await Event.findById(event._id)
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .lean();

    return res.status(201).json(populated);
  } catch (error) {
    if (uploadedImagePath && !eventCreated) deleteUploadedFile(uploadedImagePath);
    return sendControllerError(res, error, "Could not create event");
  }
};

/**
 * PUT /api/events/:id
 * Auth: organizer or salon owner/admin only
 */
export const updateEvent = async (req, res) => {
  const uploadedImagePath = req.file ? `/uploads/events/${req.file.filename}` : "";
  let eventPersisted = false;
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return respondBeforeEventPersistence(res, uploadedImagePath, 404, "Event not found");
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return respondBeforeEventPersistence(res, uploadedImagePath, 403, "Not authorized to update this event");
    }

    const payload = parseEventPayload(req.body, req.file, {
      applyDefaults: false,
    });
    const previousImageUrl = event.imageUrl || "";
    const allowedFields = [
      "title",
      "description",
      "type",
      "instructor",
      "instructorBio",
      "date",
      "time",
      "duration",
      "price",
      "maxParticipants",
      "location",
      "imageUrl",
      "visibility",
      "status",
      "certificatesEnabled",
    ];

    if (payload.date !== undefined || payload.time !== undefined) {
      const effectiveDate = payload.date !== undefined ? payload.date : event.date;
      const effectiveTime = payload.time !== undefined ? payload.time : event.time;
      const dateTimeResult = validateEventDateTime(effectiveDate, effectiveTime);
      if (!dateTimeResult.isValid) {
        return respondBeforeEventPersistence(res, uploadedImagePath, 400, dateTimeResult.message);
      }
    }

    const numResult = validateEventNumbers({
      duration: payload.duration,
      price: payload.price,
      maxParticipants: payload.maxParticipants,
    });
    if (!numResult.isValid) {
      return respondBeforeEventPersistence(res, uploadedImagePath, 400, numResult.message);
    }

    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        event[field] = payload[field];
      }
    }

    await event.save();
    eventPersisted = true;
    if (uploadedImagePath && previousImageUrl && previousImageUrl !== uploadedImagePath) {
      deleteUploadedFile(previousImageUrl);
    }

    const populated = await Event.findById(event._id)
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .lean();

    return res.json(populated);
  } catch (error) {
    if (uploadedImagePath && !eventPersisted) deleteUploadedFile(uploadedImagePath);
    return sendControllerError(res, error, "Could not update event");
  }
};

/**
 * DELETE /api/events/:id
 * Auth: organizer or salon owner only
 * Sets status to "cancelled"
 */
export const cancelEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to cancel this event",
      });
    }

    event.status = "cancelled";
    await event.save();

    // Notify all registered barbers
    const registrations = await EventRegistration.find({
      eventId: event._id,
      status: {
        $in: [PENDING_REGISTRATION_STATUS, APPROVED_REGISTRATION_STATUS],
      },
    });

    for (const reg of registrations) {
      await createNotification({
        userId: getRegistrationUserId(reg),
        type: "event_cancelled",
        message: `Event "${event.title}" has been cancelled`,
        data: getEventNotificationData(event),
      });
    }

    return res.json({ message: "Event cancelled" });
  } catch (error) {
    return sendControllerError(res, error, "Could not cancel event");
  }
};

/**
 * PUT /api/events/:id/attendance
 * Auth: event organizer or salon owner/admin only
 * Body: { registrations: [{ barberId, attendanceStatus }] }
 */
export const updateAttendance = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to update attendance",
      });
    }

    const { registrations } = req.body;
    if (!Array.isArray(registrations) || registrations.length === 0) {
      return res.status(400).json({ message: "No registrations provided" });
    }

    const validStatuses = ["attended", "no_show"];
    const updated = [];

    for (const reg of registrations) {
      if (!validStatuses.includes(reg.attendanceStatus)) {
        continue;
      }

      const existing = await EventRegistration.findOne({
        eventId: event._id,
        ...buildUserRegistrationQuery(reg.barberId),
        status: APPROVED_REGISTRATION_STATUS,
      });

      if (existing) {
        normalizeRegistrationRecord(existing, reg.barberId);
        existing.attendanceStatus = reg.attendanceStatus;
        existing.attended = reg.attendanceStatus === "attended";
        existing.checkedInAt =
          reg.attendanceStatus === "attended" ? existing.checkedInAt || new Date() : null;
        await existing.save();
        updated.push({
          barberId: reg.barberId,
          attendanceStatus: reg.attendanceStatus,
        });
      }
    }

    return res.json({
      message: `Attendance updated for ${updated.length} barbers`,
      updated,
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not update attendance");
  }
};

/**
 * PATCH /api/events/:id/registrations/:registrationId/check-in
 * Auth: event organizer or salon owner/admin only
 */
export const checkInRegistration = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to check in participants",
      });
    }

    const registration = await EventRegistration.findOne({
      _id: req.params.registrationId,
      eventId: event._id,
    });

    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    normalizeRegistrationRecord(registration);

    if (registration.status !== APPROVED_REGISTRATION_STATUS) {
      return res.status(400).json({
        message: "Only approved participants can be checked in",
      });
    }

    registration.attended = true;
    registration.attendanceStatus = "attended";
    registration.checkedInAt = registration.checkedInAt || new Date();
    await registration.save();

    return res.json({
      message: "Participant marked as attended",
      registration: mapRegistrationResponse(registration),
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not check in participant");
  }
};

/**
 * POST /api/events/:id/issue-certificates
 * Auth: event organizer or salon owner/admin only
 * Legacy bulk route kept for compatibility. Prefer per-registration issuance.
 */
export const issueCertificates = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to issue certificates",
      });
    }

    if (!event.certificatesEnabled) {
      return res.status(400).json({
        message: "Certificates are not enabled for this event",
      });
    }

    const attendedRegistrations = await EventRegistration.find({
      eventId: event._id,
      status: APPROVED_REGISTRATION_STATUS,
      attended: true,
    });

    if (attendedRegistrations.length === 0) {
      return res.status(400).json({
        message: "No attended approved participants",
      });
    }

    let issuedCount = 0;
    const errors = [];

    for (const reg of attendedRegistrations) {
      try {
        await createCertificateForRegistration({
          event,
          registration: reg,
          actor: req.user,
        });
        issuedCount++;
      } catch (error) {
        if (error.message !== "Certificate already issued") {
          errors.push(error.message);
        }
      }
    }

    if (issuedCount > 0) {
      event.certificatesIssued = true;
    }
    await event.save();

    return res.json({
      message: `Certificates issued to ${issuedCount} participants`,
      issuedCount,
      errors,
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not issue certificates");
  }
};
