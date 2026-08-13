import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import User from "../models/User.js";
import {
  getSeatSalonId,
  isAcceptedSalonStaffMember,
  isAcceptedStaffSeat,
  sanitizeBillingSeat,
} from "./subscription/seatHelpers.js";
import { requireSalonOwnerOrAdmin } from "./subscription/subscriptionAuthorization.js";
import {
  getIdString,
  subscriptionHasPaidAccess,
} from "./subscription/subscriptionHelpers.js";
import { getOrCreateDefaultSubscriptionPlan } from "./subscription/subscriptionPlanHelpers.js";
import {
  assignActiveSeat,
  revokeActiveSeat,
  updateSubscriptionSeatCount,
} from "./subscription/seatCapacityMutations.js";
// Re-exports for modules that import from subscriptionService.js
export { getDaysRemaining } from "./subscription/subscriptionHelpers.js";
export { serializeSubscriptionStatus } from "./subscription/subscriptionSerializers.js";
export { getLatestRecoverableSalonPaymentAttempt } from "./subscription/paymentAttemptHelpers.js";
export { getOrCreateDefaultSubscriptionPlan, isManualActivationAvailable, isDevPaymentConfirmationAvailable } from "./subscription/subscriptionPlanHelpers.js";
export { getMySubscriptionPaymentHistory } from "./subscription/userSubscriptionQueries.js";
export { getPaidAccessByBarberIds, getPaidAccessByBarberIdsForSalon, getMySubscriptionAccess } from "./subscription/subscriptionAccessQueries.js";
export { barberHasPaidAccess, barberHasPaidAccessForSalon, barberHasPaidSeatAccessForSalon } from "./subscription/subscriptionPaidAccessQueries.js";
export { createTrialSubscription, createSalonTrialSubscription } from "./subscription/subscriptionTrialMutations.js";
export { expireSubscriptions } from "./subscription/subscriptionExpiryMutations.js";
export { extendManualSubscription, grantManualSubscription, grantSubscriptionGraceToExistingBarbers } from "./subscription/subscriptionManualMutations.js";
export { createSubscriptionPaymentIntent, cancelSubscriptionPaymentAttempt, confirmSubscriptionPaymentAttempt, confirmSubscriptionSeatUpdate } from "./subscription/subscriptionPaymentMutations.js";
export { getSubscriptionByOwner, salonHasActiveSubscription, getSalonSubscriptionDetails } from "./subscription/salonSubscriptionQueries.js";
export { getSalonSubscriptionPaymentHistory } from "./subscription/salonSubscriptionQueries.js";
export { getSubscriptionPaymentAttempt } from "./subscription/paymentAttemptHelpers.js";

const isApprovedMember = (barber, salonId) => {
  return isAcceptedSalonStaffMember(barber, salonId);
};

export const revokeSalonSeatsForRemovedMember = async ({
  salonId,
  barberId,
  revokedBy = null,
  now = new Date(),
}) => {
  if (!salonId || !barberId) {
    const err = new Error("salonId and barberId are required");
    err.statusCode = 400;
    throw err;
  }

  const activeSeats = await SubscriptionSeat.find({
    barberId,
    status: "active",
  }).populate("subscriptionId");
  const revokedSeats = [];

  for (const seat of activeSeats || []) {
    if (getSeatSalonId(seat) !== getIdString(salonId)) continue;

    const revoked = await revokeActiveSeat({
      seatId: seat._id,
      subscriptionId: seat.subscriptionId?._id || seat.subscriptionId,
      now,
      subscription: seat.subscriptionId,
      seatDocument: seat,
    });
    if (revoked) revokedSeats.push(revoked);
  }

  return {
    salonId: getIdString(salonId),
    barberId: getIdString(barberId),
    revokedBy: getIdString(revokedBy) || null,
    revokedCount: revokedSeats.length,
    seats: revokedSeats,
  };
};

export const assignSalonSubscriptionSeat = async ({
  salonId,
  barberId,
  assignedBy,
}) => {
  const salon = await requireSalonOwnerOrAdmin(salonId, assignedBy?._id);

  // Fetch subscription
  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
    status: { $in: ["trialing", "active"] },
  });

  if (!subscription) {
    const err = new Error(
      "Salon does not have an active or trialing subscription. Please activate a subscription first."
    );
    err.statusCode = 400;
    throw err;
  }

  if (!subscriptionHasPaidAccess(subscription)) {
    const err = new Error(
      "Salon subscription is expired. Please renew before assigning seats."
    );
    err.statusCode = 400;
    throw err;
  }

  // Verify barber exists
  const barber = await User.findById(barberId);
  if (!barber || barber.role !== "barber") {
    const err = new Error("Barber not found");
    err.statusCode = 404;
    throw err;
  }

  // Verify barber is accepted staff for this salon.
  if (!isApprovedMember(barber, salonId)) {
    const err = new Error(
      "Barber is not an accepted staff member of this salon"
    );
    err.statusCode = 400;
    throw err;
  }

  try {
    const { seat } = await assignActiveSeat({
      subscriptionId: subscription._id,
      salonId: salon._id,
      barberId: barber._id,
      assignedBy: assignedBy._id,
      subscription,
      capacityMessage: `Cannot assign more than ${subscription.seatCount} active seats. Please increase your paid seat count first.`,
    });
    return seat;
  } catch (error) {
    if (error?.code === 11000) {
      const activeSeat = await SubscriptionSeat.findOne({
        subscriptionId: subscription._id,
        barberId,
        status: "active",
      });

      if (activeSeat) return activeSeat;

      const err = new Error("Seat is already assigned to this barber");
      err.statusCode = 400;
      throw err;
    }

    throw error;
  }
};

export const revokeSalonSubscriptionSeat = async ({ seatId, requester }) => {
  if (!requester?._id) {
    const err = new Error("Authentication required");
    err.statusCode = 401;
    throw err;
  }

  // Fetch seat with subscription populated to verify salon ownership
  const seat = await SubscriptionSeat.findById(seatId)
    .populate("subscriptionId");

  if (!seat) {
    const err = new Error("Seat not found");
    err.statusCode = 404;
    throw err;
  }

  if (seat.status !== "active") {
    const err = new Error("Only active seats can be revoked");
    err.statusCode = 400;
    throw err;
  }

  // Verify requester is owner/admin of the parent salon
  const salonId = seat.subscriptionId?.ownerId || seat.salonId;
  await requireSalonOwnerOrAdmin(salonId, requester._id);

  const revoked = await revokeActiveSeat({
    seatId: seat._id,
    subscriptionId: seat.subscriptionId?._id || seat.subscriptionId,
    subscription: seat.subscriptionId,
  });
  if (!revoked) {
    const err = new Error("Only active seats can be revoked");
    err.statusCode = 400;
    throw err;
  }

  return revoked;
};

export const updateSalonSubscriptionSeatCount = async ({
  salonId,
  seatCount,
  requester,
}) => {
  await requireSalonOwnerOrAdmin(salonId, requester?._id);

  if (!Number.isInteger(seatCount) || seatCount < 1) {
    const err = new Error("Seat count must be at least 1");
    err.statusCode = 400;
    throw err;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
  });

  if (!subscription) {
    const err = new Error(
      "Salon does not have a subscription. Please create one first."
    );
    err.statusCode = 400;
    throw err;
  }

  if (seatCount > subscription.seatCount) {
    const err = new Error(
      "Increasing paid seats requires preparing payment and activating the subscription."
    );
    err.statusCode = 400;
    throw err;
  }

  if (Number(subscription.activeSeatCount || 0) > seatCount) {
    const err = new Error(
      `Cannot reduce seat count below ${subscription.activeSeatCount} active seats currently assigned. Please revoke seats first.`
    );
    err.statusCode = 400;
    throw err;
  }

  const plan = await getOrCreateDefaultSubscriptionPlan();
  return updateSubscriptionSeatCount({
    subscriptionId: subscription._id,
    seatCount,
    updates: {
      totalPrice: plan.pricePerSeat * seatCount,
      pricePerSeat: plan.pricePerSeat,
    },
    subscription,
  });
};
