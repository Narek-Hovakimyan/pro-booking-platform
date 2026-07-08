import User from "../../models/User.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import { isWorkingSpecialist } from "../salon/salonRelationshipService.js";
import {
  getIdString,
  getIdsForQuery,
  subscriptionHasPaidAccess,
  resolveQuery,
  SUBSCRIPTION_SEAT_BARBER_FIELDS,
} from "./subscriptionHelpers.js";

/**
 * Fetch a barber's salon membership info.
 */
export const fetchBarberMembership = async (barberId) => {
  const query = User.findById(barberId);
  if (query && typeof query.select === "function") {
    return resolveQuery(query.select("salon salonStatus salons role"));
  }

  return query;
};

/**
 * Fetch membership info for multiple barbers.
 */
export const fetchBarberMemberships = async (barberIds) => {
  const query = User.find({ _id: { $in: getIdsForQuery(barberIds) } });
  if (query && typeof query.select === "function") {
    return resolveQuery(query.select("_id salon salonStatus salons role"));
  }

  return query;
};

/**
 * Get the salon ID from a seat object.
 */
export const getSeatSalonId = (seat) =>
  getIdString(seat?.salonId || seat?.subscriptionId?.ownerId);

/**
 * Check if a barber is an accepted staff member of the given salon.
 */
export const isAcceptedSalonStaffMember = (barber, salonId) => {
  const stringId = getIdString(salonId);
  if (!barber || !stringId) return false;

  const salonEntry = (barber.salons || []).find(
    (s) => getIdString(s.salon) === stringId
  );

  if (salonEntry) {
    return isWorkingSpecialist(salonEntry);
  }

  return (
    getIdString(barber.salon) === stringId && barber.salonStatus === "approved"
  );
};

/**
 * Strip sensitive membership fields from a member object.
 */
export const sanitizeApprovedMember = (member) => {
  const { salons, salon, salonStatus, ...safeMember } = member || {};
  return safeMember;
};

/**
 * Check if a seat belongs to an accepted staff member of the salon.
 */
export const isAcceptedStaffSeat = (seat, salonId) =>
  isAcceptedSalonStaffMember(seat?.barberId, salonId);

/**
 * Strip seat barberId fields for safe API exposure.
 */
export const sanitizeBillingSeat = (seat) => {
  if (!seat?.barberId || typeof seat.barberId !== "object") return seat;

  return {
    ...seat,
    barberId: sanitizeApprovedMember(seat.barberId),
  };
};

/**
 * Filter seats to only accepted staff members, sanitized.
 */
export const filterAcceptedStaffSeats = (seats = [], salonId) =>
  seats
    .filter((seat) => isAcceptedStaffSeat(seat, salonId))
    .map(sanitizeBillingSeat);

/**
 * Count active accepted staff seats for a salon subscription.
 */
export const countActiveAcceptedStaffSeats = async ({ subscriptionId, salonId }) => {
  const activeSeats = await SubscriptionSeat.find({
    subscriptionId,
    status: "active",
  })
    .populate("barberId", SUBSCRIPTION_SEAT_BARBER_FIELDS)
    .lean();

  return filterAcceptedStaffSeats(activeSeats, salonId).length;
};

/**
 * Get active subscription seats for a barber.
 */
export const getActiveSeatsForBarber = async (barberId) => {
  const query = SubscriptionSeat.find({
    barberId,
    status: "active",
  });
  const populated =
    query && typeof query.populate === "function"
      ? query.populate("subscriptionId")
      : query;

  return resolveQuery(populated);
};

/**
 * Check if a seat's parent subscription has paid access.
 */
export const seatHasActiveParentSubscription = (seat, now = new Date()) =>
  subscriptionHasPaidAccess(seat?.subscriptionId, now);

/**
 * Check if a seat matches a salon ID.
 */
export const seatMatchesSalon = (seat, salonId) =>
  !salonId || getSeatSalonId(seat) === getIdString(salonId);