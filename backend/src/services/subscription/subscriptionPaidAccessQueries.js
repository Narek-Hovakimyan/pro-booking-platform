import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import {
  PAID_SUBSCRIPTION_STATUSES,
  subscriptionHasPaidAccess,
} from "./subscriptionHelpers.js";
import {
  fetchBarberMembership,
  getActiveSeatsForBarber,
  getSeatSalonId,
  isAcceptedSalonStaffMember,
  seatHasActiveParentSubscription,
  seatMatchesSalon,
} from "./seatHelpers.js";
import {
  getRelationshipStatus,
  getRelationshipType,
} from "../salon/salonRelationshipService.js";

export const barberHasPaidAccess = async (barberId) => {
  // Check individual subscription
  const individualSub = await Subscription.findOne({
    ownerType: "barber",
    ownerId: barberId,
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
  });

  if (subscriptionHasPaidAccess(individualSub, new Date(), {
    statusAlreadyFiltered: true,
  })) {
    return true;
  }

  // Check salon seat coverage
  const activeSeat = await SubscriptionSeat.findOne({
    barberId,
    status: "active",
  }).populate("subscriptionId");

  if (!activeSeat || !activeSeat.subscriptionId) {
    return false;
  }

  if (!seatHasActiveParentSubscription(activeSeat)) {
    return false;
  }

  const seatSalonId = getSeatSalonId(activeSeat);
  const barber = await fetchBarberMembership(barberId);

  return isAcceptedSalonStaffMember(barber, seatSalonId);
};

export const barberHasPaidAccessForSalon = async (barberId, salonId = null) => {
  // Individual barber subscriptions preserve existing global access behavior.
  const individualSub = await Subscription.findOne({
    ownerType: "barber",
    ownerId: barberId,
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
  });

  if (subscriptionHasPaidAccess(individualSub, new Date(), {
    statusAlreadyFiltered: true,
  })) {
    return true;
  }

  const activeSeats = await getActiveSeatsForBarber(barberId);
  const matchingSeat = (activeSeats || []).find(
    (seat) => seatHasActiveParentSubscription(seat) && seatMatchesSalon(seat, salonId)
  );

  if (!matchingSeat) {
    return false;
  }

  const seatSalonId = getSeatSalonId(matchingSeat);
  const barber = await fetchBarberMembership(barberId);

  return isAcceptedSalonStaffMember(barber, seatSalonId);
};

export const barberHasPaidSeatAccessForSalon = async (barberId, salonId) => {
  if (!salonId) {
    return barberHasPaidAccess(barberId);
  }

  const activeSeats = await getActiveSeatsForBarber(barberId);
  const matchingSeat = (activeSeats || []).find(
    (seat) => seatHasActiveParentSubscription(seat) && seatMatchesSalon(seat, salonId)
  );

  if (!matchingSeat) {
    return false;
  }

  const seatSalonId = getSeatSalonId(matchingSeat);
  const barber = await fetchBarberMembership(barberId);

  return isAcceptedSalonStaffMember(barber, seatSalonId);
};

const getSalonBookingRelationship = (barber, salonId) => {
  const memberships = Array.isArray(barber?.salons) ? barber.salons : [];
  const canonicalMembership = memberships.find(
    (membership) =>
      String(membership?.salon?._id || membership?.salon) === String(salonId)
  );

  if (canonicalMembership) {
    const relationshipStatus = getRelationshipStatus(canonicalMembership);
    if (
      canonicalMembership.status !== "approved" ||
      relationshipStatus === "pending" ||
      relationshipStatus === "rejected" ||
      canonicalMembership.worksAsSpecialist === false
    ) {
      return null;
    }

    if (getRelationshipType(canonicalMembership) === "chair_renter") {
      return relationshipStatus === "accepted"
        ? "chair_renter"
        : null;
    }

    return relationshipStatus === "accepted"
      ? "staff"
      : null;
  }

  return String(barber?.salon) === String(salonId) &&
    barber?.salonStatus === "approved"
    ? "staff"
    : null;
};

export const barberHasBookingPaidAccessForSalon = async (barberId, salonId = null) => {
  const individualSub = await Subscription.findOne({
    ownerType: "barber",
    ownerId: barberId,
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
  });
  const hasIndividualAccess = subscriptionHasPaidAccess(individualSub, new Date(), {
    statusAlreadyFiltered: true,
  });

  if (!salonId) {
    return hasIndividualAccess || barberHasPaidAccessForSalon(barberId);
  }

  const barber = await fetchBarberMembership(barberId);
  const relationship = getSalonBookingRelationship(barber, salonId);

  if (relationship === "chair_renter") {
    return hasIndividualAccess;
  }

  if (relationship !== "staff") {
    return false;
  }

  return barberHasPaidSeatAccessForSalon(barberId, salonId);
};

export const getBookingPaidAccessByBarberIdsForSalon = async (barberIds, salonId) => {
  const ids = [...new Set((barberIds || []).map(String).filter(Boolean))];
  const accessEntries = await Promise.all(
    ids.map(async (barberId) => [
      barberId,
      await barberHasBookingPaidAccessForSalon(barberId, salonId),
    ])
  );

  return new Map(accessEntries);
};
