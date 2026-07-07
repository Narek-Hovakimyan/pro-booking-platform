import EventRegistration from "../models/EventRegistration.js";
import Salon from "../models/Salon.js";
import {
  APPROVED_REGISTRATION_STATUS,
  buildUserRegistrationQuery,
  getId,
} from "./eventUtils.js";
import { canUserManageSalon } from "../services/salon/salonMembershipService.js";

/**
 * Check if a user is authorized to manage an event.
 * Returns { salon, isOrganizer, canManage }.
 */
export async function getEventAuthorization(event, user) {
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
 * Check if a user can view an event detail page and participant names.
 * Public events are viewable by anyone; participant names are manager-only.
 */
export async function getEventDetailAuthorization(event, user) {
  const isPrivate = event?.visibility === "private";

  if (!user) {
    return {
      canView: !isPrivate,
      canViewParticipants: false,
    };
  }

  const { canManage } = await getEventAuthorization(event, user);

  if (!isPrivate) {
    return {
      canView: true,
      canViewParticipants: canManage,
    };
  }

  if (canManage) {
    return {
      canView: true,
      canViewParticipants: true,
    };
  }

  const userId = getId(user);
  const registration = userId
    ? await EventRegistration.findOne({
        eventId: getId(event),
        status: APPROVED_REGISTRATION_STATUS,
        ...buildUserRegistrationQuery(userId),
      })
    : null;

  return {
    canView: Boolean(registration),
    canViewParticipants: false,
  };
}
