import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import {
  BILLING_OWNER_SUMMARY_FIELDS,
  BILLING_SALON_SUMMARY_FIELDS,
  BILLING_SUBSCRIPTION_SUMMARY_FIELDS,
} from "./platformBillingConstants.js";
import {
  computeSeatUsage,
  escapeRegex,
  getIdString,
  paginateQuery,
} from "./platformBillingCalculations.js";
import {
  serializePaymentAttempt,
  serializeSalonSubscriptionForPlatform,
  serializeSubscriptionForPlatform,
} from "./platformBillingSerializers.js";
import { getOwnerMap } from "./platformBillingQueryHelpers.js";
import {
  getAcceptedStaffBarbersForSalon,
  getSeatUsageForSalon,
} from "./platformBillingSeatHelpers.js";
import {
  hasUnexpiredPeriod,
  isSubscriptionStatusActive,
} from "../subscription/subscriptionHelpers.js";

const hasActiveSubscriptionForPlatformFilter = (subscription, now) =>
  Boolean(subscription?.currentPeriodEnd) &&
  isSubscriptionStatusActive(subscription.status) &&
  hasUnexpiredPeriod(subscription, now);

const getBillingSeatUsage = async (salonId, subscription) => {
  if (!subscription) return { total: 0, used: 0, available: 0 };
  if (Number.isInteger(subscription.activeSeatCount)) {
    return computeSeatUsage(subscription.seatCount, subscription.activeSeatCount);
  }

  // Compatibility only for records created before activeSeatCount was maintained.
  const seatInfo = await getSeatUsageForSalon(salonId, subscription._id);
  return computeSeatUsage(subscription.seatCount, seatInfo.used);
};

const serializeSeatManagement = (seatInfo, acceptedStaff) => ({
  seats: {
    total: seatInfo.total,
    used: seatInfo.used,
    available: seatInfo.available,
    assignments: (seatInfo.assignments || []).map((assignment) => ({
      barber: {
        id: assignment.barber?.id || assignment.barber,
        name: assignment.barber?.name || "",
      },
      assignedAt: assignment.assignedAt || null,
      status: assignment.status,
    })),
  },
  acceptedStaff: acceptedStaff.map((staff) => ({
    id: staff._id,
    name: staff.name || "",
    email: staff.email || "",
    barberType: staff.barberType || "",
  })),
});

export const getAllSalonBillingSummaries = async ({
  page = 1,
  limit = 20,
  search,
  subscriptionStatus,
} = {}) => {
  const filter = {};
  const now = new Date();

  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [{ name: { $regex: escaped, $options: "i" } }];
  }

  if (subscriptionStatus) {
    const subscriptions = await Subscription.find({ ownerType: "salon" })
      .select("ownerId status currentPeriodEnd trialEndsAt")
      .lean();
    const salonIdsWithSubscriptions = subscriptions.map((sub) => sub.ownerId).filter(Boolean);

    if (subscriptionStatus === "none") {
      filter._id = { $nin: salonIdsWithSubscriptions };
    } else if (subscriptionStatus === "active" || subscriptionStatus === "expired") {
      filter._id = {
        $in: subscriptions
          .filter((sub) => {
            const serialized = serializeSubscriptionForPlatform(sub, now);
            return subscriptionStatus === "active"
              ? hasActiveSubscriptionForPlatformFilter(sub, now)
              : serialized.isExpired;
          })
          .map((sub) => sub.ownerId)
          .filter(Boolean),
      };
    }
  }

  const total = await Salon.countDocuments(filter);
  const salons = await paginateQuery(
    Salon.find(filter)
      .select(BILLING_SALON_SUMMARY_FIELDS)
      .sort({ createdAt: -1 }),
    { page, limit }
  );
  const ownerMap = await getOwnerMap(salons.map((salon) => salon.ownerId));
  const salonIds = salons.map((salon) => salon._id);
  const subscriptions = await Subscription.find({
    ownerType: "salon",
    ownerId: { $in: salonIds },
  })
    .select(BILLING_SUBSCRIPTION_SUMMARY_FIELDS)
    .lean();
  const subscriptionMap = Object.fromEntries(
    subscriptions.map((subscription) => [getIdString(subscription.ownerId), subscription])
  );

  const results = await Promise.all(salons.map(async (salon) => {
    const salonId = getIdString(salon._id);
    const subscription = subscriptionMap[salonId] || null;
    const owner = ownerMap[getIdString(salon.ownerId)] || null;
    return {
      id: salon._id,
      name: salon.name,
      city: salon.city,
      owner: owner ? { id: owner._id, name: owner.name, email: owner.email } : null,
      subscription: serializeSalonSubscriptionForPlatform(subscription, now),
      seats: await getBillingSeatUsage(salonId, subscription),
    };
  }));

  return {
    salons: results,
    total,
    page: Math.max(1, Number(page) || 1),
    limit: Math.min(100, Math.max(1, Number(limit) || 20)),
  };
};

export const getSalonBillingDetail = async (salonId) => {
  const salon = await Salon.findById(salonId)
    .select(BILLING_SALON_SUMMARY_FIELDS)
    .lean();
  if (!salon) return null;

  const owner = await User.findById(salon.ownerId)
    .select(BILLING_OWNER_SUMMARY_FIELDS)
    .lean();
  const subscriptionResult = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  })
    .select(BILLING_SUBSCRIPTION_SUMMARY_FIELDS)
    .lean();
  const subscription = subscriptionResult?._id ? subscriptionResult : null;

  return {
    salon: { id: salon._id, name: salon.name, city: salon.city },
    owner: owner ? { id: owner._id, name: owner.name, email: owner.email } : null,
    subscription: serializeSalonSubscriptionForPlatform(subscription),
    seats: await getBillingSeatUsage(getIdString(salon._id), subscription),
  };
};

export const getSalonSeatManagement = async (salonId) => {
  const salon = await Salon.findById(salonId).select("_id").lean();
  if (!salon) return null;

  const subscriptionResult = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  })
    .select(BILLING_SUBSCRIPTION_SUMMARY_FIELDS)
    .lean();
  const subscription = subscriptionResult?._id ? subscriptionResult : null;
  const [seatInfo, acceptedStaff, latestPendingAttempt] = await Promise.all([
    subscription ? getSeatUsageForSalon(getIdString(salon._id), subscription._id) : null,
    getAcceptedStaffBarbersForSalon(getIdString(salon._id)),
    subscription
      ? SubscriptionPaymentAttempt.findOne({
          ownerType: "salon",
          ownerId: salon._id,
          purpose: "subscription",
          status: { $in: ["pending", "requires_action"] },
        })
          .sort({ createdAt: -1 })
          .lean()
      : null,
  ]);
  const seats = subscription
    ? { ...computeSeatUsage(subscription.seatCount, seatInfo.used), assignments: seatInfo.assignments }
    : { total: 0, used: 0, available: 0, assignments: [] };

  return {
    ...serializeSeatManagement(seats, acceptedStaff),
    latestPendingAttempt: latestPendingAttempt
      ? serializePaymentAttempt(latestPendingAttempt)
      : null,
  };
};
