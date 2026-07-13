import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import { SAFE_INDIVIDUAL_FIELDS } from "./platformBillingConstants.js";
import {
  escapeRegex,
  getPaymentSortTime,
  getIdString,
  normalizeSearchTerm,
  paginateQuery,
  toObjectIdOrNull,
} from "./platformBillingCalculations.js";
import {
  serializeIndividualSubscriptionForPlatform,
  serializeIndividualPaymentAttempt,
  serializeIndividualPaymentRecord,
  serializeSubscriptionForPlatform,
} from "./platformBillingSerializers.js";

const getPaidIndividualBarberIds = async () => {
  const paidRecords = await PaymentRecord.find({
    ownerType: "barber",
    status: "paid",
  })
    .select("ownerId")
    .lean();

  return [
    ...new Map(
      paidRecords
        .map((record) => record.ownerId)
        .filter(Boolean)
        .map((ownerId) => [getIdString(ownerId), ownerId])
    ).values(),
  ];
};

export const getAllIndividualBillingSummaries = async ({
  page = 1,
  limit = 20,
  search,
  subscriptionStatus,
} = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const now = new Date();
  const filter = { role: "barber" };
  const searchTerm = normalizeSearchTerm(search);
  const hasSearch = Boolean(searchTerm);
  const requestedSubscriptionStatus =
    typeof subscriptionStatus === "string" ? subscriptionStatus.trim() : "";
  const effectiveSubscriptionStatus =
    requestedSubscriptionStatus || (hasSearch ? undefined : "paid");

  if (hasSearch) {
    const escaped = escapeRegex(searchTerm);
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }

  if (effectiveSubscriptionStatus) {
    if (effectiveSubscriptionStatus === "paid") {
      filter._id = { $in: await getPaidIndividualBarberIds() };
    } else {
      const subscriptions = await Subscription.find({ ownerType: "barber" }).lean();
      const barberIdsWithSubscriptions = subscriptions
        .map((sub) => sub.ownerId)
        .filter(Boolean);

      if (effectiveSubscriptionStatus === "none") {
        filter._id = { $nin: barberIdsWithSubscriptions };
      } else if (
        effectiveSubscriptionStatus === "active" ||
        effectiveSubscriptionStatus === "expired" ||
        effectiveSubscriptionStatus === "trial"
      ) {
        const matchingBarberIds = subscriptions
          .filter((sub) => {
            const serialized = serializeSubscriptionForPlatform(sub, now);
            if (effectiveSubscriptionStatus === "active") {
              return sub.status === "active" && !serialized.isExpired;
            }
            if (effectiveSubscriptionStatus === "trial") {
              return sub.status === "trialing" && !serialized.isExpired;
            }
            return serialized.isExpired;
          })
          .map((sub) => sub.ownerId)
          .filter(Boolean);

        filter._id = { $in: matchingBarberIds };
      }
    }
  }

  const total = await User.countDocuments(filter);
  const barbers = await paginateQuery(
    User.find(filter).select(SAFE_INDIVIDUAL_FIELDS).sort({ createdAt: -1 }),
    { page: safePage, limit: safeLimit }
  );
  const barberIds = barbers.map((barber) => barber._id);

  const [subscriptions, attempts, records] = await Promise.all([
    Subscription.find({
      ownerType: "barber",
      ownerId: { $in: barberIds },
    }).lean(),
    SubscriptionPaymentAttempt.find({
      ownerType: "barber",
      ownerId: { $in: barberIds },
      purpose: "subscription",
    })
      .sort({ createdAt: -1 })
      .lean(),
    PaymentRecord.find({
      ownerType: "barber",
      ownerId: { $in: barberIds },
    })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean(),
  ]);

  const subscriptionMap = {};
  for (const subscription of subscriptions) {
    subscriptionMap[getIdString(subscription.ownerId)] = subscription;
  }

  const latestPaymentMap = {};
  for (const attempt of attempts) {
    const ownerId = getIdString(attempt.ownerId);
    if (!ownerId) continue;
    const payment = serializeIndividualPaymentAttempt(attempt);
    const existing = latestPaymentMap[ownerId];
    if (!existing || getPaymentSortTime(payment) > getPaymentSortTime(existing)) {
      latestPaymentMap[ownerId] = payment;
    }
  }
  for (const record of records) {
    const ownerId = getIdString(record.ownerId);
    if (!ownerId) continue;
    const payment = serializeIndividualPaymentRecord(record);
    const existing = latestPaymentMap[ownerId];
    if (!existing || getPaymentSortTime(payment) > getPaymentSortTime(existing)) {
      latestPaymentMap[ownerId] = payment;
    }
  }

  return {
    individuals: barbers.map((barber) => {
      const barberId = getIdString(barber._id);
      return {
        barberId: barber._id,
        barber: {
          id: barber._id,
          name: barber.name,
          email: barber.email || "",
          avatarUrl: barber.avatarUrl || "",
          city: barber.city || "",
          profession: barber.profession || "",
          barberType: barber.barberType || "",
          createdAt: barber.createdAt || null,
        },
        subscription: serializeIndividualSubscriptionForPlatform(
          subscriptionMap[barberId] || null,
          now
        ),
        latestPayment: latestPaymentMap[barberId] || null,
      };
    }),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

export const getIndividualPayments = async (
  barberId,
  { page = 1, limit = 20 } = {}
) => {
  const barberObjectId = toObjectIdOrNull(barberId);
  if (!barberObjectId) return null;

  const barber = await User.findOne({
    _id: barberObjectId,
    role: "barber",
  })
    .select(SAFE_INDIVIDUAL_FIELDS)
    .lean();

  if (!barber || !barber._id) return null;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;
  const fetchLimit = skip + safeLimit;

  const attemptFilter = {
    ownerType: "barber",
    ownerId: barberObjectId,
    purpose: "subscription",
  };
  const recordFilter = {
    ownerType: "barber",
    ownerId: barberObjectId,
  };

  const [attemptTotal, recordTotal, attempts, records] = await Promise.all([
    SubscriptionPaymentAttempt.countDocuments(attemptFilter),
    PaymentRecord.countDocuments(recordFilter),
    SubscriptionPaymentAttempt.find(attemptFilter)
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    PaymentRecord.find(recordFilter)
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
  ]);

  const payments = [
    ...attempts.map(serializeIndividualPaymentAttempt),
    ...records.map(serializeIndividualPaymentRecord),
  ]
    .filter(Boolean)
    .sort((left, right) => getPaymentSortTime(right) - getPaymentSortTime(left))
    .slice(skip, skip + safeLimit);

  return {
    barber: {
      id: barber._id,
      name: barber.name,
      email: barber.email || "",
      avatarUrl: barber.avatarUrl || "",
      city: barber.city || "",
      profession: barber.profession || "",
      barberType: barber.barberType || "",
    },
    payments,
    total: attemptTotal + recordTotal,
    page: safePage,
    limit: safeLimit,
  };
};
