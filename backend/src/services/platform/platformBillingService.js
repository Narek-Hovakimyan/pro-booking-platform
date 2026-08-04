import Salon from "../../models/Salon.js";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import { createAuditLogOrRollback } from "./platformBillingAuditHelpers.js";
import { extendManualSubscription } from "../subscription/subscriptionManualMutations.js";
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
  activateSalonSubscription,
  cancelSalonSubscription,
} from "./platformBillingSubscriptionMutationService.js";
import {
  getAllSalonPayments,
  getSalonPayments,
} from "./platformBillingSalonPaymentReadService.js";
import {
  getSeatUsageForSalon,
  isBarberAcceptedStaffForSalon,
  isBarberChairRenterForSalon,
} from "./platformBillingSeatHelpers.js";
import {
  createWithRequiredSession,
  runInRequiredTransaction,
} from "../subscription/subscriptionPaymentMutationTransactionHelpers.js";
export {
  getAllSalonBillingSummaries,
  getSalonBillingDetail,
  activateSalonSubscription,
  cancelSalonSubscription,
  getAllIndividualBillingSummaries,
  getIndividualPayments,
  getAllSalonPayments,
  getSalonPayments,
};

const createPlatformAuditLog = async (payload, session) =>
  createWithRequiredSession(
    PlatformAuditLog,
    {
      actorId: payload.actorId,
      action: payload.action,
      salonId: payload.salonId || null,
      targetUserId: payload.targetUserId || null,
      subscriptionId: payload.subscriptionId || null,
      paymentAttemptId: payload.paymentAttemptId || null,
      oldValue: payload.oldValue ?? null,
      newValue: payload.newValue ?? null,
      note: payload.note || "",
      requestIp: payload.requestIp || "",
    },
    session
  );
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

export const confirmSalonPayment = async (paymentAttemptId, { note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const trimmedNote = note.trim();
  const result = await runInRequiredTransaction(async (session) => {
    const options = { session };
    const attempt = await SubscriptionPaymentAttempt.findById(
      paymentAttemptId,
      null,
      options
    );
    if (!attempt) {
      const error = new Error("Payment attempt not found");
      error.statusCode = 404;
      throw error;
    }

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

    const confirmableStatuses = ["pending", "requires_action"];
    if (!confirmableStatuses.includes(attempt.status)) {
      const error = new Error(
        `Payment attempt status "${attempt.status}" cannot be confirmed. Only pending or requires_action allowed.`
      );
      error.statusCode = 400;
      throw error;
    }

    if (attempt.provider !== "manual") {
      const error = new Error(
        `Payment provider "${attempt.provider}" cannot be manually confirmed through this endpoint`
      );
      error.statusCode = 400;
      throw error;
    }

    const oldValue = {
      status: attempt.status,
      paidAt: attempt.paidAt,
      confirmedAt: attempt.confirmedAt,
    };
    const now = new Date();

    if (attempt.subscriptionId) {
      const linkedSubscription = await Subscription.findById(
        attempt.subscriptionId,
        null,
        options
      );
      if (
        !linkedSubscription ||
        linkedSubscription.ownerType !== "salon" ||
        getIdString(linkedSubscription.ownerId) !== getIdString(attempt.ownerId)
      ) {
        const error = new Error("Payment attempt subscription does not match the salon owner");
        error.statusCode = 400;
        throw error;
      }

      const subscription = await extendManualSubscription({
        ownerType: attempt.ownerType,
        ownerId: attempt.ownerId,
        payerId: attempt.payerId,
        seatCount: attempt.seatCount,
        months: attempt.months,
        now,
        session,
      });

      attempt.status = "paid";
      attempt.paidAt = now;
      attempt.confirmedAt = now;
      attempt.subscriptionId = subscription._id;
      await attempt.save(options);

      await createPlatformAuditLog(
        {
          actorId: actor._id,
          action: "salon_subscription.payment_confirm",
          salonId: attempt.ownerId,
          subscriptionId: subscription._id,
          paymentAttemptId: attempt._id,
          oldValue,
          newValue: {
            status: "paid",
            paidAt: now,
            confirmedAt: now,
            subscriptionStatus: "active",
          },
          note: trimmedNote,
          requestIp,
        },
        session
      );

      return { type: "billing_detail", salonId: getIdString(attempt.ownerId) };
    }

    attempt.status = "paid";
    attempt.paidAt = now;
    attempt.confirmedAt = now;
    await attempt.save(options);

    await createPlatformAuditLog(
      {
        actorId: actor._id,
        action: "salon_subscription.payment_confirm",
        salonId: attempt.ownerId,
        paymentAttemptId: attempt._id,
        oldValue,
        newValue: { status: "paid", paidAt: now, confirmedAt: now },
        note: trimmedNote,
        requestIp,
      },
      session
    );

    return {
      type: "payment_attempt_only",
      payload: {
        confirmed: true,
        paymentAttempt: serializePaymentAttempt(attempt),
        salonId: attempt.ownerId,
      },
    };
  });

  if (result.type === "billing_detail") {
    return getSalonBillingDetail(result.salonId);
  }

  return result.payload;
};
