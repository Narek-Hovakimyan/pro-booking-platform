import PaymentRecord from "../../models/PaymentRecord.js";
import { serializeUserPaymentRecord } from "../payment/subscriptionPaymentSerializers.js";
import { normalizePaymentHistoryLimit } from "./subscriptionHelpers.js";

export const getMySubscriptionPaymentHistory = async ({
  requester,
  limit = 20,
}) => {
  if (!requester?._id) {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  if (requester.role !== "barber") {
    const error = new Error("Only barbers can view subscription payments");
    error.statusCode = 403;
    throw error;
  }

  const payments = await PaymentRecord.find({
    $or: [
      { ownerType: "barber", ownerId: requester._id },
      { payerId: requester._id },
    ],
  })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(normalizePaymentHistoryLimit(limit))
    .lean();

  return payments.map(serializeUserPaymentRecord);
};