import Event from "../models/Event.js";
import EventCertificate from "../models/EventCertificate.js";
import EventRegistration from "../models/EventRegistration.js";
import EventReview from "../models/EventReview.js";
import Salon from "../models/Salon.js";
import { createCertificateForRegistration } from "./certificateController.js";
import { createNotification } from "./notificationController.js";
import {
  canUserCreateEventForSalon,
  canUserManageSalon,
  userHasAnyManageableSalon,
} from "../services/salon/salonMembershipService.js";
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
  parseEventPayload,
  isEventInPast,
} from "../utils/eventUtils.js";

const countApprovedRegistrations = async (eventId) =>
  EventRegistration.countDocuments({
    eventId,
    status: APPROVED_REGISTRATION_STATUS,
  });

async function getEventAuthorization(event, user) {
  const userId = getId(user);
  const eventOrganizerId = getId(event?.organizerId);
  const salonId = getId(event?.salonId);
  const salon = salonId ? await Salon.findById(salonId) : null;
  const isOrganizer = String(eventOrganizerId || "") === String(userId || "");
  const canManageSalon = salon ? canUserManageSalon(user, salon) : false;

  return {
    salon,
    isOrganizer,
    canManage: isOrganizer || canManageSalon,
  };
}

/**
 * GET /api/events
 * Query params: status (default "upcoming"), salonId, search
 * Returns events with registration count, sorted by date ascending
 */
export const getEvents = async (req, res) => {
  try {
    const { salonId, search } = req.query;
    const filter = { visibility: "public" };

    if (salonId) filter.salonId = salonId;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { instructor: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const events = await Event.find(filter)
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .sort({ date: 1, time: 1 })
      .lean();

    // Exclude past events from public listing
    const upcomingEvents = events.filter((event) => !isEventInPast(event));

    // Get registration counts only for upcoming events (past events are excluded)
    const eventIds = upcomingEvents.map((e) => e._id);

    let regCountMap = {};
    let reviewStatsMap = {};

    if (upcomingEvents.length > 0) {
      const [registrations, reviewStats] = await Promise.all([
        EventRegistration.aggregate([
          {
            $match: {
              eventId: { $in: eventIds },
              status: APPROVED_REGISTRATION_STATUS,
            },
          },
          { $group: { _id: "$eventId", count: { $sum: 1 } } },
        ]),
        EventReview.aggregate([
          { $match: { eventId: { $in: eventIds } } },
          {
            $group: {
              _id: "$eventId",
              averageRating: { $avg: "$rating" },
              reviewsCount: { $sum: 1 },
            },
          },
        ]),
      ]);
      regCountMap = {};
      for (const r of registrations) {
        regCountMap[r._id.toString()] = r.count;
      }
      reviewStatsMap = {};
      for (const stat of reviewStats) {
        reviewStatsMap[stat._id.toString()] = {
          averageRating: Number(stat.averageRating || 0),
          reviewsCount: Number(stat.reviewsCount || 0),
        };
      }
    }

    const result = upcomingEvents.map((event) => ({
      ...event,
      registrationCount: regCountMap[event._id.toString()] || 0,
      averageRating: reviewStatsMap[event._id.toString()]?.averageRating || 0,
      reviewsCount: reviewStatsMap[event._id.toString()]?.reviewsCount || 0,
    }));

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch events",
    });
  }
};

/**
 * GET /api/events/mine
 * Auth: authenticated barber organizer
 * Returns events organized by the current user, including private events
 */
export const getMyEvents = async (req, res) => {
  try {
    const events = await Event.find({ organizerId: req.user._id })
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .sort({ date: 1, time: 1 })
      .lean();

    const eventIds = events.map((event) => event._id);
    const [registrations, attendedRegs, certificates, reviewStats] = await Promise.all([
      EventRegistration.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            status: APPROVED_REGISTRATION_STATUS,
          },
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } },
      ]),
      EventRegistration.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            attended: true,
          },
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } },
      ]),
      EventCertificate.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            status: "issued",
          },
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } },
      ]),
      EventReview.aggregate([
        { $match: { eventId: { $in: eventIds } } },
        {
          $group: {
            _id: "$eventId",
            averageRating: { $avg: "$rating" },
            reviewsCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const regCountMap = new Map(
      registrations.map((registration) => [
        String(registration._id),
        Number(registration.count || 0),
      ])
    );
    const attendedCountMap = new Map(
      attendedRegs.map((reg) => [
        String(reg._id),
        Number(reg.count || 0),
      ])
    );
    const certificatesCountMap = new Map(
      certificates.map((cert) => [
        String(cert._id),
        Number(cert.count || 0),
      ])
    );
    const reviewStatsMap = new Map(
      reviewStats.map((stat) => [
        String(stat._id),
        {
          averageRating: Number(stat.averageRating || 0),
          reviewsCount: Number(stat.reviewsCount || 0),
        },
      ])
    );

    return res.json(
      events.map((event) => ({
        ...event,
        registrationCount: regCountMap.get(String(event._id)) || 0,
        attendedCount: attendedCountMap.get(String(event._id)) || 0,
        certificatesCount: certificatesCountMap.get(String(event._id)) || 0,
        averageRating: reviewStatsMap.get(String(event._id))?.averageRating || 0,
        reviewsCount: reviewStatsMap.get(String(event._id))?.reviewsCount || 0,
      }))
    );
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch your events",
    });
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

    // Get registered barbers
    const [registrations, reviews] = await Promise.all([
      EventRegistration.find({
        eventId: event._id,
        status: APPROVED_REGISTRATION_STATUS,
      })
        .populate("userId", "name email")
        .populate("barberId", "name email"),
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

    return res.json({
      ...event,
      registrationCount,
      averageRating,
      reviewsCount: reviews.length,
      registeredBarbers: registrations.map((r) => ({
        _id: getRegistrationUserId(r),
        name: (r.userId || r.barberId)?.name || "User",
        registeredAt: r.createdAt || r.registeredAt,
      })),
      reviews: reviews.map((review) => ({
        ...review,
        userName: review?.userId?.name || "User",
        userAvatarUrl: review?.userId?.avatarUrl || "",
      })),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch event",
    });
  }
};

/**
 * POST /api/events
 * Auth: barber with salon owner/admin access or approved salon membership
 */
export const createEvent = async (req, res) => {
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

    if (!title || !instructor || !date || !time || !duration || !location) {
      return res.status(400).json({
        message: "Title, instructor, date, time, duration, and location are required",
      });
    }

    if (req.user?.role !== "barber") {
      return res.status(403).json({
        message: "Only barbers who manage a salon can create events",
      });
    }

    if (salonId) {
      // Verify user has access to this salon
      const salon = await Salon.findById(salonId);
      if (!salon) {
        return res.status(404).json({ message: "Salon not found" });
      }

      if (!(await canUserCreateEventForSalon(req.user, salon))) {
        return res.status(403).json({
          message: "Only salon owners, admins, or approved salon barbers can create events",
        });
      }
    } else if (!(await userHasAnyManageableSalon(req.user))) {
      return res.status(403).json({
        message: "Only salon owners, admins, or approved salon barbers can create events",
      });
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
      price: Number(price) || 0,
      maxParticipants: Number(maxParticipants) || 20,
      location,
      salonId: salonId || null,
      organizerId: req.user._id,
      imageUrl,
      visibility,
      certificatesEnabled,
    });

    const populated = await Event.findById(event._id)
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .lean();

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not create event",
    });
  }
};

/**
 * PUT /api/events/:id
 * Auth: organizer or salon owner/admin only
 */
export const updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { canManage } = await getEventAuthorization(event, req.user);
    if (!canManage) {
      return res.status(403).json({
        message: "Not authorized to update this event",
      });
    }

    const payload = parseEventPayload(req.body, req.file);
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

    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        event[field] = payload[field];
      }
    }

    await event.save();

    const populated = await Event.findById(event._id)
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .lean();

    return res.json(populated);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update event",
    });
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
      });
    }

    return res.json({ message: "Event cancelled" });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not cancel event",
    });
  }
};

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
    if (error.code === 11000) {
      return res.status(400).json({ message: "Registration already pending" });
    }
    return res.status(400).json({
      message: error.message || "Could not register for event",
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
    });

    const newCount = await countApprovedRegistrations(event._id);

    return res.json({
      message: "Registration cancelled",
      registrationCount: newCount,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not cancel registration",
    });
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
    return res.status(500).json({
      message: error.message || "Could not fetch registrations",
    });
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
    return res.status(500).json({
      message: error.message || "Could not fetch registrations",
    });
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
    return res.status(500).json({
      message: error.message || "Could not update attendance",
    });
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
    });

    return res.json({
      message: "Registration moved to waiting list",
      registration: mapRegistrationResponse(registration),
      registrationCount: await countApprovedRegistrations(event._id),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update waiting list",
    });
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
    return res.status(400).json({
      message: error.message || "Could not check in participant",
    });
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
    return res.status(500).json({
      message: error.message || "Could not issue certificates",
    });
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

    const approvedCount = await countApprovedRegistrations(event._id);
    if (approvedCount >= event.maxParticipants) {
      return res.status(400).json({ message: "Event is full" });
    }

    registration.status = APPROVED_REGISTRATION_STATUS;
    registration.rejectionReason = "";
    registration.attendanceStatus = "pending";
    registration.attended = false;
    registration.checkedInAt = null;
    registration.reminderSentAt = null;
    await registration.save();

    await createNotification({
      userId: getRegistrationUserId(registration),
      type: "event_registration_approved",
      message: `Your registration for ${event.title} was approved`,
    });

    return res.json({
      message: "Registration approved",
      registration: mapRegistrationResponse(registration),
      registrationCount: approvedCount + 1,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not approve registration",
    });
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
    });

    return res.json({
      message: "Registration rejected",
      registration: mapRegistrationResponse(registration),
      registrationCount: await countApprovedRegistrations(event._id),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not reject registration",
    });
  }
};
