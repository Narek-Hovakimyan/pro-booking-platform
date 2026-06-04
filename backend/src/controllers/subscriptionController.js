import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import {
  getOrCreateDefaultSubscriptionPlan,
  getMySubscriptionAccess,
  grantManualSubscription,
} from "../services/subscriptionService.js";

const isProduction = process.env.NODE_ENV === "production";

/**
 * GET /api/subscriptions/me
 * Protected — barber only.
 * Returns the current user's subscription access details.
 */
export const getMySubscription = async (req, res) => {
  try {
    const result = await getMySubscriptionAccess(req.user);
    return res.json(result);
  } catch (error) {
    console.error("Could not fetch subscription access", error);
    return res.status(500).json({ message: "Could not fetch subscription access" });
  }
};

/**
 * GET /api/subscriptions/plan/default
 * Returns the default subscription plan.
 */
export const getDefaultPlan = async (req, res) => {
  try {
    const plan = await getOrCreateDefaultSubscriptionPlan();
    return res.json(plan);
  } catch (error) {
    console.error("Could not fetch default plan", error);
    return res.status(500).json({ message: "Could not fetch default plan" });
  }
};

/**
 * POST /api/subscriptions/dev/grant
 * Protected — disabled in production.
 * Grants a manual subscription for development/testing.
 */
export const devGrantSubscription = async (req, res) => {
  if (isProduction) {
    return res.status(403).json({ message: "Dev endpoints are disabled in production" });
  }

  try {
    const { ownerType, ownerId, payerId, seatCount, months } = req.body;

    if (!ownerType || !ownerId || !payerId) {
      return res.status(400).json({ message: "ownerType, ownerId, and payerId are required" });
    }

    if (!["barber", "salon"].includes(ownerType)) {
      return res.status(400).json({ message: "ownerType must be 'barber' or 'salon'" });
    }

    const subscription = await grantManualSubscription({
      ownerType,
      ownerId,
      payerId,
      seatCount: seatCount || 1,
      months: months || 1,
    });

    return res.status(201).json(subscription);
  } catch (error) {
    console.error("Could not grant subscription", error);
    return res.status(500).json({ message: "Could not grant subscription" });
  }
};
