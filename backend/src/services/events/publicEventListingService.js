import Event from "../../models/Event.js";
import EventCertificate from "../../models/EventCertificate.js";
import EventRegistration from "../../models/EventRegistration.js";
import EventReview from "../../models/EventReview.js";
import { escapeRegex, normalizeSearch } from "../../utils/controllerError.js";
import { APPROVED_REGISTRATION_STATUS, isEventInPast } from "../../utils/eventUtils.js";
import {
  isValidObjectIdString,
  parseOptionalPagination,
} from "../../utils/requestValidation.js";

export const getPublicEventsWithStats = async (query = {}) => {
  const { salonId, search } = query;
  const filter = { visibility: "public" };

  if (salonId) {
    if (!isValidObjectIdString(salonId)) {
      return { statusCode: 400, body: { message: "Invalid salon ID" } };
    }
    filter.salonId = salonId;
  }
  if (search !== undefined && typeof search !== "string") {
    return { statusCode: 400, body: { message: "Search term must be a string" } };
  }
  if (search) {
    const { term, isTooLong } = normalizeSearch(search);
    if (isTooLong) {
      return { statusCode: 400, body: { message: "Search term is too long" } };
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

  const pagination = parseOptionalPagination(query);
  if (!pagination.ok) {
    return { statusCode: 400, body: { message: pagination.error } };
  }

  const events = await Event.find(filter)
    .populate("salonId", "name")
    .populate("organizerId", "name")
    .sort({ date: 1, time: 1, _id: 1 })
    .lean();

  const upcomingEvents = events.filter((event) => !isEventInPast(event));
  const pageEvents = pagination.value.enabled
    ? upcomingEvents.slice(
        pagination.value.skip,
        pagination.value.skip + pagination.value.limit
      )
    : upcomingEvents;
  const eventIds = pageEvents.map((event) => event._id);

  let regCountMap = {};
  let reviewStatsMap = {};

  if (pageEvents.length > 0) {
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
    for (const registration of registrations) {
      regCountMap[registration._id.toString()] = registration.count;
    }
    reviewStatsMap = {};
    for (const stat of reviewStats) {
      reviewStatsMap[stat._id.toString()] = {
        averageRating: Number(stat.averageRating || 0),
        reviewsCount: Number(stat.reviewsCount || 0),
      };
    }
  }

  return {
    statusCode: 200,
    body: pageEvents.map((event) => ({
      ...event,
      registrationCount: regCountMap[event._id.toString()] || 0,
      averageRating: reviewStatsMap[event._id.toString()]?.averageRating || 0,
      reviewsCount: reviewStatsMap[event._id.toString()]?.reviewsCount || 0,
    })),
  };
};

export const getOrganizerEventsWithStats = async (organizerId) => {
  const events = await Event.find({ organizerId })
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
      registrations.map((registration) => [
        String(registration._id),
        Number(registration.count || 0),
      ])
    );
    attendedCountMap = new Map(
      attendedRegs.map((registration) => [
        String(registration._id),
        Number(registration.count || 0),
      ])
    );
    certificatesCountMap = new Map(
      certificates.map((certificate) => [
        String(certificate._id),
        Number(certificate.count || 0),
      ])
    );
    reviewStatsMap = new Map(
      reviewStats.map((stat) => [
        String(stat._id),
        {
          averageRating: Number(stat.averageRating || 0),
          reviewsCount: Number(stat.reviewsCount || 0),
        },
      ])
    );
  }

  return events.map((event) => ({
    ...event,
    registrationCount: regCountMap.get(String(event._id)) || 0,
    attendedCount: attendedCountMap.get(String(event._id)) || 0,
    certificatesCount: certificatesCountMap.get(String(event._id)) || 0,
    averageRating: reviewStatsMap.get(String(event._id))?.averageRating || 0,
    reviewsCount: reviewStatsMap.get(String(event._id))?.reviewsCount || 0,
  }));
};
