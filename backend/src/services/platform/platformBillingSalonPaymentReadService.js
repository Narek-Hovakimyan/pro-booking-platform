import mongoose from "mongoose";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import { getIdString } from "./platformBillingCalculations.js";
import {
  serializePaymentAttempt,
  serializePaymentRecord,
} from "./platformBillingSerializers.js";

export const getSalonPayments = async (salonId, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;
  const fetchLimit = skip + safeLimit;

  const filter = {
    ownerType: "salon",
    ownerId: new mongoose.Types.ObjectId(getIdString(salonId)),
    purpose: "subscription",
  };
  const recordFilter = {
    ownerType: "salon",
    ownerId: new mongoose.Types.ObjectId(getIdString(salonId)),
  };

  const [attemptTotal, recordTotal, attempts, records] = await Promise.all([
    SubscriptionPaymentAttempt.countDocuments(filter),
    PaymentRecord.countDocuments(recordFilter),
    SubscriptionPaymentAttempt.find(filter)
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    PaymentRecord.find(recordFilter)
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
  ]);

  const payments = [
    ...attempts.map(serializePaymentAttempt),
    ...records.map(serializePaymentRecord),
  ]
    .sort((left, right) => {
      const rightTime = new Date(
        right.paidAt || right.confirmedAt || right.createdAt || 0
      ).getTime();
      const leftTime = new Date(
        left.paidAt || left.confirmedAt || left.createdAt || 0
      ).getTime();
      return rightTime - leftTime;
    })
    .slice(skip, skip + safeLimit);

  return {
    payments,
    total: attemptTotal + recordTotal,
    page: safePage,
    limit: safeLimit,
  };
};

export const getAllSalonPayments = async ({ page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const filter = {
    ownerType: "salon",
    purpose: "subscription",
  };

  const total = await SubscriptionPaymentAttempt.countDocuments(filter);
  const attempts = await SubscriptionPaymentAttempt.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  return {
    payments: attempts.map(serializePaymentAttempt),
    total,
    page: safePage,
    limit: safeLimit,
  };
};
