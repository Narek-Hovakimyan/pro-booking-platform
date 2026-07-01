import Salon from "../models/Salon.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import PaymentRecord from "../models/PaymentRecord.js";
import { getDaysRemaining } from "./subscriptionService.js";

const DEFAULT_CURRENCY = "AMD";
const RECENT_PAYMENT_LIMIT = 10;
const ALERT_LIMIT = 10;

const SAFE_PAYMENT_FIELDS =
  "_id ownerType ownerId amount currency status provider seatCount periodStart periodEnd paidAt createdAt updatedAt";
const SAFE_SUBSCRIPTION_FIELDS =
  "_id ownerType ownerId status seatCount pricePerSeat totalPrice provider currentPeriodStart currentPeriodEnd trialEndsAt lastPaymentAt cancelledAt createdAt updatedAt";
const SAFE_SALON_FIELDS = "_id name ownerId city";
const SAFE_USER_FIELDS = "_id name email city profession barberType";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

const getUtcMonthBounds = (now = new Date()) => {
  const date = new Date(now);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
};

const normalizeCurrency = (currency) => {
  const normalized = String(currency || DEFAULT_CURRENCY).trim().toUpperCase();
  return normalized || DEFAULT_CURRENCY;
};

const buildMoneySummary = (records) => {
  const totals = new Map();

  for (const record of records || []) {
    const currency = normalizeCurrency(record.currency);
    const amount = Number(record.amount || 0);
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }

  const byCurrency = [...totals.entries()].map(([currency, amount]) => ({
    amount,
    currency,
  }));

  if (byCurrency.length === 0) {
    return { amount: 0, currency: DEFAULT_CURRENCY, byCurrency: [] };
  }

  if (byCurrency.length === 1) {
    return {
      amount: byCurrency[0].amount,
      currency: byCurrency[0].currency,
      byCurrency,
    };
  }

  return { amount: null, currency: "MIXED", byCurrency };
};

const isSubscriptionPeriodEnded = (subscription, now = new Date()) => {
  const endValue = subscription.currentPeriodEnd || subscription.trialEndsAt || null;
  if (!endValue) return false;

  const end = new Date(endValue);
  return !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime();
};

const isExpiredSubscription = (subscription, now = new Date()) =>
  subscription.status === "expired" || isSubscriptionPeriodEnded(subscription, now);

const toOwnerLabel = (ownerType) => (ownerType === "barber" ? "individual" : "salon");

const buildOwnerLookups = async (subscriptions = [], payments = []) => {
  const salonIds = new Set();
  const userIds = new Set();

  for (const item of [...subscriptions, ...payments]) {
    const ownerId = getIdString(item.ownerId);
    if (!ownerId) continue;
    if (item.ownerType === "salon") salonIds.add(ownerId);
    if (item.ownerType === "barber") userIds.add(ownerId);
  }

  const salons = salonIds.size
    ? await Salon.find({ _id: { $in: [...salonIds] } }).select(SAFE_SALON_FIELDS).lean()
    : [];

  for (const salon of salons) {
    const ownerId = getIdString(salon.ownerId);
    if (ownerId) userIds.add(ownerId);
  }

  const users = userIds.size
    ? await User.find({ _id: { $in: [...userIds] } }).select(SAFE_USER_FIELDS).lean()
    : [];

  return {
    salons: new Map(salons.map((salon) => [getIdString(salon._id), salon])),
    users: new Map(users.map((user) => [getIdString(user._id), user])),
  };
};

const getOwnerInfo = (ownerType, ownerId, lookups) => {
  const id = getIdString(ownerId);
  if (ownerType === "salon") {
    const salon = lookups.salons.get(id) || {};
    const owner = lookups.users.get(getIdString(salon.ownerId)) || {};
    return {
      name: salon.name || "Unknown salon",
      email: owner.email || "",
    };
  }

  const barber = lookups.users.get(id) || {};
  return {
    name: barber.name || "Unknown barber",
    email: barber.email || "",
  };
};

const serializeRecentPayment = (payment, lookups) => {
  const owner = getOwnerInfo(payment.ownerType, payment.ownerId, lookups);

  return {
    id: getIdString(payment._id),
    ownerType: toOwnerLabel(payment.ownerType),
    ownerName: owner.name,
    ownerEmail: owner.email,
    amount: Number(payment.amount || 0),
    currency: normalizeCurrency(payment.currency),
    status: payment.status,
    provider: payment.provider || "manual",
    source: "payment_record",
    action: null,
    seatCount: payment.seatCount,
    periodStart: payment.periodStart || null,
    periodEnd: payment.periodEnd || null,
    paidAt: payment.paidAt || null,
    createdAt: payment.createdAt || null,
  };
};

const serializeAlertSubscription = (subscription, lookups, now = new Date()) => {
  const owner = getOwnerInfo(subscription.ownerType, subscription.ownerId, lookups);

  return {
    ownerType: toOwnerLabel(subscription.ownerType),
    ownerName: owner.name,
    ownerEmail: owner.email,
    status: subscription.status,
    provider: subscription.provider || "manual",
    currentPeriodStart: subscription.currentPeriodStart || null,
    currentPeriodEnd: subscription.currentPeriodEnd || subscription.trialEndsAt || null,
    daysRemaining: getDaysRemaining(
      subscription.currentPeriodEnd || subscription.trialEndsAt || null,
      now
    ),
    totalPrice: Number(subscription.totalPrice || 0),
    seatCount: Number(subscription.seatCount || 1),
  };
};

export const getPlatformDashboardSummary = async ({
  now = new Date(),
  recentLimit = RECENT_PAYMENT_LIMIT,
} = {}) => {
  const { start, end } = getUtcMonthBounds(now);
  const safeRecentLimit = Math.min(50, Math.max(1, Number(recentLimit) || RECENT_PAYMENT_LIMIT));

  const paymentFilter = {
    ownerType: { $in: ["salon", "barber"] },
    status: "paid",
    paidAt: { $gte: start, $lt: end },
  };

  const [totalSalons, totalBarbers, subscriptions, revenueRecords, recentRecords] =
    await Promise.all([
      Salon.countDocuments({}),
      User.countDocuments({ role: "barber" }),
      Subscription.find({ ownerType: { $in: ["salon", "barber"] } })
        .select(SAFE_SUBSCRIPTION_FIELDS)
        .lean(),
      PaymentRecord.find(paymentFilter).select(SAFE_PAYMENT_FIELDS).lean(),
      PaymentRecord.find({
        ownerType: { $in: ["salon", "barber"] },
        status: "paid",
      })
        .select(SAFE_PAYMENT_FIELDS)
        .sort({ paidAt: -1, createdAt: -1 })
        .limit(safeRecentLimit)
        .lean(),
    ]);

  const lookups = await buildOwnerLookups(subscriptions, recentRecords);

  const salonSubscriptions = subscriptions.filter((sub) => sub.ownerType === "salon");
  const individualSubscriptions = subscriptions.filter((sub) => sub.ownerType === "barber");

  const countActive = (ownerType) =>
    subscriptions.filter(
      (sub) =>
        sub.ownerType === ownerType &&
        sub.status === "active" &&
        !isSubscriptionPeriodEnded(sub, now)
    ).length;

  const trialSubscriptions = subscriptions.filter(
    (sub) => sub.status === "trialing" && !isSubscriptionPeriodEnded(sub, now)
  );
  const expiredSubscriptions = subscriptions.filter(
    (sub) => sub.status !== "past_due" && isExpiredSubscription(sub, now)
  );
  const pastDueSubscriptions = subscriptions.filter((sub) => sub.status === "past_due");

  const salonRevenueRecords = revenueRecords.filter((record) => record.ownerType === "salon");
  const individualRevenueRecords = revenueRecords.filter((record) => record.ownerType === "barber");

  return {
    overview: {
      totalSalons,
      totalBarbers,
      salonSubscriptionsTotal: salonSubscriptions.length,
      individualSubscriptionsTotal: individualSubscriptions.length,
      activeSalonSubscriptions: countActive("salon"),
      activeIndividualSubscriptions: countActive("barber"),
      trialSubscriptions: trialSubscriptions.length,
      expiredSubscriptions: expiredSubscriptions.length,
      pastDueSubscriptions: pastDueSubscriptions.length,
    },
    revenueThisMonth: {
      salon: buildMoneySummary(salonRevenueRecords),
      individual: buildMoneySummary(individualRevenueRecords),
      total: buildMoneySummary(revenueRecords),
      periodStart: start,
      periodEnd: end,
    },
    recentPayments: recentRecords.map((payment) => serializeRecentPayment(payment, lookups)),
    alerts: {
      expired: expiredSubscriptions
        .slice(0, ALERT_LIMIT)
        .map((subscription) => serializeAlertSubscription(subscription, lookups, now)),
      pastDue: pastDueSubscriptions
        .slice(0, ALERT_LIMIT)
        .map((subscription) => serializeAlertSubscription(subscription, lookups, now)),
    },
  };
};
