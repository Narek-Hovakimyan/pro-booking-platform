import Event from "../models/Event.js";
import EventCertificate from "../models/EventCertificate.js";
import EventRegistration from "../models/EventRegistration.js";
import EventReview from "../models/EventReview.js";
import Salon from "../models/Salon.js";
import { createCertificateForRegistration } from "./certificateController.js";
import { createNotification } from "./notificationController.js";
import { getEventAuthorization } from "../utils/eventAuthorization.js";
import { getEventNotificationData } from "../utils/eventNotificationData.js";
import {
  canUserCreateEventForSalon,
  userHasAnyManageableSalon,
} from "../services/salon/salonMembershipService.js";
import {
  getId,
  APPROVED_REGISTRATION_STATUS,
  PENDING_REGISTRATION_STATUS,
  getRegistrationUserId,
  normalizeRegistrationRecord,
  buildUserRegistrationQuery,
  mapRegistrationResponse,
  parseEventPayload,
  isEventInPast,
  validateEventDateTime,
  validateEventNumbers,
} from "../utils/eventUtils.js";
import { escapeRegex, normalizeSearch, sendControllerError } from "../utils/controllerError.js";

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
      const { term, isTooLong } = normalizeSearch(search);
      if (isTooLong) {
        return res.status(400).json({ message: "Search term is too long" });
      }
      if (term) {
        const escaped = escapeRegex(term);
        filter.$or = [
          { title: { $regex: escaped, $options: "i" } },
          { instructor: { $regex: escaped, $options: "i" } },
          { location: { $regex: escaped, $options: "i" } },
        ];
      }
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
    const events = await Event.find({ organizerId: req.user._id })
      .populate("salonId", "name")
      .populate("organizerId", "name")
      .sort({ date: 1, time: 1 })
      .lean();

    const eventIds = events.map((event) => event._id);

    let regCountMap = new Map();
    let attendedCountMap = new Map();
    let certificatesCountMap = new Map();
    let reviewStatsMap = new Map();

    if (eventIds.length > 0) {
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

      regCountMap = new Map(
        registrations.map((r) => [String(r._id), Number(r.count || 0)])
      );
      attendedCountMap = new Map(
        attendedRegs.map((r) => [String(r._id), Number(r.count || 0)])
      );
      certificatesCountMap = new Map(
        certificates.map((c) => [String(c._id), Number(c.count || 0)])
      );
      reviewStatsMap = new Map(
        reviewStats.map((s) => [
          String(s._id),
          {
            averageRating: Number(s.averageRating || 0),
            reviewsCount: Number(s.reviewsCount || 0),
          },
        ])
      );
    }

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
    return sendControllerError(res, error, "Could not fetch event");
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

    if (
      !title ||
      !instructor ||
      !date ||
      !time ||
      duration === undefined ||
      duration === null ||
      !location
    ) {
      return res.status(400).json({
        message: "Title, instructor, date, time, duration, and location are required",
      });
    }

    // Validate date/time
    const dateTimeResult = validateEventDateTime(date, time);
    if (!dateTimeResult.isValid) {
      return res.status(400).json({ message: dateTimeResult.message });
    }

    // Validate numeric fields
    const numResult = validateEventNumbers({ duration, price, maxParticipants });
    if (!numResult.isValid) {
      return res.status(400).json({ message: numResult.message });
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
      price,
      maxParticipants,
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
    return sendControllerError(res, error, "Could not create event");
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

    const payload = parseEventPayload(req.body, req.file, {
      applyDefaults: false,
    });
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

    // Validate date/time if date or time changed
    if (payload.date !== undefined || payload.time !== undefined) {
      const effectiveDate = payload.date !== undefined ? payload.date : event.date;
      const effectiveTime = payload.time !== undefined ? payload.time : event.time;
      const dateTimeResult = validateEventDateTime(effectiveDate, effectiveTime);
      if (!dateTimeResult.isValid) {
        return res.status(400).json({ message: dateTimeResult.message });
      }
    }

    // Validate numeric fields if provided
    const numResult = validateEventNumbers({
      duration: payload.duration,
      price: payload.price,
      maxParticipants: payload.maxParticipants,
    });
    if (!numResult.isValid) {
      return res.status(400).json({ message: numResult.message });
    }

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
