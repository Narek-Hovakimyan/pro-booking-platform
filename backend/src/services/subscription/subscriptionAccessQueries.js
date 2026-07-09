import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import {
  getIdString,
  getIdsForQuery,
  PAID_SUBSCRIPTION_STATUSES,
  subscriptionHasPaidAccess,
} from "./subscriptionHelpers.js";
import {
  fetchBarberMembership,
  fetchBarberMemberships,
  getSeatSalonId,
  isAcceptedSalonStaffMember,
  seatHasActiveParentSubscription,
  seatMatchesSalon,
} from "./seatHelpers.js";
import { serializeSubscriptionStatus } from "./subscriptionSerializers.js";
import { getOrCreateDefaultSubscriptionPlan, isManualActivationAvailable } from "./subscriptionPlanHelpers.js";

/**
 * Check paid access by barber IDs (individual subscriptions + salon seats).
 */
export const getPaidAccessByBarberIds = async (barberIds = []) => {
  const ids = [
    ...new Set(barberIds.map((id) => getIdString(id)).filter(Boolean)),
  ];
  const accessByBarberId = new Map(ids.map((id) => [id, false]));

  if (ids.length === 0) {
    return accessByBarberId;
  }

  const queryIds = getIdsForQuery(ids);

  const [individualSubscriptions, activeSeats, barbers] = await Promise.all([
    Subscription.find({
      ownerType: "barber",
      ownerId: { $in: queryIds },
      status: { $in: PAID_SUBSCRIPTION_STATUSES },
    })
      .select("ownerId status currentPeriodEnd")
      .lean(),
    SubscriptionSeat.find({
      barberId: { $in: queryIds },
      status: "active",
    })
      .populate("subscriptionId")
      .lean(),
    fetchBarberMemberships(ids),
  ]);
  const barbersById = new Map(
    (barbers || []).map((barber) => [getIdString(barber._id), barber])
  );

  for (const subscription of individualSubscriptions || []) {
    if (
      !subscriptionHasPaidAccess(subscription, new Date(), {
        statusAlreadyFiltered: true,
      })
    ) {
      continue;
    }
    const ownerId = getIdString(subscription.ownerId);
    if (ownerId) accessByBarberId.set(ownerId, true);
  }

  for (const seat of activeSeats || []) {
    if (!seatHasActiveParentSubscription(seat)) continue;

    const barberId = getIdString(seat.barberId);
    const seatSalonId = getSeatSalonId(seat);
    const barber = barbersById.get(barberId);

    if (barberId && isAcceptedSalonStaffMember(barber, seatSalonId)) {
      accessByBarberId.set(barberId, true);
    }
  }

  return accessByBarberId;
};

/**
 * Check paid access by barber IDs for a specific salon.
 */
export const getPaidAccessByBarberIdsForSalon = async (
  barberIds = [],
  salonId = null
) => {
  const ids = [
    ...new Set(barberIds.map((id) => getIdString(id)).filter(Boolean)),
  ];
  const accessByBarberId = new Map(ids.map((id) => [id, false]));

  if (ids.length === 0) {
    return accessByBarberId;
  }

  const queryIds = getIdsForQuery(ids);

  const [individualSubscriptions, activeSeats, barbers] = await Promise.all([
    Subscription.find({
      ownerType: "barber",
      ownerId: { $in: queryIds },
      status: { $in: PAID_SUBSCRIPTION_STATUSES },
    })
      .select("ownerId status currentPeriodEnd")
      .lean(),
    SubscriptionSeat.find({
      barberId: { $in: queryIds },
      status: "active",
    })
      .populate("subscriptionId")
      .lean(),
    fetchBarberMemberships(ids),
  ]);
  const barbersById = new Map(
    (barbers || []).map((barber) => [getIdString(barber._id), barber])
  );

  for (const subscription of individualSubscriptions || []) {
    if (
      !subscriptionHasPaidAccess(subscription, new Date(), {
        statusAlreadyFiltered: true,
      })
    ) {
      continue;
    }
    const ownerId = getIdString(subscription.ownerId);
    if (ownerId) accessByBarberId.set(ownerId, true);
  }

  for (const seat of activeSeats || []) {
    if (!seatHasActiveParentSubscription(seat)) continue;
    if (!seatMatchesSalon(seat, salonId)) continue;

    const barberId = getIdString(seat.barberId);
    const seatSalonId = getSeatSalonId(seat);
    const barber = barbersById.get(barberId);

    if (barberId && isAcceptedSalonStaffMember(barber, seatSalonId)) {
      accessByBarberId.set(barberId, true);
    }
  }

  return accessByBarberId;
};

/**
 * Get a user's subscription access details.
 */
export const getMySubscriptionAccess = async (user) => {
  if (user.role === "client") {
    return {
      hasAccess: false,
      role: "client",
      applicability: "not-applicable",
      message:
        "Clients use the platform free of charge. Subscriptions are for barbers and salon owners.",
      individualSubscription: null,
      salonSeatCoverage: null,
      coveredBy: null,
      defaultPlan: null,
      manualActivationAvailable: isManualActivationAvailable(),
    };
  }

  const barberId = user._id;
  const [individualSubscription, plan] = await Promise.all([
    Subscription.findOne({
      ownerType: "barber",
      ownerId: barberId,
    })
      .populate("planId")
      .lean(),
    getOrCreateDefaultSubscriptionPlan(),
  ]);
  const serializedIndividualSubscription = serializeSubscriptionStatus(
    individualSubscription,
    plan
  );

  const activeSeat = await SubscriptionSeat.findOne({
    barberId,
    status: "active",
  })
    .populate({
      path: "subscriptionId",
      populate: { path: "planId" },
    })
    .lean();

  let hasAccess = false;
  let salonSeatCoverage = null;
  let coveredBy = null;

  if (
    serializedIndividualSubscription &&
    ["trialing", "active"].includes(serializedIndividualSubscription.status) &&
    !serializedIndividualSubscription.isExpired
  ) {
    hasAccess = true;
    coveredBy = "individual";
  }

  if (activeSeat && activeSeat.subscriptionId) {
    const seatSalonId = getSeatSalonId(activeSeat);
    const barber = await fetchBarberMembership(barberId);

    if (
      subscriptionHasPaidAccess(activeSeat.subscriptionId) &&
      isAcceptedSalonStaffMember(barber, seatSalonId)
    ) {
      hasAccess = true;
      salonSeatCoverage = {
        ...activeSeat,
        subscriptionId: serializeSubscriptionStatus(
          activeSeat.subscriptionId,
          activeSeat.subscriptionId?.planId || plan
        ),
      };
      coveredBy = coveredBy ? "both" : "salon";
    }
  }

  return {
    hasAccess,
    role: "barber",
    applicability: "applicable",
    individualSubscription: serializedIndividualSubscription,
    salonSeatCoverage,
    coveredBy,
    defaultPlan: plan
      ? {
          code: plan.code,
          name: plan.name,
          pricePerSeat: plan.pricePerSeat,
          currency: plan.currency,
          interval: plan.interval,
        }
      : null,
    manualActivationAvailable: isManualActivationAvailable(),
  };
};
