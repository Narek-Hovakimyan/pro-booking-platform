import Event from "../../models/Event.js";
import EventCertificate from "../../models/EventCertificate.js";
import EventRegistration from "../../models/EventRegistration.js";
import EventReview from "../../models/EventReview.js";
import { createNotification } from "../notifications/notificationController.js";
import { getEventAuthorization } from "../../utils/eventAuthorization.js";
import { getEventNotificationData } from "../../utils/eventNotificationData.js";
import {
  getId,
  APPROVED_REGISTRATION_STATUS,
  PENDING_REGISTRATION_STATUS,
  CANCELLED_REGISTRATION_STATUS,
  REJECTED_REGISTRATION_STATUS,
  WAITLISTED_REGISTRATION_STATUS,
  getRegistrationUserId,
  normalizeRegistrationRecord,
  buildUserRegistrationQuery,
  mapCertificateResponse,
  mapRegistrationResponse,
} from "../../utils/eventUtils.js";
import { sendControllerError } from "../../utils/controllerError.js";

const countApprovedRegistrations = async (eventId) =>
  EventRegistration.countDocuments({
    eventId,
    status: APPROVED_REGISTRATION_STATUS,
  });

/**
 * POST /api/events/:id/register
 * Auth: authenticated user
 */
export const registerForEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.status !== "upcoming") {
      return res.status(400).json({ message: "Event is not open for registration" });
    }

    // Organizer cannot register for their own event
    const userId = req.user._id;
    const eventOrganizerId = getId(event.organizerId);
    if (eventOrganizerId && String(eventOrganizerId) === String(userId)) {
      return res.status(400).json({
        message: "Organizer cannot register for their own event",
      });
    }

    const existing = await EventRegistration.findOne({
      eventId: event._id,
      ...buildUserRegistrationQuery(userId),
    });
    normalizeRegistrationRecord(existing, userId);

    if (existing?.status === PENDING_REGISTRATION_STATUS) {
      return res.status(400).json({ message: "Registration already pending" });
    }

    if (existing?.status === APPROVED_REGISTRATION_STATUS) {
      return res.status(400).json({
        message: "You are already approved for this event",
      });
    }

    if (existing?.status === REJECTED_REGISTRATION_STATUS) {
      return res.status(400).json({
        message: "Your registration was already rejected for this event",
      });
    }

    if (existing?.status === WAITLISTED_REGISTRATION_STATUS) {
      return res.status(400).json({
        message: "You are already on the waiting list for this event",
      });
    }

    const currentCount = await countApprovedRegistrations(event._id);

    const shouldWaitlist =
      Number(event.maxParticipants || 0) > 0 &&
      currentCount >= Number(event.maxParticipants || 0);

    let registration;

    if (existing && existing.status === CANCELLED_REGISTRATION_STATUS) {
      existing.status = shouldWaitlist
        ? WAITLISTED_REGISTRATION_STATUS
        : PENDING_REGISTRATION_STATUS;
      existing.userId = existing.userId || userId;
      existing.attendanceStatus = "pending";
      existing.attended = false;
      existing.checkedInAt = null;
      existing.message = req.body?.message || existing.message || "";
      existing.rejectionReason = "";
      existing.reminderSentAt = null;
      registration = await existing.save();
    } else {
      registration = await EventRegistration.create({
        eventId: event._id,
        userId,
        message: req.body?.message || "",
        status: shouldWaitlist
          ? WAITLISTED_REGISTRATION_STATUS
          : PENDING_REGISTRATION_STATUS,
      });
    }

    await createNotification({
      userId: event.organizerId,
      type: "event_registration_request",
      message: `${req.user.name} requested to join your event: ${event.title}`,
      data: getEventNotificationData(event, registration),
    });

    return res.json({
      message: shouldWaitlist
        ? "Event is full. You have been added to the waiting list"
        : "Registration request sent",
      registrationCount: currentCount,
      registration: {
        _id: registration._id,
        status: registration.status,
        message: registration.message || "",
        rejectionReason: registration.rejectionReason || "",
      },
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not register for event", {
      duplicateKeyMessage: "Registration already pending",
      duplicateKeyStatus: 400,
    });
  }
};

/**
 * DELETE /api/events/:id/register
 * Auth: authenticated user
 */
export const cancelRegistration = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const registration = await EventRegistration.findOne({
      eventId: event._id,
      ...buildUserRegistrationQuery(req.user._id),
      status: {
        $in: [
          PENDING_REGISTRATION_STATUS,
          WAITLISTED_REGISTRATION_STATUS,
        ],
      },
    });

    if (!registration) {
      // Check if there is an approved registration that the participant is trying to cancel
      const approvedRegistration = await EventRegistration.findOne({
        eventId: event._id,
        ...buildUserRegistrationQuery(req.user._id),
        status: APPROVED_REGISTRATION_STATUS,
      });

      if (approvedRegistration) {
        return res.status(400).json({
          message: "Approved registration cannot be cancelled by participant",
        });
      }

      return res.status(404).json({ message: "Registration not found" });
    }

    normalizeRegistrationRecord(registration, req.user._id);
    registration.status = CANCELLED_REGISTRATION_STATUS;
    await registration.save();

    await createNotification({
      userId: event.organizerId,
      type: "event_unregistration",
      message: `${req.user.name} cancelled the registration request for "${event.title}"`,
      data: getEventNotificationData(event, registration),
    });

    const newCount = await countApprovedRegistrations(event._id);

    return res.json({
      message: "Registration cancelled",
      registrationCount: newCount,
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not cancel registration");
  }
};

/**
 * GET /api/events/my-registrations
 * Auth: authenticated user
 * Returns all event registrations for the current user
 */
export const getMyRegistrations = async (req, res) => {
  try {
    const registrations = await EventRegistration.find({
      ...buildUserRegistrationQuery(req.user._id),
    })
      .populate({
        path: "eventId",
        populate: [
          { path: "salonId", select: "name" },
          { path: "organizerId", select: "name" },
        ],
      })
      .sort({ createdAt: -1 })
      .populate("userId", "name email phone city avatarUrl role")
      .populate("barberId", "name email phone city avatarUrl role")
      .lean();
    const registrationIds = registrations.map((registration) => registration._id);
    const [existingReviews, certificates] = await Promise.all([
      EventReview.find({
        registrationId: { $in: registrationIds },
        userId: req.user._id,
      }).lean(),
      EventCertificate.find({
        registrationId: { $in: registrationIds },
      }).lean(),
    ]);
    const reviewedRegistrationIds = new Set(
      existingReviews.map((review) => String(review.registrationId))
    );
    const certificateByRegistrationId = new Map(
      certificates.map((certificate) => [
        String(certificate.registrationId),
        certificate,
      ])
    );

    const result = registrations
      .filter((r) => r.eventId)
      .map((r) => {
        const certificate = certificateByRegistrationId.get(String(r._id));

        return {
          ...r.eventId,
          eventId: r.eventId?._id,
          registrationId: r._id,
          registrationStatus: r.status,
          rejectionReason: r.rejectionReason || "",
          registrationMessage: r.message || "",
          attendanceStatus: r.attendanceStatus,
          attended: Boolean(r.attended),
          checkedInAt: r.checkedInAt || null,
          registeredAt: r.createdAt || r.registeredAt,
          createdAt: r.createdAt || r.registeredAt,
          hasEventReview: reviewedRegistrationIds.has(String(r._id)),
          certificate: mapCertificateResponse(certificate),
          certificateIssuedAt:
            r.certificateIssuedAt || certificate?.issuedAt || null,
        };
      });

    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch registrations");
  }
};

/**
 * GET /api/events/:id/registrations
 * Auth: event organizer or salon owner/admin only
 * Returns all registrations with user details
 */
export const getEventRegistrations = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to view registrations",
      });
    }

    const registrations = await EventRegistration.find({
      eventId: event._id,
    })
      .populate("userId", "name email phone city avatarUrl role")
      .populate("barberId", "name email phone city avatarUrl role")
      .sort({ createdAt: 1 })
      .lean();

    const certificates = await EventCertificate.find({
      registrationId: { $in: registrations.map((registration) => registration._id) },
    }).lean();
    const certificateByRegistrationId = new Map(
      certificates.map((certificate) => [
        String(certificate.registrationId),
        certificate,
      ])
    );

    const result = registrations.map((registration) =>
      mapRegistrationResponse(
        registration,
        certificateByRegistrationId.get(String(registration._id))
      )
    );

    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch registrations");
  }
};

/**
 * PATCH /api/events/:id/registrations/:registrationId/waitlist
 * Auth: event organizer or salon owner/admin only
 */
export const waitlistRegistration = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to manage registrations",
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

    if (
      ![
        PENDING_REGISTRATION_STATUS,
        APPROVED_REGISTRATION_STATUS,
        WAITLISTED_REGISTRATION_STATUS,
      ].includes(registration.status)
    ) {
      return res.status(400).json({
        message: "Only pending or approved registrations can be waitlisted",
      });
    }

    registration.status = WAITLISTED_REGISTRATION_STATUS;
    registration.attendanceStatus = "pending";
    registration.attended = false;
    registration.checkedInAt = null;
    registration.reminderSentAt = null;
    await registration.save();

    await createNotification({
      userId: getRegistrationUserId(registration),
      type: "event_registration_waitlisted",
      message: `Your registration for ${event.title} was moved to the waiting list`,
      data: getEventNotificationData(event, registration),
    });

    return res.json({
      message: "Registration moved to waiting list",
      registration: mapRegistrationResponse(registration),
      registrationCount: await countApprovedRegistrations(event._id),
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not update waiting list");
  }
};

/**
 * PATCH /api/events/:id/registrations/:registrationId/approve
 * Auth: event organizer or salon owner/admin only
 */
export const approveRegistration = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to approve registrations",
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

    if (registration.status === APPROVED_REGISTRATION_STATUS) {
      return res.status(400).json({ message: "Registration is already approved" });
    }

    if (
      ![PENDING_REGISTRATION_STATUS, WAITLISTED_REGISTRATION_STATUS].includes(
        registration.status
      )
    ) {
      return res.status(400).json({
        message: "Only pending or waitlisted registrations can be approved",
      });
    }

    const maxParticipants = Number(event.maxParticipants || 0);

    if (maxParticipants > 0) {
      const approvedCount = await countApprovedRegistrations(event._id);
      if (approvedCount >= maxParticipants) {
        return res.status(400).json({ message: "Event is full" });
      }
    }

    const originalStatus = registration.status;
    const originalApprovalState = {
      status: originalStatus,
      rejectionReason: registration.rejectionReason || "",
      attendanceStatus: registration.attendanceStatus || "pending",
      attended: Boolean(registration.attended),
      checkedInAt: registration.checkedInAt || null,
      reminderSentAt: registration.reminderSentAt || null,
    };

    // Atomic approval: only update if still pending or waitlisted
    const updated = await EventRegistration.findOneAndUpdate(
      {
        _id: registration._id,
        eventId: event._id,
        status: {
          $in: [PENDING_REGISTRATION_STATUS, WAITLISTED_REGISTRATION_STATUS],
        },
      },
      {
        $set: {
          status: APPROVED_REGISTRATION_STATUS,
          rejectionReason: "",
          attendanceStatus: "pending",
          attended: false,
          checkedInAt: null,
          reminderSentAt: null,
        },
      },
      { new: true, returnDocument: "after" }
    );

    if (!updated) {
      return res.status(400).json({
        message: "Registration is no longer pending or waitlisted",
      });
    }

    // Post-approval recount guard (minimizes race window)
    if (maxParticipants > 0) {
      const newCount = await countApprovedRegistrations(event._id);
      if (newCount > maxParticipants) {
        await EventRegistration.findOneAndUpdate(
          {
            _id: registration._id,
            eventId: event._id,
            status: APPROVED_REGISTRATION_STATUS,
          },
          { $set: originalApprovalState }
        );
        return res.status(400).json({ message: "Event is full" });
      }
    }

    await createNotification({
      userId: getRegistrationUserId(registration),
      type: "event_registration_approved",
      message: `Your registration for ${event.title} was approved`,
      data: getEventNotificationData(event, registration),
    });

    const finalCount = await countApprovedRegistrations(event._id);

    return res.json({
      message: "Registration approved",
      registration: mapRegistrationResponse(updated),
      registrationCount: finalCount,
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not approve registration");
  }
};

/**
 * PATCH /api/events/:id/registrations/:registrationId/reject
 * Auth: event organizer or salon owner/admin only
 */
export const rejectRegistration = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to reject registrations",
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

    if (registration.status === REJECTED_REGISTRATION_STATUS) {
      return res.status(400).json({ message: "Registration is already rejected" });
    }

    if (
      ![PENDING_REGISTRATION_STATUS, WAITLISTED_REGISTRATION_STATUS].includes(
        registration.status
      )
    ) {
      return res.status(400).json({
        message: "Only pending or waitlisted registrations can be rejected",
      });
    }

    const rejectionReason = req.body?.rejectionReason?.trim?.() || "";

    registration.status = REJECTED_REGISTRATION_STATUS;
    registration.rejectionReason = rejectionReason;
    await registration.save();

    await createNotification({
      userId: getRegistrationUserId(registration),
      type: "event_registration_rejected",
      message: rejectionReason
        ? `Your registration for ${event.title} was rejected. Reason: ${rejectionReason}`
        : `Your registration for ${event.title} was rejected`,
      data: getEventNotificationData(event, registration),
    });

    return res.json({
      message: "Registration rejected",
      registration: mapRegistrationResponse(registration),
      registrationCount: await countApprovedRegistrations(event._id),
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not reject registration");
  }
};
