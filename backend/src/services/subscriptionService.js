import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import User from "../models/User.js";
import {
  getSeatSalonId,
  isAcceptedSalonStaffMember,
  isAcceptedStaffSeat,
  sanitizeBillingSeat,
  countActiveAcceptedStaffSeats,
} from "./subscription/seatHelpers.js";
import { requireSalonOwnerOrAdmin } from "./subscription/subscriptionAuthorization.js";
import {
  getIdString,
  subscriptionHasPaidAccess,
} from "./subscription/subscriptionHelpers.js";
import { getOrCreateDefaultSubscriptionPlan } from "./subscription/subscriptionPlanHelpers.js";
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

/* ───────────────────────────────────────────────────────────
 *  Default plan & basic subscription helpers (Phase 1)
 * ─────────────────────────────────────────────────────────── */

/**
 * Get or create the default subscription plan.
 * Idempotent — safe to call repeatedly.
 */
/**
 * Get subscription by owner type and owner ID, populated with plan.
 */
/**
 * Create a trial subscription for a barber or salon owner.
 * Idempotent — if a subscription already exists for this owner, returns it.
 */
/**
 * Check if a barber has paid access to the platform.
 * Returns true if:
 *   1. The barber has an active or trialing individual subscription, OR
 *   2. The barber has an active SubscriptionSeat whose parent salon subscription
 *      is active or trialing.
 */

/**
 * Get a user's subscription access details.
 * For barbers: returns individual subscription and salon seat coverage.
 * For clients: returns a clear "not applicable" indicator.
 */
/* ══════════════════════════════════════════════════════════
 *  Phase 2 — Salon seat assignment
 * ══════════════════════════════════════════════════════════ */

/* ── Internal authorization helpers ─────────────────────── */

/**
 * Fetch a salon and verify the requester is the owner or an admin.
 * On success returns the salon document.
 * Throws an error with a statusCode property on failure.
 */
/**
 * Check if a barber user is accepted staff for the given salon.
 */
/* ── Public service functions ───────────────────────────── */

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

    seat.status = "revoked";
    seat.revokedAt = now;
    await seat.save();
    revokedSeats.push(seat);
  }

  return {
    salonId: getIdString(salonId),
    barberId: getIdString(barberId),
    revokedBy: getIdString(revokedBy) || null,
    revokedCount: revokedSeats.length,
    seats: revokedSeats,
  };
};

/**
 * Get salon subscription details including seats and approved members.
 *
 * @param {Object} params
 * @param {string} params.salonId
 * @param {Object} params.requester - Express req.user (must have _id)
 * @returns {Object} { subscription, activeSeats, revokedSeats, availableSeatCount, approvedMembers }
 */
/**
 * Assign a salon subscription seat to a barber.
 *
 * @param {Object} params
 * @param {string} params.salonId
 * @param {string} params.barberId
 * @param {Object} params.assignedBy - Express req.user (must have _id)
 * @returns {Object} the SubscriptionSeat document
 */
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

  // Check for existing active seat for this subscription + barber
  const existingActive = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "active",
  });

  if (existingActive) {
    return existingActive;
  }

  // Count currently active seats after duplicate detection so repeated
  // assignment attempts for the same barber remain idempotent.
  const activeSeatCount = await countActiveAcceptedStaffSeats({
    subscriptionId: subscription._id,
    salonId: salon._id,
  });

  if (activeSeatCount >= subscription.seatCount) {
    const err = new Error(
      `Cannot assign more than ${subscription.seatCount} active seats. Please increase your paid seat count first.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Check for existing revoked seat for this subscription + barber — reactivate
  const existingRevoked = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "revoked",
  });

  if (existingRevoked) {
    existingRevoked.status = "active";
    existingRevoked.revokedAt = null;
    existingRevoked.assignedBy = assignedBy._id;
    existingRevoked.assignedAt = new Date();
    await existingRevoked.save();
    return existingRevoked;
  }

  // Create new seat
  try {
    const seat = await SubscriptionSeat.create({
      subscriptionId: subscription._id,
      salonId: salon._id,
      barberId: barber._id,
      assignedBy: assignedBy._id,
      status: "active",
      assignedAt: new Date(),
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

/**
 * Revoke an active salon subscription seat.
 *
 * @param {Object} params
 * @param {string} params.seatId
 * @param {Object} params.requester - Express req.user (must have _id)
 * @returns {Object} the updated SubscriptionSeat
 */
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

  // Revoke
  seat.status = "revoked";
  seat.revokedAt = new Date();
  await seat.save();

  return seat;
};

/**
 * Update the seat count of a salon subscription.
 *
 * @param {Object} params
 * @param {string} params.salonId
 * @param {number} params.seatCount - New seat count (>= 1)
 * @param {Object} params.requester - Express req.user (must have _id)
 * @returns {Object} the updated Subscription
 */
/**
 * Confirm a subscription seat update (no period extension).
 * Used for action=update_seats — updates seatCount without changing currentPeriodEnd.
 */

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

  // Cannot reduce below current active seat count
  const activeSeatCount = await SubscriptionSeat.countDocuments({
    subscriptionId: subscription._id,
    status: "active",
  });

  if (seatCount < activeSeatCount) {
    const err = new Error(
      `Cannot reduce seat count below ${activeSeatCount} active seats currently assigned. Please revoke seats first.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Update seat count and total price
  const plan = await getOrCreateDefaultSubscriptionPlan();
  subscription.seatCount = seatCount;
  subscription.totalPrice = plan.pricePerSeat * seatCount;
  subscription.pricePerSeat = plan.pricePerSeat;
  await subscription.save();

  return subscription;
};
