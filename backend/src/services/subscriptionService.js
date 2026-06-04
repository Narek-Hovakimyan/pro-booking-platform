import mongoose from "mongoose";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import PaymentRecord from "../models/PaymentRecord.js";

const DEFAULT_PLAN_CODE = "barber_monthly";
const TRIAL_DAYS = 14;

/**
 * Get or create the default subscription plan.
 * Idempotent — safe to call repeatedly.
 */
export const getOrCreateDefaultSubscriptionPlan = async () => {
  const existing = await SubscriptionPlan.findOne({ code: DEFAULT_PLAN_CODE });
  if (existing) {
    return existing;
  }

  return SubscriptionPlan.create({
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
  });
};

/**
 * Get subscription by owner type and owner ID, populated with plan.
 */
export const getSubscriptionByOwner = async ({ ownerType, ownerId }) => {
  if (!ownerType || !ownerId) {
    return null;
  }

  const subscription = await Subscription.findOne({ ownerType, ownerId })
    .populate("planId")
    .lean();

  return subscription;
};

/**
 * Create a trial subscription for a barber or salon owner.
 * Idempotent — if a subscription already exists for this owner, returns it.
 *
 * @param {Object} params
 * @param {"barber"|"salon"} params.ownerType
 * @param {string} params.ownerId  MongoDB ObjectId
 * @param {string} params.payerId  MongoDB ObjectId of the user who pays
 * @param {number} params.seatCount  Default 1
 */
export const createTrialSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
}) => {
  // Idempotent: return existing if found
  const existing = await Subscription.findOne({ ownerType, ownerId });
  if (existing) {
    return existing;
  }

  const plan = await getOrCreateDefaultSubscriptionPlan();

  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const totalPrice = plan.pricePerSeat * seatCount;

  const subscription = await Subscription.create({
    ownerType,
    ownerId,
    ownerRefModel: ownerType === "barber" ? "User" : "Salon",
    payerId,
    planId: plan._id,
    status: "trialing",
    seatCount,
    pricePerSeat: plan.pricePerSeat,
    totalPrice,
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd,
    trialEndsAt: trialEnd,
    provider: "manual",
  });

  return subscription;
};

/**
 * Grant a manual (dev/test) subscription.
 * Creates or updates an active subscription with the given seat count and months.
 * Creates a PaymentRecord with status "paid" and provider "manual".
 *
 * @param {Object} params
 * @param {"barber"|"salon"} params.ownerType
 * @param {string} params.ownerId
 * @param {string} params.payerId
 * @param {number} params.seatCount  Default 1
 * @param {number} params.months     Default 1
 */
export const grantManualSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
  months = 1,
}) => {
  const plan = await getOrCreateDefaultSubscriptionPlan();

  const now = new Date();
  const periodEnd = new Date(
    now.getFullYear(),
    now.getMonth() + months,
    now.getDate()
  );

  const totalPrice = plan.pricePerSeat * seatCount;

  // Upsert: find existing active/trialing subscription or create new one
  let subscription = await Subscription.findOne({
    ownerType,
    ownerId,
    status: { $in: ["trialing", "active"] },
  });

  if (subscription) {
    // Update existing
    subscription.status = "active";
    subscription.seatCount = seatCount;
    subscription.pricePerSeat = plan.pricePerSeat;
    subscription.totalPrice = totalPrice;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = periodEnd;
    subscription.lastPaymentAt = now;
    subscription.trialEndsAt = undefined;
    subscription.payerId = payerId;
    subscription.planId = plan._id;
    subscription.provider = "manual";
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      ownerType,
      ownerId,
      ownerRefModel: ownerType === "barber" ? "User" : "Salon",
      payerId,
      planId: plan._id,
      status: "active",
      seatCount,
      pricePerSeat: plan.pricePerSeat,
      totalPrice,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      provider: "manual",
      lastPaymentAt: now,
    });
  }

  // Create payment record
  await PaymentRecord.create({
    subscriptionId: subscription._id,
    payerId,
    ownerType,
    ownerId,
    amount: totalPrice,
    currency: "AMD",
    seatCount,
    periodStart: now,
    periodEnd,
    status: "paid",
    provider: "manual",
    paidAt: now,
  });

  return subscription;
};

/**
 * Check if a barber has paid access to the platform.
 * Returns true if:
 *   1. The barber has an active or trialing individual subscription, OR
 *   2. The barber has an active SubscriptionSeat whose parent salon subscription
 *      is active or trialing.
 */
export const barberHasPaidAccess = async (barberId) => {
  // Check individual subscription
  const individualSub = await Subscription.findOne({
    ownerType: "barber",
    ownerId: barberId,
    status: { $in: ["trialing", "active"] },
  });

  if (individualSub) {
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

  const parentStatus = activeSeat.subscriptionId.status;
  return parentStatus === "active" || parentStatus === "trialing";
};

/**
 * Get a user's subscription access details.
 * For barbers: returns individual subscription and salon seat coverage.
 * For clients: returns a clear "not applicable" indicator.
 *
 * @param {Object} user - Mongoose user document (must have _id, role)
 */
export const getMySubscriptionAccess = async (user) => {
  if (user.role === "client") {
    return {
      hasAccess: false,
      role: "client",
      applicability: "not-applicable",
      message: "Clients use the platform free of charge. Subscriptions are for barbers and salon owners.",
      individualSubscription: null,
      salonSeatCoverage: null,
      coveredBy: null,
      defaultPlan: null,
    };
  }

  // role is "barber"
  const barberId = user._id;
  const [individualSubscription, plan] = await Promise.all([
    Subscription.findOne({
      ownerType: "barber",
      ownerId: barberId,
    }).populate("planId").lean(),
    getOrCreateDefaultSubscriptionPlan(),
  ]);

  // Check salon seat coverage
  const activeSeat = await SubscriptionSeat.findOne({
    barberId,
    status: "active",
  }).populate({
    path: "subscriptionId",
    populate: { path: "planId" },
  }).lean();

  let hasAccess = false;
  let salonSeatCoverage = null;
  let coveredBy = null;

  if (
    individualSubscription &&
    ["trialing", "active"].includes(individualSubscription.status)
  ) {
    hasAccess = true;
    coveredBy = "individual";
  }

  if (activeSeat && activeSeat.subscriptionId) {
    const parentStatus = activeSeat.subscriptionId.status;
    if (parentStatus === "active" || parentStatus === "trialing") {
      hasAccess = true;
      salonSeatCoverage = activeSeat;
      coveredBy = coveredBy
        ? "both"
        : "salon";
    }
  }

  return {
    hasAccess,
    role: "barber",
    applicability: "applicable",
    individualSubscription: individualSubscription || null,
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
  };
};
