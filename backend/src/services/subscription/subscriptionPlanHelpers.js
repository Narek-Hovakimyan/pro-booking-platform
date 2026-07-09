import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import { DEFAULT_PLAN_CODE } from "./subscriptionHelpers.js";

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

export const isManualActivationAvailable = () =>
  process.env.NODE_ENV !== "production";

export const isDevPaymentConfirmationAvailable = () =>
  process.env.NODE_ENV !== "production";
