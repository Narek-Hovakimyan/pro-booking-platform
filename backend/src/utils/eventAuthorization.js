import Salon from "../models/Salon.js";
import { getId } from "./eventUtils.js";
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
