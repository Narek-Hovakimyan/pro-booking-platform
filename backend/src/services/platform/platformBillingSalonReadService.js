import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import { SAFE_OWNER_FIELDS } from "./platformBillingConstants.js";
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

/**
 * Get paginated salon billing summaries for platform admin.
 */
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
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
    ];
  }

  if (subscriptionStatus) {
    const subscriptions = await Subscription.find({ ownerType: "salon" }).lean();
    const salonIdsWithSubscriptions = subscriptions.map((sub) => sub.ownerId).filter(Boolean);

    if (subscriptionStatus === "none") {
      filter._id = { $nin: salonIdsWithSubscriptions };
    } else if (subscriptionStatus === "active" || subscriptionStatus === "expired") {
      const matchingSalonIds = subscriptions
        .filter((sub) => {
          const serialized = serializeSubscriptionForPlatform(sub, now);
          return subscriptionStatus === "active"
            ? !serialized.isExpired
            : serialized.isExpired;
        })
        .map((sub) => sub.ownerId)
        .filter(Boolean);

      filter._id = { $in: matchingSalonIds };
    }
  }

  const total = await Salon.countDocuments(filter);
  const salons = await paginateQuery(
    Salon.find(filter).sort({ createdAt: -1 }),
    { page, limit }
  );

  // Build owner map
  const ownerIds = salons.map((s) => s.ownerId);
  const ownerMap = await getOwnerMap(ownerIds);

  // Build subscription + seat data per salon
  const salonIds = salons.map((s) => s._id);
  const subscriptions = await Subscription.find({
    ownerType: "salon",
    ownerId: { $in: salonIds },
  }).lean();

  const subMap = {};
  for (const sub of subscriptions) {
    subMap[getIdString(sub.ownerId)] = sub;
  }

  // Get latest payment attempt per salon (any status)
  const latestAttempts = await SubscriptionPaymentAttempt.aggregate([
    {
      $match: {
        ownerType: "salon",
        ownerId: { $in: salonIds },
        purpose: "subscription",
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$ownerId",
        doc: { $first: "$$ROOT" },
      },
    },
  ]);

  const attemptMap = {};
  for (const entry of latestAttempts) {
    attemptMap[getIdString(entry._id)] = entry.doc;
  }

  // Build results
  const results = [];
  for (const salon of salons) {
    const salonIdStr = getIdString(salon._id);
    const subscription = subMap[salonIdStr] || null;
    const owner = ownerMap[getIdString(salon.ownerId)] || null;
    const latestAttempt = attemptMap[salonIdStr] || null;

    // Calculate seat usage
    let seatUsage = { total: 0, used: 0, available: 0 };
    if (subscription) {
      const seatInfo = await getSeatUsageForSalon(salonIdStr, subscription._id);
      seatUsage = computeSeatUsage(subscription.seatCount, seatInfo.used);
    }

    const safeOwner = owner
      ? { id: owner._id, name: owner.name, email: owner.email, avatarUrl: owner.avatarUrl, city: owner.city }
      : null;

    results.push({
      id: salon._id,
      name: salon.name,
      city: salon.city,
      imageUrl: salon.imageUrl,
      owner: safeOwner,
      subscription: serializeSalonSubscriptionForPlatform(subscription, now),
      seats: seatUsage,
      latestPaymentAttempt: latestAttempt
        ? serializePaymentAttempt(latestAttempt)
        : null,
    });
  }

  return {
    salons: results,
    total,
    page: Math.max(1, Number(page) || 1),
    limit: Math.min(100, Math.max(1, Number(limit) || 20)),
  };
};

/**
 * Get full billing detail for a single salon.
 */
export const getSalonBillingDetail = async (salonId) => {
  const salon = await Salon.findById(salonId).lean();
  if (!salon) return null;

  const salonIdStr = getIdString(salon._id);

  // Owner
  const owner = await User.findById(salon.ownerId)
    .select(SAFE_OWNER_FIELDS)
    .lean();

  const safeOwner = owner
    ? { id: owner._id, name: owner.name, email: owner.email, avatarUrl: owner.avatarUrl, city: owner.city, phone: owner.phone }
    : null;

  // Subscription
  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  }).lean();

  // Seat usage
  let seatUsage = { total: 0, used: 0, available: 0, assignments: [] };
  if (subscription) {
    const seatInfo = await getSeatUsageForSalon(salonIdStr, subscription._id);
    seatUsage = {
      ...computeSeatUsage(subscription.seatCount, seatInfo.used),
      assignments: seatInfo.assignments,
    };
  }

  // Latest actionable payment attempt
  const latestPendingAttempt = subscription
    ? await SubscriptionPaymentAttempt.findOne({
        ownerType: "salon",
        ownerId: salon._id,
        purpose: "subscription",
        status: { $in: ["pending", "requires_action"] },
      })
        .sort({ createdAt: -1 })
        .lean()
    : null;

  // Accepted staff list (not assigned seat — just approved staff)
  const acceptedStaff = await getAcceptedStaffBarbersForSalon(salonIdStr);

  return {
    salon: {
      id: salon._id,
      name: salon.name,
      city: salon.city,
      address: salon.address,
      phone: salon.phone,
      imageUrl: salon.imageUrl,
      createdAt: salon.createdAt,
    },
    owner: safeOwner,
    subscription: serializeSalonSubscriptionForPlatform(subscription),
    seats: seatUsage,
    acceptedStaff: acceptedStaff.map((s) => ({
      id: s._id,
      name: s.name,
      avatarUrl: s.avatarUrl,
      email: s.email,
      profession: s.profession,
      barberType: s.barberType,
    })),
    latestPendingAttempt: latestPendingAttempt
      ? serializePaymentAttempt(latestPendingAttempt)
      : null,
  };
};
