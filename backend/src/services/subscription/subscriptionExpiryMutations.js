import Subscription from "../../models/Subscription.js";
import { PAID_SUBSCRIPTION_STATUSES } from "./subscriptionHelpers.js";

/**
 * Expire subscriptions whose current period or trial has ended.
 */
export const expireSubscriptions = async ({ now = new Date() } = {}) => {
  const subscriptions = await Subscription.find({
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
    $or: [
      { currentPeriodEnd: { $lt: now } },
      { trialEndsAt: { $lt: now } },
    ],
  });
  const summary = {
    checkedCount: subscriptions.length,
    expiredCount: 0,
    errorsCount: 0,
    errors: [],
  };

  for (const subscription of subscriptions) {
    try {
      subscription.status = "expired";
      await subscription.save();
      summary.expiredCount++;
    } catch (error) {
      summary.errorsCount++;
      summary.errors.push({
        subscriptionId: String(subscription._id),
        message: error.message,
      });
    }
  }

  return summary;
};