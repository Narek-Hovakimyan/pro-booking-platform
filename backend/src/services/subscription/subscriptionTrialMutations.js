import Subscription from "../../models/Subscription.js";
import {
  getOrCreateDefaultSubscriptionPlan,
} from "./subscriptionPlanHelpers.js";
import { TRIAL_DAYS } from "./subscriptionHelpers.js";

/**
 * Create a trial subscription for a barber or salon owner.
 * Idempotent — if a subscription already exists for this owner, returns it.
 */
export const createTrialSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
}) => {
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
 * Create a trial subscription for a salon.
 */
export const createSalonTrialSubscription = async ({
  salonId,
  payerId,
  seatCount = 1,
}) =>
  createTrialSubscription({
    ownerType: "salon",
    ownerId: salonId,
    payerId,
    seatCount,
  });
