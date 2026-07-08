import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import { serializeUserPaymentAttempt } from "../payment/subscriptionPaymentSerializers.js";
import { RECOVERABLE_PAYMENT_ATTEMPT_STATUSES } from "./subscriptionHelpers.js";

/**
 * Get the latest recoverable (pending/requires_action) payment attempt for a salon.
 */
export const getLatestRecoverableSalonPaymentAttempt = async (salonId) => {
  const attempts = await SubscriptionPaymentAttempt.find({
    purpose: "subscription",
    ownerType: "salon",
    ownerId: salonId,
    status: { $in: RECOVERABLE_PAYMENT_ATTEMPT_STATUSES },
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  return serializeUserPaymentAttempt(attempts?.[0]);
};