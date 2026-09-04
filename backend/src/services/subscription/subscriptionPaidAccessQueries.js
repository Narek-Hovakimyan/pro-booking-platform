import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import mongoose from "mongoose";
import {
  PAID_SUBSCRIPTION_STATUSES,
  subscriptionHasPaidAccess,
} from "./subscriptionHelpers.js";
import {
  fetchBarberMembership,
  findSeatForAcceptedSalonStaffMember,
  getActiveSeatsForBarber,
  getPaidActiveSeats,
  getSeatSalonId,
  isAcceptedSalonStaffMember,
  seatHasActiveParentSubscription,
  seatMatchesSalon,
} from "./seatHelpers.js";
import {
  getRelationshipStatus,
  getRelationshipType,
} from "../salon/salonRelationshipService.js";

const withSession = (query, session) =>
  session && typeof query?.session === "function" ? query.session(session) : query;

const findIndividualSubscription = (barberId, session = null) => withSession(
  Subscription.findOne({
    ownerType: "barber",
    ownerId: barberId,
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
  }),
  session
);

export const barberHasPaidAccess = async (barberId, session = null) => {
  // Check individual subscription
  const individualSub = await findIndividualSubscription(barberId, session);

  if (subscriptionHasPaidAccess(individualSub, new Date(), {
    statusAlreadyFiltered: true,
  })) {
    return true;
  }

  // Check salon seat coverage
  const activeSeats = await getActiveSeatsForBarber(barberId, session);
  const paidActiveSeats = getPaidActiveSeats(activeSeats);

  if (paidActiveSeats.length === 0) {
    return false;
  }

  const barber = await fetchBarberMembership(barberId, session);
  return Boolean(findSeatForAcceptedSalonStaffMember(paidActiveSeats, barber));
};

export const barberHasPaidAccessForSalon = async (barberId, salonId = null, session = null) => {
  // Individual barber subscriptions preserve existing global access behavior.
  const individualSub = await findIndividualSubscription(barberId, session);

  if (subscriptionHasPaidAccess(individualSub, new Date(), {
    statusAlreadyFiltered: true,
  })) {
    return true;
  }

  const activeSeats = await getActiveSeatsForBarber(barberId, session);
  const matchingSeat = (activeSeats || []).find(
    (seat) => seatHasActiveParentSubscription(seat) && seatMatchesSalon(seat, salonId)
  );

  if (!matchingSeat) {
    return false;
  }

  const seatSalonId = getSeatSalonId(matchingSeat);
  const barber = await fetchBarberMembership(barberId, session);

  return isAcceptedSalonStaffMember(barber, seatSalonId);
};

export const barberHasPaidSeatAccessForSalon = async (barberId, salonId, session = null) => {
  if (!salonId) {
    return barberHasPaidAccess(barberId, session);
  }

  const activeSeats = await getActiveSeatsForBarber(barberId, session);
  const matchingSeat = (activeSeats || []).find(
    (seat) => seatHasActiveParentSubscription(seat) && seatMatchesSalon(seat, salonId)
  );

  if (!matchingSeat) {
    return false;
  }

  const seatSalonId = getSeatSalonId(matchingSeat);
  const barber = await fetchBarberMembership(barberId, session);

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

const resolveSeatBookingPaidAccess = async ({ barberId, salonId, session, barber = null }) => {
  const activeSeats = await getActiveSeatsForBarber(barberId, session);
  const matchingSeat = (activeSeats || []).find(
    (seat) => seatHasActiveParentSubscription(seat) && seatMatchesSalon(seat, salonId)
  );
  if (!matchingSeat) return { allowed: false };

  const membership = barber || await fetchBarberMembership(barberId, session);
  return isAcceptedSalonStaffMember(membership, getSeatSalonId(matchingSeat))
    ? { allowed: true, membership, seat: matchingSeat, parentSubscription: matchingSeat.subscriptionId }
    : { allowed: false };
};

export const resolveBookingPaidAccessForSalon = async (
  barberId,
  salonId = null,
  session = null
) => {
  const individualSub = await findIndividualSubscription(barberId, session);
  const hasIndividualAccess = subscriptionHasPaidAccess(individualSub, new Date(), {
    statusAlreadyFiltered: true,
  });

  if (!salonId) {
    if (hasIndividualAccess) return { allowed: true, individualSub };
    return resolveSeatBookingPaidAccess({ barberId, salonId: null, session });
  }

  const barber = await fetchBarberMembership(barberId, session);
  const relationship = getSalonBookingRelationship(barber, salonId);

  if (relationship === "chair_renter") {
    return hasIndividualAccess ? { allowed: true, individualSub, membership: barber } : { allowed: false };
  }

  if (relationship !== "staff") {
    return { allowed: false };
  }

  return resolveSeatBookingPaidAccess({ barberId, salonId, session, barber });
};

export const barberHasBookingPaidAccessForSalon = async (barberId, salonId = null, session = null) => {
  const access = await resolveBookingPaidAccessForSalon(barberId, salonId, session);
  return access.allowed;
};

const touchById = async (Model, document, session) => {
  if (!document?._id) return true;
  const result = await Model.updateOne(
    { _id: document._id },
    { $currentDate: { updatedAt: true } },
    { session }
  );
  return result.matchedCount === 1;
};

export const touchBookingPaidAccess = async ({ access, session } = {}) => {
  if (!session || mongoose.connection.readyState !== 1) return true;
  const results = await Promise.all([
    touchById(Subscription, access?.individualSub, session),
    touchById(SubscriptionSeat, access?.seat, session),
    touchById(Subscription, access?.parentSubscription, session),
  ]);
  return results.every(Boolean);
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
