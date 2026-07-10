import mongoose from "mongoose";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";
import { isWorkingSpecialist } from "../salon/salonRelationshipService.js";
import { getDaysRemaining, getOrCreateDefaultSubscriptionPlan } from "../subscriptionService.js";
import {
  SAFE_BARBER_SEAT_FIELDS,
  SAFE_INDIVIDUAL_FIELDS,
  SAFE_OWNER_FIELDS,
  SAFE_PAYMENT_FIELDS,
} from "./platformBillingConstants.js";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

/* ── Query helpers ───────────────────────────────────── */

const escapeRegex = (text) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeSearchTerm = (value) =>
  typeof value === "string" ? value.trim() : "";

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
    if (salonEntry && isWorkingSpecialist(salonEntry)) return true;

    // Check legacy barber field
    if (getIdString(barber.salon) === stringId && barber.salonStatus === "approved") return true;

    return false;
  });
};

/**
 * Check if a specific barber is an accepted staff member of a salon.
 */
const isBarberAcceptedStaffForSalon = async (barberId, salonId) => {
  const stringId = getIdString(salonId);
  const barber = await User.findById(barberId)
    .select("_id role barberType salons salon salonStatus")
    .lean();

  if (!barber || barber.role !== "barber") return false;

  // Check multi-salon entry
  const salonEntry = (barber.salons || []).find(
    (s) => getIdString(s.salon) === stringId && s.status === "approved"
  );
  if (salonEntry && isWorkingSpecialist(salonEntry)) return true;

  // Check legacy fields
  if (getIdString(barber.salon) === stringId && barber.salonStatus === "approved") return true;

  return false;
};

/**
 * Check if a barber is a chair_renter for a salon.
 */
const isBarberChairRenterForSalon = async (barberId, salonId) => {
  const stringId = getIdString(salonId);
  const barber = await User.findById(barberId)
    .select("_id role barberType salons salon salonStatus")
    .lean();

  if (!barber || barber.role !== "barber") return false;

  const salonEntry = (barber.salons || []).find(
    (s) => getIdString(s.salon) === stringId && s.status === "approved"
  );
  if (salonEntry && salonEntry.relationshipType === "chair_renter") return true;

  return false;
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
      ? { id: barber._id, name: barber.name, avatarUrl: barber.avatarUrl, email: barber.email }
      : { id: barber };
    return {
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

const serializeSalonSubscriptionForPlatform = (subscription, now = new Date()) => {
  const serialized = serializeSubscriptionForPlatform(subscription, now);
  if (!serialized) return null;

  return {
    status: serialized.status,
    isExpired: serialized.isExpired,
    seatCount: serialized.seatCount,
    pricePerSeat: serialized.pricePerSeat,
    totalPrice: serialized.totalPrice,
    provider: serialized.provider,
    currentPeriodStart: serialized.currentPeriodStart,
    currentPeriodEnd: serialized.currentPeriodEnd,
    daysRemaining: serialized.daysRemaining,
    lastPaymentAt: serialized.lastPaymentAt,
    trialEndsAt: serialized.trialEndsAt,
    cancelledAt: serialized.cancelledAt,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
  };
};

const serializeIndividualSubscriptionForPlatform = (subscription, now = new Date()) => {
  const serialized = serializeSubscriptionForPlatform(subscription, now);
  if (!serialized) return null;

  return {
    status: serialized.status,
    isExpired: serialized.isExpired,
    seatCount: serialized.seatCount,
    pricePerSeat: serialized.pricePerSeat,
    totalPrice: serialized.totalPrice,
    provider: serialized.provider,
    currentPeriodStart: serialized.currentPeriodStart,
    currentPeriodEnd: serialized.currentPeriodEnd,
    daysRemaining: serialized.daysRemaining,
    lastPaymentAt: serialized.lastPaymentAt,
    trialEndsAt: serialized.trialEndsAt,
    cancelledAt: serialized.cancelledAt,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
  };
};

/* ── Payment attempt helper ───────────────────────────── */

const serializePaymentAttempt = (attempt) => {
  if (!attempt) return null;
  const safe = {
    id: attempt._id,
  };
  for (const field of SAFE_PAYMENT_FIELDS) {
    if (attempt[field] !== undefined) {
      safe[field] = attempt[field];
    }
  }
  safe.source = "payment_attempt";
  if (attempt.metadata?.action) {
    safe.action = attempt.metadata.action;
  }
  // Exclude raw metadata entirely.
  return safe;
};

const serializePaymentRecord = (record) => {
  if (!record) return null;
  const safe = {
    id: record._id,
  };
  for (const field of SAFE_PAYMENT_FIELDS) {
    if (record[field] !== undefined) {
      safe[field] = record[field];
    }
  }
  safe.source = "payment_record";
  return safe;
};

const getPaymentSortTime = (payment) =>
  new Date(payment?.paidAt || payment?.confirmedAt || payment?.createdAt || 0).getTime();

const serializeIndividualPaymentAttempt = (attempt) => {
  if (!attempt) return null;

  return {
    id: attempt._id,
    amount: attempt.amount,
    currency: attempt.currency,
    status: attempt.status,
    provider: attempt.provider,
    seatCount: attempt.seatCount,
    months: attempt.months,
    createdAt: attempt.createdAt || null,
    updatedAt: attempt.updatedAt || null,
    paidAt: attempt.paidAt || null,
    confirmedAt: attempt.confirmedAt || null,
    failedAt: attempt.failedAt || null,
    cancelledAt: attempt.cancelledAt || null,
    refundedAt: attempt.refundedAt || null,
    expiresAt: attempt.expiresAt || null,
    source: "payment_attempt",
    action: attempt.metadata?.action,
  };
};

const serializeIndividualPaymentRecord = (record) => {
  if (!record) return null;

  return {
    id: record._id,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    provider: record.provider,
    seatCount: record.seatCount,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    paidAt: record.paidAt || null,
    periodStart: record.periodStart || null,
    periodEnd: record.periodEnd || null,
    source: "payment_record",
  };
};

const toObjectIdOrNull = (value) => {
  const id = getIdString(value);
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
};

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

/* ── Audit log helper ─────────────────────────────────── */

const createPlatformAuditLog = async ({
  actorId,
  action,
  salonId,
  targetUserId,
  subscriptionId,
  paymentAttemptId,
  oldValue,
  newValue,
  note,
  requestIp,
}) => {
  return PlatformAuditLog.create({
    actorId,
    action,
    salonId: salonId || null,
    targetUserId: targetUserId || null,
    subscriptionId: subscriptionId || null,
    paymentAttemptId: paymentAttemptId || null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    note: note || "",
    requestIp: requestIp || "",
  });
};

const createAuditLogOrRollback = async (payload, rollback) => {
  try {
    return await createPlatformAuditLog(payload);
  } catch (error) {
    if (rollback) {
      try {
        await rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
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

/**
 * Get payment attempts for a salon.
 * Filters to purpose=subscription, ownerType=salon, matching ownerId.
 */
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

/**
 * Get paginated individual barber billing summaries for platform superusers.
 */
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

/**
 * Get individual barber subscription payment history for platform superusers.
 */
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

/* ════════════════════════════════════════════════════════════ */
/*  PHASE 3: Write mutation methods with audit log            */
/* ════════════════════════════════════════════════════════════ */

/**
 * Activate or renew a salon subscription.
 * Platform admin only — does NOT require the salon owner to be the actor.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {number} [options.seatCount=1]
 * @param {number} [options.months=1]
 * @param {string} options.note - Required reason for activation
 * @param {Object} options.actor - req.user (platform admin)
 * @returns {Object} Updated salon billing detail
 */
export const activateSalonSubscription = async (salonId, { seatCount = 1, months = 1, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const normalizedSeatCount = Math.max(1, Math.floor(Number(seatCount) || 1));
  const normalizedMonths = Math.max(1, Math.floor(Number(months) || 1));

  let subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  const plan = await getOrCreateDefaultSubscriptionPlan();
  const now = new Date();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;

  // If subscription exists and is active/trialing with future end, extend from end date
  const isContinuing =
    subscription &&
    ["trialing", "active"].includes(subscription.status) &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now;

  const oldValue = subscription
    ? {
        status: subscription.status,
        seatCount: subscription.seatCount,
        currentPeriodEnd: subscription.currentPeriodEnd,
      }
    : null;
  const oldSubscriptionState = subscription
    ? {
        status: subscription.status,
        seatCount: subscription.seatCount,
        pricePerSeat: subscription.pricePerSeat,
        totalPrice: subscription.totalPrice,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        lastPaymentAt: subscription.lastPaymentAt,
        trialEndsAt: subscription.trialEndsAt,
        cancelledAt: subscription.cancelledAt,
        payerId: subscription.payerId,
        planId: subscription.planId,
        provider: subscription.provider,
      }
    : null;

  const periodStart = isContinuing
    ? new Date(subscription.currentPeriodEnd)
    : now;

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + normalizedMonths);

  if (subscription) {
    subscription.status = "active";
    subscription.seatCount = normalizedSeatCount;
    subscription.pricePerSeat = plan.pricePerSeat;
    subscription.totalPrice = monthlyTotal;
    subscription.currentPeriodStart = periodStart;
    subscription.currentPeriodEnd = periodEnd;
    subscription.lastPaymentAt = now;
    subscription.trialEndsAt = undefined;
    subscription.cancelledAt = undefined;
    subscription.payerId = salon.ownerId;
    subscription.planId = plan._id;
    subscription.provider = "manual";
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      ownerType: "salon",
      ownerId: salon._id,
      ownerRefModel: "Salon",
      payerId: salon.ownerId,
      planId: plan._id,
      status: "active",
      seatCount: normalizedSeatCount,
      pricePerSeat: plan.pricePerSeat,
      totalPrice: monthlyTotal,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      provider: "manual",
      lastPaymentAt: now,
    });
  }

  // Create audit log
  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.activate",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: {
        status: subscription.status,
        seatCount: subscription.seatCount,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      note: note.trim(),
      requestIp,
    },
    async () => {
      if (oldSubscriptionState) {
        Object.assign(subscription, oldSubscriptionState);
        await subscription.save();
      } else {
        await Subscription.deleteOne({ _id: subscription._id });
      }
    }
  );

  // Return fresh billing detail
  return getSalonBillingDetail(salonId);
};

/**
 * Update salon subscription seat count.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {number} options.seatCount - New seat count (must be >= 1)
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Updated billing detail
 */
export const updateSalonSeatCount = async (salonId, { seatCount, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  const numericSeatCount = Number(seatCount);
  if (!Number.isInteger(numericSeatCount) || numericSeatCount < 1) {
    const error = new Error("seatCount must be a positive integer");
    error.statusCode = 400;
    throw error;
  }
  const newCount = numericSeatCount;

  // Calculate used seats (accepted staff only)
  const seatInfo = await getSeatUsageForSalon(getIdString(salon._id), subscription._id);
  if (newCount < seatInfo.used) {
    const error = new Error(
      `Cannot set seat count below ${seatInfo.used} used seats. Revoke seats first.`
    );
    error.statusCode = 400;
    throw error;
  }

  const oldValue = { seatCount: subscription.seatCount };

  subscription.seatCount = newCount;
  await subscription.save();

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.seat_count_update",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { seatCount: newCount },
      note: note.trim(),
      requestIp,
    },
    async () => {
      subscription.seatCount = oldValue.seatCount;
      await subscription.save();
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Assign a seat to an accepted staff member of a salon.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {string} options.barberId - The staff barber to assign
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Updated billing detail
 */
export const assignSalonSeat = async (salonId, { barberId, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  if (!barberId) {
    const error = new Error("barberId is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  // Validate barber is accepted staff
  const isAccepted = await isBarberAcceptedStaffForSalon(barberId, salonId);
  if (!isAccepted) {
    // Check if rejected because barber is a chair_renter
    const isChairRenter = await isBarberChairRenterForSalon(barberId, salonId);
    if (isChairRenter) {
      const error = new Error("Cannot assign a seat to a chair_renter");
      error.statusCode = 400;
      throw error;
    }

    const error = new Error("Barber is not an accepted staff member of this salon");
    error.statusCode = 400;
    throw error;
  }

  // Check for existing active seat (duplicate)
  const existingSeat = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "active",
  });

  if (existingSeat) {
    const error = new Error("Barber already has an active seat on this subscription");
    error.statusCode = 400;
    throw error;
  }

  // Enforce seat cap
  const seatInfo = await getSeatUsageForSalon(getIdString(salon._id), subscription._id);
  if (seatInfo.used >= subscription.seatCount) {
    const error = new Error(
      `Seat cap reached (${subscription.seatCount}). Cannot assign more seats.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Create seat
  const seat = await SubscriptionSeat.create({
    subscriptionId: subscription._id,
    salonId: salon._id,
    barberId,
    assignedBy: actor._id,
    status: "active",
    assignedAt: new Date(),
  });

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.seat_assign",
      salonId: salon._id,
      targetUserId: barberId,
      subscriptionId: subscription._id,
      oldValue: null,
      newValue: { seatId: seat._id, barberId },
      note: note.trim(),
      requestIp,
    },
    async () => {
      await SubscriptionSeat.deleteOne({ _id: seat._id });
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Cancel/deactivate a salon subscription.
 * Soft cancel only — sets status to 'cancelled', keeps all payment history and seat assignments.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {string} options.note - Required reason for cancellation
 * @param {Object} options.actor - req.user (platform admin)
 * @returns {Object} Updated salon billing detail
 */
export const cancelSalonSubscription = async (salonId, { note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  const cancellableStatuses = ["trialing", "active", "past_due"];
  if (!cancellableStatuses.includes(subscription.status)) {
    const error = new Error(
      `Subscription status "${subscription.status}" cannot be cancelled. Only trialing, active, or past_due subscriptions can be cancelled.`
    );
    error.statusCode = 400;
    throw error;
  }

  const oldValue = {
    status: subscription.status,
    cancelledAt: subscription.cancelledAt,
  };

  subscription.status = "cancelled";
  subscription.cancelledAt = new Date();
  await subscription.save();

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.cancel",
      salonId: salon._id,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { status: "cancelled", cancelledAt: subscription.cancelledAt },
      note: note.trim(),
      requestIp,
    },
    async () => {
      subscription.status = oldValue.status;
      subscription.cancelledAt = oldValue.cancelledAt;
      await subscription.save();
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Revoke a seat from an assigned staff barber.
 *
 * @param {string} salonId
 * @param {Object} options
 * @param {string} options.barberId - The staff barber to revoke seat from
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Updated billing detail
 */
export const revokeSalonSeat = async (salonId, { barberId, note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  if (!barberId) {
    const error = new Error("barberId is required");
    error.statusCode = 400;
    throw error;
  }

  const salon = await Salon.findById(salonId).lean();
  if (!salon) {
    const error = new Error("Salon not found");
    error.statusCode = 404;
    throw error;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salon._id,
  });

  if (!subscription) {
    const error = new Error("Salon does not have a subscription");
    error.statusCode = 400;
    throw error;
  }

  // Find active seat
  const existingSeat = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "active",
  });

  if (!existingSeat) {
    const error = new Error("Barber does not have an active seat on this subscription");
    error.statusCode = 400;
    throw error;
  }

  const oldValue = { seatId: existingSeat._id, barberId, status: existingSeat.status };
  const oldRevokedAt = existingSeat.revokedAt;

  existingSeat.status = "revoked";
  existingSeat.revokedAt = new Date();
  await existingSeat.save();

  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.seat_revoke",
      salonId: salon._id,
      targetUserId: barberId,
      subscriptionId: subscription._id,
      oldValue,
      newValue: { seatId: existingSeat._id, barberId, status: "revoked" },
      note: note.trim(),
      requestIp,
    },
    async () => {
      existingSeat.status = oldValue.status;
      existingSeat.revokedAt = oldRevokedAt;
      await existingSeat.save();
    }
  );

  return getSalonBillingDetail(salonId);
};

/**
 * Manually confirm a salon subscription payment attempt.
 *
 * Only salon subscription payments (ownerType=salon, purpose=subscription)
 * with pending/requires_action status and manual provider can be confirmed.
 *
 * @param {string} paymentAttemptId
 * @param {Object} options
 * @param {string} options.note - Required reason
 * @param {Object} options.actor - req.user
 * @returns {Object} Confirmation result with updated billing detail
 */
export const confirmSalonPayment = async (paymentAttemptId, { note, actor, requestIp } = {}) => {
  if (!note || !note.trim()) {
    const error = new Error("note is required");
    error.statusCode = 400;
    throw error;
  }

  const attempt = await SubscriptionPaymentAttempt.findById(paymentAttemptId);
  if (!attempt) {
    const error = new Error("Payment attempt not found");
    error.statusCode = 404;
    throw error;
  }

  // Must be salon subscription payment only
  if (attempt.ownerType !== "salon") {
    const error = new Error("Only salon subscription payments can be confirmed");
    error.statusCode = 400;
    throw error;
  }

  if (attempt.purpose !== "subscription") {
    const error = new Error("Only subscription payment attempts can be confirmed");
    error.statusCode = 400;
    throw error;
  }

  // Must be confirmable status
  const confirmableStatuses = ["pending", "requires_action"];
  if (!confirmableStatuses.includes(attempt.status)) {
    const error = new Error(
      `Payment attempt status "${attempt.status}" cannot be confirmed. Only pending or requires_action allowed.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Must be manual provider. Disabled means payments are unavailable and must not be confirmed.
  if (attempt.provider !== "manual") {
    const error = new Error(
      `Payment provider "${attempt.provider}" cannot be manually confirmed through this endpoint`
    );
    error.statusCode = 400;
    throw error;
  }

  const oldValue = { status: attempt.status, paidAt: attempt.paidAt, confirmedAt: attempt.confirmedAt };

  const now = new Date();
  let linkedSubscription = null;
  let oldSubscriptionState = null;

  if (attempt.subscriptionId) {
    linkedSubscription = await Subscription.findById(attempt.subscriptionId);
    if (
      !linkedSubscription ||
      linkedSubscription.ownerType !== "salon" ||
      getIdString(linkedSubscription.ownerId) !== getIdString(attempt.ownerId)
    ) {
      const error = new Error("Payment attempt subscription does not match the salon owner");
      error.statusCode = 400;
      throw error;
    }

    oldSubscriptionState = {
      status: linkedSubscription.status,
      currentPeriodStart: linkedSubscription.currentPeriodStart,
      currentPeriodEnd: linkedSubscription.currentPeriodEnd,
      lastPaymentAt: linkedSubscription.lastPaymentAt,
      seatCount: linkedSubscription.seatCount,
    };
  }

  attempt.status = "paid";
  attempt.paidAt = now;
  attempt.confirmedAt = now;
  await attempt.save();

  // Activate subscription if one is linked
  if (linkedSubscription) {
    const wasExpiredOrTrialing = ["trialing", "expired"].includes(linkedSubscription.status) || !linkedSubscription.currentPeriodEnd || new Date(linkedSubscription.currentPeriodEnd) <= now;
    const periodStart = wasExpiredOrTrialing ? now : linkedSubscription.currentPeriodEnd;
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + (attempt.months || 1));

    linkedSubscription.status = "active";
    linkedSubscription.currentPeriodStart = periodStart;
    linkedSubscription.currentPeriodEnd = periodEnd;
    linkedSubscription.lastPaymentAt = now;
    linkedSubscription.seatCount = attempt.seatCount || linkedSubscription.seatCount;
    await linkedSubscription.save();

    // Update audit to capture subscription change too
    await createAuditLogOrRollback(
      {
        actorId: actor._id,
        action: "salon_subscription.payment_confirm",
        salonId: attempt.ownerId,
        subscriptionId: linkedSubscription._id,
        paymentAttemptId: attempt._id,
        oldValue,
        newValue: { status: "paid", paidAt: now, confirmedAt: now, subscriptionStatus: "active" },
        note: note.trim(),
        requestIp,
      },
      async () => {
        attempt.status = oldValue.status;
        attempt.paidAt = oldValue.paidAt;
          attempt.confirmedAt = oldValue.confirmedAt;
          await attempt.save();
          Object.assign(linkedSubscription, oldSubscriptionState);
          await linkedSubscription.save();
        }
      );

    return getSalonBillingDetail(getIdString(attempt.ownerId));
  }

  // No subscription linked — just confirm payment
  await createAuditLogOrRollback(
    {
      actorId: actor._id,
      action: "salon_subscription.payment_confirm",
      salonId: attempt.ownerId,
      paymentAttemptId: attempt._id,
      oldValue,
      newValue: { status: "paid", paidAt: now, confirmedAt: now },
      note: note.trim(),
      requestIp,
    },
    async () => {
      attempt.status = oldValue.status;
      attempt.paidAt = oldValue.paidAt;
      attempt.confirmedAt = oldValue.confirmedAt;
      await attempt.save();
    }
  );

  return {
    confirmed: true,
    paymentAttempt: serializePaymentAttempt(attempt),
    salonId: attempt.ownerId,
  };
};
