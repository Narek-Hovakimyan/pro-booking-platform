import Salon from "../../models/Salon.js";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import {
  createPlatformBillingAuditLog,
  runPlatformBillingTransaction,
} from "./platformBillingAuditHelpers.js";
import { finalizeSubscriptionPaymentAttempt } from "../payment/paymentAttemptService.js";
import { getIdString } from "./platformBillingCalculations.js";
import { serializePaymentAttempt } from "./platformBillingSerializers.js";
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
  isBarberAcceptedStaffForSalon,
  isBarberChairRenterForSalon,
} from "./platformBillingSeatHelpers.js";
import {
  createWithRequiredSession,
  runInRequiredTransaction,
} from "../subscription/subscriptionPaymentMutationTransactionHelpers.js";
import {
  assignActiveSeat,
  revokeActiveSeat,
  updateSubscriptionSeatCount,
} from "../subscription/seatCapacityMutations.js";
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

const createPaymentConfirmationAuditLog = async (payload, session) =>
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

  const numericSeatCount = Number(seatCount);
  if (!Number.isInteger(numericSeatCount) || numericSeatCount < 1) {
    const error = new Error("seatCount must be a positive integer");
    error.statusCode = 400;
    throw error;
  }
  const newCount = numericSeatCount;

  await runPlatformBillingTransaction(async (session) => {
    const salon = await Salon.findById(salonId, null, { session }).lean();
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    const subscription = await Subscription.findOne(
      { ownerType: "salon", ownerId: salon._id },
      null,
      { session }
    );
    if (!subscription) {
      const error = new Error("Salon does not have a subscription");
      error.statusCode = 400;
      throw error;
    }

    const oldValue = { seatCount: subscription.seatCount };
    const updatedSubscription = await updateSubscriptionSeatCount({
      subscriptionId: subscription._id,
      seatCount: newCount,
      capacityMessage: `Cannot set seat count below ${subscription.activeSeatCount || 0} used seats. Revoke seats first.`,
      session,
      subscription,
    });

    await createPlatformBillingAuditLog({
      actorId: actor._id,
      action: "salon_subscription.seat_count_update",
      salonId: salon._id,
      subscriptionId: updatedSubscription._id,
      oldValue,
      newValue: { seatCount: newCount },
      note: note.trim(),
      requestIp,
    },
    session);
  });

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

  await runPlatformBillingTransaction(async (session) => {
    const salon = await Salon.findById(salonId, null, { session }).lean();
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    const subscription = await Subscription.findOne(
      { ownerType: "salon", ownerId: salon._id },
      null,
      { session }
    );
    if (!subscription) {
      const error = new Error("Salon does not have a subscription");
      error.statusCode = 400;
      throw error;
    }

    const isAccepted = await isBarberAcceptedStaffForSalon(barberId, salonId);
    if (!isAccepted) {
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

    const existingSeat = await SubscriptionSeat.findOne(
      { subscriptionId: subscription._id, barberId, status: "active" },
      null,
      { session }
    );
    if (existingSeat) {
      const error = new Error("Barber already has an active seat on this subscription");
      error.statusCode = 400;
      throw error;
    }

    const { seat, idempotent } = await assignActiveSeat({
      subscriptionId: subscription._id,
      salonId: salon._id,
      barberId,
      assignedBy: actor._id,
      session,
      subscription,
      capacityMessage: `Seat cap reached (${subscription.seatCount}). Cannot assign more seats.`,
    });
    if (idempotent) {
      const error = new Error("Barber already has an active seat on this subscription");
      error.statusCode = 400;
      throw error;
    }

    await createPlatformBillingAuditLog({
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
    session);
  });

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

  await runPlatformBillingTransaction(async (session) => {
    const salon = await Salon.findById(salonId, null, { session }).lean();
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    const subscription = await Subscription.findOne(
      { ownerType: "salon", ownerId: salon._id },
      null,
      { session }
    );
    if (!subscription) {
      const error = new Error("Salon does not have a subscription");
      error.statusCode = 400;
      throw error;
    }

    const existingSeat = await SubscriptionSeat.findOne(
      { subscriptionId: subscription._id, barberId, status: "active" },
      null,
      { session }
    );
    if (!existingSeat) {
      const error = new Error("Barber does not have an active seat on this subscription");
      error.statusCode = 400;
      throw error;
    }

    const oldValue = { seatId: existingSeat._id, barberId, status: existingSeat.status };
    const revokedSeat = await revokeActiveSeat({
      seatId: existingSeat._id,
      subscriptionId: subscription._id,
      session,
      subscription,
      seatDocument: existingSeat,
    });
    if (!revokedSeat) {
      const error = new Error("Barber does not have an active seat on this subscription");
      error.statusCode = 400;
      throw error;
    }

    await createPlatformBillingAuditLog({
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
    session);
  });

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

    const confirmableStatuses = ["pending", "requires_action", "paid"];
    if (!confirmableStatuses.includes(attempt.status)) {
      const error = new Error(
        `Payment attempt status "${attempt.status}" cannot be confirmed.`
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
    const hadSubscriptionLink = Boolean(attempt.subscriptionId);

    const finalized = await finalizeSubscriptionPaymentAttempt({
      attempt,
      now,
      session,
      confirmedAt: now,
    });

    if (!finalized.idempotent) {
      await createPaymentConfirmationAuditLog(
        {
          actorId: actor._id,
          action: "salon_subscription.payment_confirm",
          salonId: attempt.ownerId,
          subscriptionId: finalized.subscription._id,
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
    }

    if (hadSubscriptionLink) {
      return { type: "billing_detail", salonId: getIdString(attempt.ownerId) };
    }
    return {
      type: "payment_attempt_only",
      payload: {
        confirmed: true,
        paymentAttempt: serializePaymentAttempt(attempt),
        salonId: attempt.ownerId,
      },
    };
  });

  return result.type === "billing_detail"
    ? getSalonBillingDetail(result.salonId)
    : result.payload;
};
