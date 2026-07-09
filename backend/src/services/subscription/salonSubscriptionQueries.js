import PaymentRecord from "../../models/PaymentRecord.js";
import { serializeUserPaymentRecord } from "../payment/subscriptionPaymentSerializers.js";
import { normalizePaymentHistoryLimit } from "./subscriptionHelpers.js";
import { requireSalonOwnerOrAdmin } from "./subscriptionAuthorization.js";

export const getSalonSubscriptionPaymentHistory = async ({
  salonId,
  requester,
  limit = 20,
}) => {
  await requireSalonOwnerOrAdmin(salonId, requester?._id);

  const payments = await PaymentRecord.find({
    ownerType: "salon",
    ownerId: salonId,
  })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(normalizePaymentHistoryLimit(limit))
    .lean();

  return payments.map(serializeUserPaymentRecord);
};