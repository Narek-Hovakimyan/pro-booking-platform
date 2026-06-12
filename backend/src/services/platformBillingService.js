import mongoose from "mongoose";
import Salon from "../models/Salon.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import SubscriptionPaymentAttempt from "../models/SubscriptionPaymentAttempt.js";
import { isAcceptedStaffMember } from "./salon/salonRelationshipService.js";
import { getDaysRemaining } from "./subscriptionService.js";

const SAFE_OWNER_FIELDS = "name email avatarUrl city emailVerified profession barberType";
const SAFE_BARBER_SEAT_FIELDS =
  "name avatarUrl profession barberType email salon salonStatus salons.salon salons.status salons.relationshipType salons.relationshipStatus";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

/* ── Query helpers ───────────────────────────────────── */

const escapeRegex = (text) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const paginateQuery = (query, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  return query.skip(skip).limit(safeLimit).lean();
};

/* ── Owner lookup helper ─────────────────────────────── */

const getOwnerMap = async (ownerIds) => {
  const uniqueIds = [...new Set(ownerIds.map((id) => getIdString(id)))];
  if (uniqueIds.length === 0) return {};

  const owners = await User.find({ _id: { $in: uniqueIds } })
    .select(SAFE_OWNER_FIELDS)
    .lean();

  const map = {};
  for (const owner of owners) {
    map[getIdString(owner._id)] = owner;
  }
  return map;
};

/* ── Seat helpers ─────────────────────────────────────── */

/**
 * Find all barbers who are accepted staff members of a salon.
 * Handles both multi-salon (salons[] array) and legacy (singular salon field).
 */
const getAcceptedStaffBarbersForSalon = async (salonId) => {
  const stringId = getIdString(salonId);

  const barbers = await User.find({
    role: "barber",
    $or: [
      {
        "salons.salon": new mongoose.Types.ObjectId(stringId),
        "salons.status": "approved",
      },
      {
        salon: new mongoose.Types.ObjectId(stringId),
        salonStatus: "approved",
      },
    ],
  })
    .select(SAFE_BARBER_SEAT_FIELDS)
    .lean();

  return barbers.filter((barber) => {
    // Check multi-salon entry
    const salonEntry = (barber.salons || []).find(
      (s) => getIdString(s.salon) === stringId && s.status === "approved"
    );
    if (salonEntry && isAcceptedStaffMember(salonEntry)) return true;

    // Check legacy barber field
    if (getIdString(barber.salon) === stringId && barber.salonStatus === "approved") return true;

    return false;
  });
};

const getSeatUsageForSalon = async (salonId, subscriptionId) => {
  if (!subscriptionId) {
    return { total: 0, used: 0, available: 0, assignments: [] };
  }

  const activeSeats = await SubscriptionSeat.find({
    subscriptionId,
    status: "active",
  })
    .populate("barberId", SAFE_BARBER_SEAT_FIELDS)
    .lean();

  // Filter to only accepted staff (reuses existing logic from subscriptionService)
  const acceptedStaffIds = new Set();
  const allStaffInSalon = await getAcceptedStaffBarbersForSalon(salonId);
  for (const barber of allStaffInSalon) {
    acceptedStaffIds.add(getIdString(barber._id));
  }

  const filteredSeats = [];
  for (const seat of activeSeats) {
    const barberId = getIdString(seat.barberId?._id || seat.barberId);
    if (acceptedStaffIds.has(barberId)) {
      filteredSeats.push(seat);
    }
  }

  // Sanitize barber data in seats
  const assignments = filteredSeats.map((seat) => {
    const barber = seat.barberId || {};
    const safeBarber = typeof barber === "object" && barber._id
      ? { _id: barber._id, name: barber.name, avatarUrl: barber.avatarUrl, email: barber.email }
      : { _id: barber };
    return {
      _id: seat._id,
      barber: safeBarber,
      assignedAt: seat.assignedAt,
      status: seat.status,
    };
  });

  return {
    total: 0, // Will be set by caller from subscription.seatCount
    used: filteredSeats.length,
    available: 0, // Will be computed by caller
    assignments,
  };
};

const computeSeatUsage = (seatCount, usedSeats) => {
  const total = Math.max(0, Number(seatCount) || 0);
  const used = Math.max(0, usedSeats);
  return {
    total,
    used,
    available: Math.max(0, total - used),
  };
};

/* ── Subscription helper ─────────────────────────────── */

const serializeSubscriptionForPlatform = (subscription, now = new Date()) => {
  if (!subscription) return null;

  const raw = subscription;
  const currentPeriodEnd = raw.currentPeriodEnd || raw.trialEndsAt || null;
  const daysRemaining = getDaysRemaining(currentPeriodEnd, now);
  const endDate = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const periodEnded =
    endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= now.getTime();
  const isExpired = raw.status === "expired" || Boolean(periodEnded);

  return {
    _id: raw._id,
    ownerType: raw.ownerType,
    ownerId: raw.ownerId,
    status: raw.status,
    isExpired,
    seatCount: Number(raw.seatCount || 1),
    pricePerSeat: Number(raw.pricePerSeat || 0),
    totalPrice: Number(raw.totalPrice || 0),
    provider: raw.provider || "manual",
    currentPeriodStart: raw.currentPeriodStart || null,
    currentPeriodEnd: currentPeriodEnd,
    daysRemaining,
    lastPaymentAt: raw.lastPaymentAt || null,
    trialEndsAt: raw.trialEndsAt || null,
    cancelledAt: raw.cancelledAt || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
};

/* ── Payment attempt helper ───────────────────────────── */

const SAFE_PAYMENT_FIELDS = [
  "_id", "amount", "currency", "status", "provider", "purpose",
  "ownerType", "ownerId", "payerId", "subscriptionId",
  "seatCount", "months", "createdAt", "updatedAt",
  "paidAt", "confirmedAt", "failedAt", "cancelledAt",
  "refundedAt", "expiresAt", "checkoutUrl", "providerPaymentId",
];

const serializePaymentAttempt = (attempt) => {
  if (!attempt) return null;
  const safe = {};
  for (const field of SAFE_PAYMENT_FIELDS) {
    if (attempt[field] !== undefined) {
      safe[field] = attempt[field];
    }
  }
  // Exclude sensitive metadata entirely
  return safe;
};

/* ── Main service methods ─────────────────────────────── */

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
      ? { _id: owner._id, name: owner.name, email: owner.email, avatarUrl: owner.avatarUrl, city: owner.city }
      : null;

    results.push({
      _id: salon._id,
      name: salon.name,
      city: salon.city,
      imageUrl: salon.imageUrl,
      owner: safeOwner,
      subscription: serializeSubscriptionForPlatform(subscription, now),
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
    ? { _id: owner._id, name: owner.name, email: owner.email, avatarUrl: owner.avatarUrl, city: owner.city, phone: owner.phone }
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

  // Latest pending attempt
  const latestPendingAttempt = subscription
    ? await SubscriptionPaymentAttempt.findOne({
        ownerType: "salon",
        ownerId: salon._id,
        purpose: "subscription",
        status: "pending",
      })
        .sort({ createdAt: -1 })
        .lean()
    : null;

  // Accepted staff list (not assigned seat — just approved staff)
  const acceptedStaff = await getAcceptedStaffBarbersForSalon(salonIdStr);

  return {
    salon: {
      _id: salon._id,
      name: salon.name,
      city: salon.city,
      address: salon.address,
      phone: salon.phone,
      imageUrl: salon.imageUrl,
      createdAt: salon.createdAt,
    },
    owner: safeOwner,
    subscription: serializeSubscriptionForPlatform(subscription),
    seats: seatUsage,
    acceptedStaff: acceptedStaff.map((s) => ({
      _id: s._id,
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

/**
 * Get payment attempts for a salon.
 * Filters to purpose=subscription, ownerType=salon, matching ownerId.
 */
export const getSalonPayments = async (salonId, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const filter = {
    ownerType: "salon",
    ownerId: new mongoose.Types.ObjectId(getIdString(salonId)),
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

/**
 * Get all salon subscription payment attempts across platform.
 */
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
