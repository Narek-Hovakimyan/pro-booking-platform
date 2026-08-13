import Event from "../models/Event.js";
import EventRegistration from "../models/EventRegistration.js";
import { getEventAuthorization } from "../utils/eventAuthorization.js";
import {
  APPROVED_REGISTRATION_STATUS,
  PENDING_REGISTRATION_STATUS,
  REJECTED_REGISTRATION_STATUS,
  WAITLISTED_REGISTRATION_STATUS,
  getId,
} from "../utils/eventUtils.js";

export const countApprovedRegistrations = async (
  eventId,
  { EventRegistrationModel = EventRegistration } = {}
) =>
  EventRegistrationModel.countDocuments({
    eventId,
    status: APPROVED_REGISTRATION_STATUS,
  });

export const loadEventOrError = async ({
  eventId,
  EventModel = Event,
} = {}) => {
  const event = await EventModel.findById(eventId);

  if (!event) {
    return { error: "Event not found", code: 404 };
  }

  return { event };
};

export const loadManageableEventOrError = async ({
  eventId,
  user,
  unauthorizedMessage,
  EventModel = Event,
  authorizeEvent = getEventAuthorization,
} = {}) => {
  const eventResult = await loadEventOrError({ eventId, EventModel });
  if (eventResult.error) {
    return eventResult;
  }

  const authorization = await authorizeEvent(eventResult.event, user);
  if (!authorization.canManage) {
    return { error: unauthorizedMessage, code: 403 };
  }

  return { event: eventResult.event, authorization };
};

export const validateRegistrationRequestPreconditions = ({
  event,
  userId,
  existingRegistration,
  approvedCount,
  includeCapacity = true,
}) => {
  if (event.status !== "upcoming") {
    return { error: "Event is not open for registration", code: 400 };
  }

  const eventOrganizerId = getId(event.organizerId);
  if (eventOrganizerId && String(eventOrganizerId) === String(userId)) {
    return {
      error: "Organizer cannot register for their own event",
      code: 400,
    };
  }

  if (existingRegistration?.status === PENDING_REGISTRATION_STATUS) {
    return { error: "Registration already pending", code: 400 };
  }

  if (existingRegistration?.status === APPROVED_REGISTRATION_STATUS) {
    return {
      error: "You are already approved for this event",
      code: 400,
    };
  }

  if (existingRegistration?.status === REJECTED_REGISTRATION_STATUS) {
    return {
      error: "Your registration was already rejected for this event",
      code: 400,
    };
  }

  if (existingRegistration?.status === WAITLISTED_REGISTRATION_STATUS) {
    return {
      error: "You are already on the waiting list for this event",
      code: 400,
    };
  }

  if (!includeCapacity) {
    return { allowed: true };
  }

  const maxParticipants = Number(event.maxParticipants || 0);

  return {
    shouldWaitlist: maxParticipants > 0 && approvedCount >= maxParticipants,
  };
};

export const validateCancellationPreconditions = ({
  registration,
  approvedRegistration,
}) => {
  if (registration) {
    return { allowed: true };
  }

  if (approvedRegistration) {
    return {
      error: "Approved registration cannot be cancelled by participant",
      code: 400,
    };
  }

  return { error: "Registration not found", code: 404 };
};

export const validateWaitlistTransition = (registration) => {
  if (
    ![
      PENDING_REGISTRATION_STATUS,
      APPROVED_REGISTRATION_STATUS,
      WAITLISTED_REGISTRATION_STATUS,
    ].includes(registration.status)
  ) {
    return {
      error: "Only pending or approved registrations can be waitlisted",
      code: 400,
    };
  }

  return { allowed: true };
};

export const validateApproveTransition = ({
  registration,
  approvedCount,
  maxParticipants,
  includeCapacity = true,
}) => {
  if (registration.status === APPROVED_REGISTRATION_STATUS) {
    return { error: "Registration is already approved", code: 400 };
  }

  if (
    ![PENDING_REGISTRATION_STATUS, WAITLISTED_REGISTRATION_STATUS].includes(
      registration.status
    )
  ) {
    return {
      error: "Only pending or waitlisted registrations can be approved",
      code: 400,
    };
  }

  if (!includeCapacity) {
    return { allowed: true };
  }

  if (Number(maxParticipants || 0) > 0 && approvedCount >= Number(maxParticipants || 0)) {
    return { error: "Event is full", code: 400 };
  }

  return { allowed: true };
};

export const validateRejectTransition = (registration) => {
  if (registration.status === REJECTED_REGISTRATION_STATUS) {
    return { error: "Registration is already rejected", code: 400 };
  }

  if (
    ![PENDING_REGISTRATION_STATUS, WAITLISTED_REGISTRATION_STATUS].includes(
      registration.status
    )
  ) {
    return {
      error: "Only pending or waitlisted registrations can be rejected",
      code: 400,
    };
  }

  return { allowed: true };
};
