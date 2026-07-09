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
