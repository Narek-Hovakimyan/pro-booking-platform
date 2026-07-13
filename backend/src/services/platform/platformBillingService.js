import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import { getOrCreateDefaultSubscriptionPlan } from "../subscriptionService.js";
import {
  computeSeatUsage,
  getIdString,
} from "./platformBillingCalculations.js";
import {
  serializePaymentAttempt,
} from "./platformBillingSerializers.js";
import {
  getAllIndividualBillingSummaries,
  getIndividualPayments,
} from "./platformBillingIndividualReadService.js";
import {
  getAllSalonBillingSummaries,
  getSalonBillingDetail,
} from "./platformBillingSalonReadService.js";
import {
  getAllSalonPayments,
  getSalonPayments,
} from "./platformBillingSalonPaymentReadService.js";
import {
  getSeatUsageForSalon,
  isBarberAcceptedStaffForSalon,
  isBarberChairRenterForSalon,
} from "./platformBillingSeatHelpers.js";

/* ── Query helpers ───────────────────────────────────── */

/* ── Audit log helper ─────────────────────────────────── */

const createPlatformAuditLog = async ({
  actorId,
  action,
  salonId,
  targetUserId,
  subscriptionId,
  paymentAttemptId,
  oldValue,
  newValue,
  note,
  requestIp,
}) => {
  return PlatformAuditLog.create({
    actorId,
    action,
    salonId: salonId || null,
    targetUserId: targetUserId || null,
    subscriptionId: subscriptionId || null,
    paymentAttemptId: paymentAttemptId || null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    note: note || "",
    requestIp: requestIp || "",
  });
};

const createAuditLogOrRollback = async (payload, rollback) => {
  try {
    return await createPlatformAuditLog(payload);
  } catch (error) {
    if (rollback) {
      try {
        await rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
};

/* ── Main service methods ─────────────────────────────── */

export {
  getAllSalonBillingSummaries,
  getSalonBillingDetail,
  getAllIndividualBillingSummaries,
  getIndividualPayments,
  getAllSalonPayments,
  getSalonPayments,
};

/* ════════════════════════════════════════════════════════════ */
/*  PHASE 3: Write mutation methods with audit log            */
/* ════════════════════════════════════════════════════════════ */

/**
 * Activate or renew a salon subscription.
 * Platform admin only — does NOT require the salon owner to be the actor.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {number} [options.seatCount=1]
 * @param {number} [options.months=1]
 * @param {string} options.note - Required reason for activation
 * @param {Object} options.actor - req.user (platform admin)
 * @returns {Object} Updated salon billing detail
 */
export const activateSalonSubscription = async (salonId, { seatCount = 1, months = 1, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const normalizedSeatCount = Math.max(1, Math.floor(Number(seatCount) || 1));
  const normalizedMonths = Math.max(1, Math.floor(Number(months) || 1));

  let subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  const plan = await getOrCreateDefaultSubscriptionPlan();
  const now = new Date();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;

  // If subscription exists and is active/trialing with future end, extend from end date
  const isContinuing =
    subscription &&
    ["trialing", "active"].includes(subscription.status) &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now;

  const oldValue = subscription
    ? {
        status: subscription.status,
        seatCount: subscription.seatCount,
        currentPeriodEnd: subscription.currentPeriodEnd,
      }
    : null;
  const oldSubscriptionState = subscription
    ? {
        status: subscription.status,
        seatCount: subscription.seatCount,
        pricePerSeat: subscription.pricePerSeat,
        totalPrice: subscription.totalPrice,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        lastPaymentAt: subscription.lastPaymentAt,
        trialEndsAt: subscription.trialEndsAt,
        cancelledAt: subscription.cancelledAt,
        payerId: subscription.payerId,
        planId: subscription.planId,
        provider: subscription.provider,
      }
    : null;

  const periodStart = isContinuing
    ? new Date(subscription.currentPeriodEnd)
    : now;

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + normalizedMonths);

  if (subscription) {
    subscription.status = "active";
    subscription.seatCount = normalizedSeatCount;
    subscription.pricePerSeat = plan.pricePerSeat;
    subscription.totalPrice = monthlyTotal;
    subscription.currentPeriodStart = periodStart;
    subscription.currentPeriodEnd = periodEnd;
    subscription.lastPaymentAt = now;
    subscription.trialEndsAt = undefined;
    subscription.cancelledAt = undefined;
    subscription.payerId = salon.ownerId;
    subscription.planId = plan._id;
    subscription.provider = "manual";
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      ownerType: "salon",
      ownerId: salon._id,
      ownerRefModel: "Salon",
      payerId: salon.ownerId,
      planId: plan._id,
      status: "active",
      seatCount: normalizedSeatCount,
      pricePerSeat: plan.pricePerSeat,
      totalPrice: monthlyTotal,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      provider: "manual",
      lastPaymentAt: now,
    });
  }

  // Create audit log
  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.activate",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: {
        status: subscription.status,
        seatCount: subscription.seatCount,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      note: note.trim(),
      requestIp,
    },
    async () => {
      if (oldSubscriptionState) {
        Object.assign(subscription, oldSubscriptionState);
        await subscription.save();
      } else {
        await Subscription.deleteOne({ _id: subscription._id });
      }
    }
  );

  // Return fresh billing detail
  return getSalonBillingDetail(salonId);
};

/**
 * Update salon subscription seat count.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {number} options.seatCount - New seat count (must be >= 1)
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Updated billing detail
 */
export const updateSalonSeatCount = async (salonId, { seatCount, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  const numericSeatCount = Number(seatCount);
  if (!Number.isInteger(numericSeatCount) || numericSeatCount < 1) {
    const error = new Error("seatCount must be a positive integer");
    error.statusCode = 400;
    throw error;
  }
  const newCount = numericSeatCount;

  // Calculate used seats (accepted staff only)
  const seatInfo = await getSeatUsageForSalon(getIdString(salon._id), subscription._id);
  if (newCount < seatInfo.used) {
    const error = new Error(
      `Cannot set seat count below ${seatInfo.used} used seats. Revoke seats first.`
    );
    error.statusCode = 400;
    throw error;
  }

  const oldValue = { seatCount: subscription.seatCount };

  subscription.seatCount = newCount;
  await subscription.save();

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.seat_count_update",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { seatCount: newCount },
      note: note.trim(),
      requestIp,
    },
    async () => {
      subscription.seatCount = oldValue.seatCount;
      await subscription.save();
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Assign a seat to an accepted staff member of a salon.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {string} options.barberId - The staff barber to assign
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Updated billing detail
 */
export const assignSalonSeat = async (salonId, { barberId, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  if (!barberId) {
    const error = new Error("barberId is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  // Validate barber is accepted staff
  const isAccepted = await isBarberAcceptedStaffForSalon(barberId, salonId);
  if (!isAccepted) {
    // Check if rejected because barber is a chair_renter
    const isChairRenter = await isBarberChairRenterForSalon(barberId, salonId);
    if (isChairRenter) {
      const error = new Error("Cannot assign a seat to a chair_renter");
      error.statusCode = 400;
      throw error;
    }

    const error = new Error("Barber is not an accepted staff member of this salon");
    error.statusCode = 400;
    throw error;
  }

  // Check for existing active seat (duplicate)
  const existingSeat = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "active",
  });

  if (existingSeat) {
    const error = new Error("Barber already has an active seat on this subscription");
    error.statusCode = 400;
    throw error;
  }

  // Enforce seat cap
  const seatInfo = await getSeatUsageForSalon(getIdString(salon._id), subscription._id);
  if (seatInfo.used >= subscription.seatCount) {
    const error = new Error(
      `Seat cap reached (${subscription.seatCount}). Cannot assign more seats.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Create seat
  const seat = await SubscriptionSeat.create({
    subscriptionId: subscription._id,
    salonId: salon._id,
    barberId,
    assignedBy: actor._id,
    status: "active",
    assignedAt: new Date(),
  });

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.seat_assign",
      salonId: salon._id,
      targetUserId: barberId,
      subscriptionId: subscription._id,
      oldValue: null,
      newValue: { seatId: seat._id, barberId },
      note: note.trim(),
      requestIp,
    },
    async () => {
      await SubscriptionSeat.deleteOne({ _id: seat._id });
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Cancel/deactivate a salon subscription.
 * Soft cancel only — sets status to 'cancelled', keeps all payment history and seat assignments.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {string} options.note - Required reason for cancellation
 * @param {Object} options.actor - req.user (platform admin)
 * @returns {Object} Updated salon billing detail
 */
export const cancelSalonSubscription = async (salonId, { note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  const cancellableStatuses = ["trialing", "active", "past_due"];
  if (!cancellableStatuses.includes(subscription.status)) {
    const error = new Error(
      `Subscription status "${subscription.status}" cannot be cancelled. Only trialing, active, or past_due subscriptions can be cancelled.`
    );
    error.statusCode = 400;
    throw error;
  }

  const oldValue = {
    status: subscription.status,
    cancelledAt: subscription.cancelledAt,
  };

  subscription.status = "cancelled";
  subscription.cancelledAt = new Date();
  await subscription.save();

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.cancel",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { status: "cancelled", cancelledAt: subscription.cancelledAt },
      note: note.trim(),
      requestIp,
    },
    async () => {
      subscription.status = oldValue.status;
      subscription.cancelledAt = oldValue.cancelledAt;
      await subscription.save();
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Revoke a seat from an assigned staff barber.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {string} options.barberId - The staff barber to revoke seat from
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Updated billing detail
 */
export const revokeSalonSeat = async (salonId, { barberId, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  if (!barberId) {
    const error = new Error("barberId is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  // Find active seat
  const existingSeat = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "active",
  });

  if (!existingSeat) {
    const error = new Error("Barber does not have an active seat on this subscription");
    error.statusCode = 400;
    throw error;
  }

  const oldValue = { seatId: existingSeat._id, barberId, status: existingSeat.status };
  const oldRevokedAt = existingSeat.revokedAt;

  existingSeat.status = "revoked";
  existingSeat.revokedAt = new Date();
  await existingSeat.save();

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.seat_revoke",
      salonId: salon._id,
      targetUserId: barberId,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { seatId: existingSeat._id, barberId, status: "revoked" },
      note: note.trim(),
      requestIp,
    },
    async () => {
      existingSeat.status = oldValue.status;
      existingSeat.revokedAt = oldRevokedAt;
      await existingSeat.save();
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Manually confirm a salon subscription payment attempt.
 *
 * Only salon subscription payments (ownerType=salon, purpose=subscription)
 * with pending/requires_action status and manual provider can be confirmed.
 *
 * @param {string} paymentAttemptId
 * @param {Object} options
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Confirmation result with updated billing detail
 */
export const confirmSalonPayment = async (paymentAttemptId, { note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const attempt = await SubscriptionPaymentAttempt.findById(paymentAttemptId);
  if (!attempt) {
    const error = new Error("Payment attempt not found");
    error.statusCode = 404;
    throw error;
  }

  // Must be salon subscription payment only
  if (attempt.ownerType !== "salon") {
    const error = new Error("Only salon subscription payments can be confirmed");
    error.statusCode = 400;
    throw error;
  }

  if (attempt.purpose !== "subscription") {
    const error = new Error("Only subscription payment attempts can be confirmed");
    error.statusCode = 400;
    throw error;
  }

  // Must be confirmable status
  const confirmableStatuses = ["pending", "requires_action"];
  if (!confirmableStatuses.includes(attempt.status)) {
    const error = new Error(
      `Payment attempt status "${attempt.status}" cannot be confirmed. Only pending or requires_action allowed.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Must be manual provider. Disabled means payments are unavailable and must not be confirmed.
  if (attempt.provider !== "manual") {
    const error = new Error(
      `Payment provider "${attempt.provider}" cannot be manually confirmed through this endpoint`
    );
    error.statusCode = 400;
    throw error;
  }

  const oldValue = { status: attempt.status, paidAt: attempt.paidAt, confirmedAt: attempt.confirmedAt };

  const now = new Date();
  let linkedSubscription = null;
  let oldSubscriptionState = null;

  if (attempt.subscriptionId) {
    linkedSubscription = await Subscription.findById(attempt.subscriptionId);
    if (
      !linkedSubscription ||
      linkedSubscription.ownerType !== "salon" ||
      getIdString(linkedSubscription.ownerId) !== getIdString(attempt.ownerId)
    ) {
      const error = new Error("Payment attempt subscription does not match the salon owner");
      error.statusCode = 400;
      throw error;
    }

    oldSubscriptionState = {
      status: linkedSubscription.status,
      currentPeriodStart: linkedSubscription.currentPeriodStart,
      currentPeriodEnd: linkedSubscription.currentPeriodEnd,
      lastPaymentAt: linkedSubscription.lastPaymentAt,
      seatCount: linkedSubscription.seatCount,
    };
  }

  attempt.status = "paid";
  attempt.paidAt = now;
  attempt.confirmedAt = now;
  await attempt.save();

  // Activate subscription if one is linked
  if (linkedSubscription) {
    const wasExpiredOrTrialing = ["trialing", "expired"].includes(linkedSubscription.status) || !linkedSubscription.currentPeriodEnd || new Date(linkedSubscription.currentPeriodEnd) <= now;
    const periodStart = wasExpiredOrTrialing ? now : linkedSubscription.currentPeriodEnd;
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + (attempt.months || 1));

    linkedSubscription.status = "active";
    linkedSubscription.currentPeriodStart = periodStart;
    linkedSubscription.currentPeriodEnd = periodEnd;
    linkedSubscription.lastPaymentAt = now;
    linkedSubscription.seatCount = attempt.seatCount || linkedSubscription.seatCount;
    await linkedSubscription.save();

    // Update audit to capture subscription change too
    await createAuditLogOrRollback(
      {
        actorId: actor._id,
        action: "salon_subscription.payment_confirm",
        salonId: attempt.ownerId,
        subscriptionId: linkedSubscription._id,
        paymentAttemptId: attempt._id,
        oldValue,
        newValue: { status: "paid", paidAt: now, confirmedAt: now, subscriptionStatus: "active" },
        note: note.trim(),
        requestIp,
      },
      async () => {
        attempt.status = oldValue.status;
        attempt.paidAt = oldValue.paidAt;
          attempt.confirmedAt = oldValue.confirmedAt;
          await attempt.save();
          Object.assign(linkedSubscription, oldSubscriptionState);
          await linkedSubscription.save();
        }
      );

    return getSalonBillingDetail(getIdString(attempt.ownerId));
  }

  // No subscription linked — just confirm payment
  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.payment_confirm",
      salonId: attempt.ownerId,
      paymentAttemptId: attempt._id,
      oldValue,
      newValue: { status: "paid", paidAt: now, confirmedAt: now },
      note: note.trim(),
      requestIp,
    },
    async () => {
      attempt.status = oldValue.status;
      attempt.paidAt = oldValue.paidAt;
      attempt.confirmedAt = oldValue.confirmedAt;
      await attempt.save();
    }
  );

  return {
    confirmed: true,
    paymentAttempt: serializePaymentAttempt(attempt),
    salonId: attempt.ownerId,
  };
};
