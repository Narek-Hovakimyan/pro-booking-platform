import User from "../../models/User.js";
import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import {
  sameId,
  canManageSalonRequest,
} from "../../utils/salonPermissions.js";
import {
  getOrCreateDefaultSubscriptionPlan,
} from "./subscriptionPlanHelpers.js";
import {
  GRACE_DAYS,
  PAID_SUBSCRIPTION_STATUSES,
  MANUAL_PROVIDER,
  addDays,
  addMonths,
} from "./subscriptionHelpers.js";

/**
 * Grant active subscription and paid PaymentRecord to all existing barbers without a current active subscription.
 * Creates a PaymentRecord with status "paid" and provider "manual" for each barber.
 */
export const grantSubscriptionGraceToExistingBarbers = async ({
  now = new Date(),
  graceDays = GRACE_DAYS,
} = {}) => {
  const plan = await getOrCreateDefaultSubscriptionPlan();
  const barbers = await User.find({ role: "barber" }).select("_id").lean();
  const currentPeriodEnd = addDays(now, graceDays);
  const summary = {
    totalBarbersFound: barbers.length,
    grantedCount: 0,
    skippedCount: 0,
    errorsCount: 0,
    errors: [],
  };

  for (const barber of barbers) {
    const barberId = barber._id;

    try {
      const activeSubscription = await Subscription.findOne({
        ownerType: "barber",
        ownerId: barberId,
        status: { $in: PAID_SUBSCRIPTION_STATUSES },
      });

      if (activeSubscription) {
        summary.skippedCount++;
        continue;
      }

      let subscription = await Subscription.findOne({
        ownerType: "barber",
        ownerId: barberId,
      });

      if (subscription) {
        subscription.ownerRefModel = "User";
        subscription.payerId = barberId;
        subscription.planId = plan._id;
        subscription.status = "active";
        subscription.seatCount = 1;
        subscription.pricePerSeat = plan.pricePerSeat;
        subscription.totalPrice = plan.pricePerSeat;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = currentPeriodEnd;
        subscription.trialEndsAt = undefined;
        subscription.provider = "manual";
        subscription.lastPaymentAt = now;
        await subscription.save();
      } else {
        subscription = await Subscription.create({
          ownerType: "barber",
          ownerRefModel: "User",
          ownerId: barberId,
          payerId: barberId,
          planId: plan._id,
          status: "active",
          seatCount: 1,
          pricePerSeat: plan.pricePerSeat,
          totalPrice: plan.pricePerSeat,
          provider: "manual",
          currentPeriodStart: now,
          currentPeriodEnd,
          lastPaymentAt: now,
        });
      }

      await PaymentRecord.create({
        subscriptionId: subscription._id,
        payerId: barberId,
        ownerType: "barber",
        ownerId: barberId,
        amount: plan.pricePerSeat,
        currency: plan.currency,
        seatCount: 1,
        periodStart: now,
        periodEnd: currentPeriodEnd,
        status: "paid",
        provider: "manual",
        paidAt: now,
      });

      summary.grantedCount++;
    } catch (error) {
      summary.errorsCount++;
      summary.errors.push({
        barberId: String(barberId),
        message: error.message,
      });
    }
  }

  return summary;
};

/**
 * Extend or activate a manual (dev/test) subscription.
 * Creates or updates an active subscription with the given seat count and months.
 * Creates a PaymentRecord with status "paid" and provider "manual".
 */
export const extendManualSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
  months = 1,
  requester = null,
}) => {
  if (!["barber", "salon"].includes(ownerType)) {
    const error = new Error("ownerType must be 'barber' or 'salon'");
    error.statusCode = 400;
    throw error;
  }

  if (!ownerId || !payerId) {
    const error = new Error("ownerId and payerId are required");
    error.statusCode = 400;
    throw error;
  }

  if (requester) {
    if (!requester._id) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      throw error;
    }

    if (requester.role !== "barber") {
      const error = new Error("Only barbers can activate subscriptions");
      error.statusCode = 403;
      throw error;
    }

    if (!sameId(requester._id, payerId)) {
      const error = new Error("payerId must match the authenticated user");
      error.statusCode = 403;
      throw error;
    }

    if (ownerType === "barber" && !sameId(requester._id, ownerId)) {
      const error = new Error("You can only activate your own subscription");
      error.statusCode = 403;
      throw error;
    }

    if (ownerType === "salon") {
      const salon = await Salon.findById(ownerId);
      if (!salon) {
        const error = new Error("Salon not found");
        error.statusCode = 404;
        throw error;
      }

      if (!canManageSalonRequest(salon, requester._id)) {
        const error = new Error("Only salon owner or admin can activate subscription");
        error.statusCode = 403;
        throw error;
      }
    }
  }

  const normalizedSeatCount = Number(seatCount ?? 1);
  const normalizedMonths = Number(months ?? 1);

  if (!Number.isInteger(normalizedSeatCount) || normalizedSeatCount < 1) {
    const error = new Error("seatCount must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(normalizedMonths) || normalizedMonths < 1) {
    const error = new Error("months must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  const plan = await getOrCreateDefaultSubscriptionPlan();

  const now = new Date();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;

  let subscription = await Subscription.findOne({
    ownerType,
    ownerId,
  });

  const isContinuingSubscription =
    subscription &&
    ["trialing", "active"].includes(subscription.status) &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now;
  const periodStart = isContinuingSubscription
    ? new Date(subscription.currentPeriodEnd)
    : now;
  const periodEnd = addMonths(periodStart, normalizedMonths);

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
    subscription.payerId = payerId;
    subscription.planId = plan._id;
    subscription.provider = MANUAL_PROVIDER;
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      ownerType,
      ownerId,
      ownerRefModel: ownerType === "barber" ? "User" : "Salon",
      payerId,
      planId: plan._id,
      status: "active",
      seatCount: normalizedSeatCount,
      pricePerSeat: plan.pricePerSeat,
      totalPrice: monthlyTotal,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      provider: MANUAL_PROVIDER,
      lastPaymentAt: now,
    });
  }

  await PaymentRecord.create({
    subscriptionId: subscription._id,
    payerId,
    ownerType,
    ownerId,
    amount: monthlyTotal * normalizedMonths,
    currency: plan.currency,
    seatCount: normalizedSeatCount,
    periodStart,
    periodEnd,
    status: "paid",
    provider: MANUAL_PROVIDER,
    paidAt: now,
  });

  return subscription;
};

export const grantManualSubscription = extendManualSubscription;