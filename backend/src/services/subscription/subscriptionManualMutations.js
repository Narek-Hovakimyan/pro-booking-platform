import User from "../../models/User.js";
import mongoose from "mongoose";
import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
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
  DEFAULT_PLAN_CODE,
  PAID_SUBSCRIPTION_STATUSES,
  MANUAL_PROVIDER,
  addDays,
  addMonths,
} from "./subscriptionHelpers.js";
import { assertSeatCountCanContainActiveSeats } from "./seatCapacityMutations.js";
import { guardSubscriptionMutation, runAccountDeletionGuardedMutation } from "../users/accountDeletionGuardedMutations.js";
import {
  createWithOptionalSession,
  isSubscriptionOwnerDuplicateKeyError,
} from "./subscriptionManualMutationHelpers.js";

export { isSubscriptionOwnerDuplicateKeyError } from "./subscriptionManualMutationHelpers.js";

export const findCanonicalSubscription = ({ ownerType, ownerId, session = null }) =>
  Subscription.findOne(
    { ownerType, ownerId },
    null,
    session ? { session } : undefined
  );

export const createCanonicalSubscription = async ({ payload, session = null }) => {
  const { ownerType, ownerId } = payload;

  // Keep lightweight service tests independent of a database while production
  // uses one atomic upsert for the only logical subscription owner.
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    try {
      return { subscription: await createWithOptionalSession(Subscription, payload, session), created: true };
    } catch (error) {
      if (!isSubscriptionOwnerDuplicateKeyError(error)) throw error;
      return {
        subscription: await findCanonicalSubscription({ ownerType, ownerId, session }),
        created: false,
      };
    }
  }

  try {
    const result = await Subscription.findOneAndUpdate(
      { ownerType, ownerId },
      { $setOnInsert: payload },
      {
        returnDocument: "after",
        upsert: true,
        includeResultMetadata: true,
        ...(session ? { session } : {}),
      }
    );
    return {
      subscription: result?.value ?? result,
      created: result?.lastErrorObject?.updatedExisting === false,
    };
  } catch (error) {
    if (!isSubscriptionOwnerDuplicateKeyError(error)) throw error;
    const subscription = await findCanonicalSubscription({ ownerType, ownerId, session });
    if (!subscription) throw error;
    return { subscription, created: false };
  }
};

const updateSubscriptionWithCompareAndSet = async (
  subscription,
  updates,
  session = null
) => {
  // Unit callers use lightweight document doubles. Production Mongoose documents
  // carry __v, allowing a stale extension to retry from the latest period end.
  if (!Number.isInteger(subscription.__v)) {
    Object.assign(subscription, updates);
    await subscription.save(session ? { session } : undefined);
    return subscription;
  }

  const filter = { _id: subscription._id, __v: subscription.__v };
  if (Number.isInteger(updates.seatCount)) {
    // The version key does not change when a seat claim atomically increments
    // activeSeatCount. Keep the capacity invariant in the same DB write as a
    // manual/platform seat-count mutation rather than trusting the stale read.
    filter.$expr = {
      $lte: [
        { $ifNull: ["$activeSeatCount", 0] },
        updates.seatCount,
      ],
    };
  }

  return Subscription.findOneAndUpdate(
    filter,
    { $set: updates, $inc: { __v: 1 } },
    { returnDocument: "after", ...(session ? { session } : {}) }
  );
};

export const mutateCanonicalSubscription = async ({
  ownerType,
  ownerId,
  createPayload,
  updatePayload,
  session = null,
}) => {
  for (let retry = 0; retry < 8; retry += 1) {
    const current = await findCanonicalSubscription({ ownerType, ownerId, session });

    if (current) {
      const mutation = updatePayload(current);
      if (!mutation) {
        return { subscription: current, changed: false, previous: current };
      }

      const subscription = await updateSubscriptionWithCompareAndSet(
        current,
        mutation,
        session
      );
      if (!subscription) continue;
      return { subscription, changed: true, previous: current };
    }

    const created = await createCanonicalSubscription({
      payload: createPayload(),
      session,
    });
    if (created.created) {
      return { subscription: created.subscription, changed: true, previous: null };
    }
  }

  const error = new Error("Subscription update could not be completed");
  error.statusCode = 409;
  throw error;
};

const getOrCreateDefaultSubscriptionPlanWithSession = async (session = null) => {
  if (!session) {
    return getOrCreateDefaultSubscriptionPlan();
  }

  const options = { session };
  const existing = await SubscriptionPlan.findOne({ code: DEFAULT_PLAN_CODE }, null, options);
  if (existing) {
    return existing;
  }

  try {
    return await createWithOptionalSession(
      SubscriptionPlan,
      {
        name: "Barber Monthly",
        code: DEFAULT_PLAN_CODE,
        pricePerSeat: 5000,
        currency: "AMD",
        interval: "month",
        features: [
          "Accept unlimited bookings",
          "Manage your schedule",
          "Client management",
        ],
        isActive: true,
      },
      session
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return SubscriptionPlan.findOne({ code: DEFAULT_PLAN_CODE }, null, options);
  }
};

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

      // Existing trial/expired subscriptions retain the established grace
      // semantics. A canonical winner appearing after this read is a race and
      // must still receive this grant below.
      const initialSubscription = await findCanonicalSubscription({
        ownerType: "barber",
        ownerId: barberId,
      });
      if (initialSubscription) {
        summary.skippedCount++;
        continue;
      }

      const mutation = await mutateCanonicalSubscription({
        ownerType: "barber",
        ownerId: barberId,
        createPayload: () => ({
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
        }),
        updatePayload: (subscription) => {
          if (subscription.status === "active") {
            return null;
          }

          const existingPeriodEnd = subscription.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd)
            : null;
          const effectivePeriodEnd =
            existingPeriodEnd &&
            !Number.isNaN(existingPeriodEnd.getTime()) &&
            existingPeriodEnd > currentPeriodEnd
              ? existingPeriodEnd
              : currentPeriodEnd;

          return {
            ownerRefModel: "User",
            payerId: barberId,
            planId: plan._id,
            status: "active",
            seatCount: 1,
            pricePerSeat: plan.pricePerSeat,
            totalPrice: plan.pricePerSeat,
            currentPeriodStart: now,
            currentPeriodEnd: effectivePeriodEnd,
            trialEndsAt: undefined,
            provider: "manual",
            lastPaymentAt: now,
          };
        },
      });

      if (!mutation.changed) {
        summary.skippedCount++;
        continue;
      }

      const subscription = mutation.subscription;
      const paymentPeriodEnd = subscription.currentPeriodEnd > currentPeriodEnd
        ? subscription.currentPeriodEnd
        : currentPeriodEnd;

      await PaymentRecord.create({
        subscriptionId: subscription._id,
        payerId: barberId,
        ownerType: "barber",
        ownerId: barberId,
        amount: plan.pricePerSeat,
        currency: plan.currency,
        seatCount: 1,
        periodStart: now,
        periodEnd: paymentPeriodEnd,
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
  now = new Date(),
  session = null,
  plan: authoritativePlan = null,
}) => {
  if (!session && mongoose.connection.readyState === 1) return runAccountDeletionGuardedMutation({ userId: payerId, operation: (fencedSession) => extendManualSubscription({ ownerType, ownerId, payerId, seatCount, months, requester, now, session: fencedSession, plan: authoritativePlan }) });
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
  await guardSubscriptionMutation({ payerId, ownerType, ownerId, session });

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
      const salon = await Salon.findById(
        ownerId,
        null,
        session ? { session } : undefined
      );
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

  const plan = authoritativePlan || await getOrCreateDefaultSubscriptionPlanWithSession(session);
  if (!plan?._id || !plan.pricePerSeat || !plan.currency) {
    const error = new Error("Subscription plan could not be validated");
    error.statusCode = 409;
    throw error;
  }
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;

  let periodStart;
  let periodEnd;
  const mutation = await mutateCanonicalSubscription({
    ownerType,
    ownerId,
    session,
    createPayload: () => {
      periodStart = now;
      periodEnd = addMonths(periodStart, normalizedMonths);
      return {
        ownerType,
        ownerId,
        ownerRefModel: ownerType === "barber" ? "User" : "Salon",
        status: "active",
        seatCount: normalizedSeatCount,
        pricePerSeat: plan.pricePerSeat,
        totalPrice: monthlyTotal,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        lastPaymentAt: now,
        trialEndsAt: undefined,
        cancelledAt: undefined,
        payerId,
        planId: plan._id,
        provider: MANUAL_PROVIDER,
      };
    },
    updatePayload: (subscription) => {
      assertSeatCountCanContainActiveSeats(subscription, normalizedSeatCount);
      const isContinuingSubscription =
        ["trialing", "active"].includes(subscription.status) &&
        subscription.currentPeriodEnd &&
        new Date(subscription.currentPeriodEnd) > now;
      periodStart = isContinuingSubscription
        ? new Date(subscription.currentPeriodEnd)
        : now;
      periodEnd = addMonths(periodStart, normalizedMonths);

      return {
        status: "active",
        seatCount: normalizedSeatCount,
        pricePerSeat: plan.pricePerSeat,
        totalPrice: monthlyTotal,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        lastPaymentAt: now,
        trialEndsAt: undefined,
        cancelledAt: undefined,
        payerId,
        planId: plan._id,
        provider: MANUAL_PROVIDER,
      };
    },
  });
  const subscription = mutation.subscription;

  await createWithOptionalSession(
    PaymentRecord,
    {
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
    },
    session
  );

  return subscription;
};

export const grantManualSubscription = extendManualSubscription;
