import mongoose from "mongoose";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import PaymentRecord from "../models/PaymentRecord.js";
import SubscriptionPaymentAttempt from "../models/SubscriptionPaymentAttempt.js";
import Salon from "../models/Salon.js";
import User from "../models/User.js";
import {
  canManageSalonRequest,
  sameId,
} from "../utils/salonPermissions.js";
import { applyPaymentAttemptTransition } from "./payment/paymentAttemptState.js";
import {
  getConfiguredPaymentProviderName,
  getPaymentProvider,
} from "./payment/paymentProviderFactory.js";
import { isAcceptedStaffMember } from "./salon/salonRelationshipService.js";

const DEFAULT_PLAN_CODE = "barber_monthly";
const TRIAL_DAYS = 14;
const GRACE_DAYS = 30;
const PAID_SUBSCRIPTION_STATUSES = ["trialing", "active"];
const RECOVERABLE_PAYMENT_ATTEMPT_STATUSES = ["pending", "requires_action"];
const MANUAL_PROVIDER = "manual";
const PAYMENT_ATTEMPT_EXPIRY_HOURS = 24;
const SUBSCRIPTION_SEAT_BARBER_FIELDS =
  "name phone avatarUrl profession salon salonStatus salons.salon salons.status salons.relationshipType salons.relationshipStatus";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

const getIdsForQuery = (ids) =>
  ids.map((id) =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
  );

const resolveQuery = async (query) => {
  if (query && typeof query.lean === "function") {
    return query.lean();
  }

  return query;
};

const fetchBarberMembership = async (barberId) => {
  const query = User.findById(barberId);
  if (query && typeof query.select === "function") {
    return resolveQuery(query.select("salon salonStatus salons role"));
  }

  return query;
};

const fetchBarberMemberships = async (barberIds) => {
  const query = User.find({ _id: { $in: getIdsForQuery(barberIds) } });
  if (query && typeof query.select === "function") {
    return resolveQuery(query.select("_id salon salonStatus salons role"));
  }

  return query;
};

const getSeatSalonId = (seat) =>
  getIdString(seat?.salonId || seat?.subscriptionId?.ownerId);

const isAcceptedSalonStaffMember = (barber, salonId) => {
  const stringId = getIdString(salonId);
  if (!barber || !stringId) return false;

  const salonEntry = (barber.salons || []).find(
    (s) => getIdString(s.salon) === stringId
  );

  if (salonEntry) {
    return isAcceptedStaffMember(salonEntry);
  }

  return (
    getIdString(barber.salon) === stringId && barber.salonStatus === "approved"
  );
};

const sanitizeApprovedMember = (member) => {
  const { salons, salon, salonStatus, ...safeMember } = member || {};
  return safeMember;
};

const isAcceptedStaffSeat = (seat, salonId) =>
  isAcceptedSalonStaffMember(seat?.barberId, salonId);

const sanitizeBillingSeat = (seat) => {
  if (!seat?.barberId || typeof seat.barberId !== "object") return seat;

  return {
    ...seat,
    barberId: sanitizeApprovedMember(seat.barberId),
  };
};

const filterAcceptedStaffSeats = (seats = [], salonId) =>
  seats
    .filter((seat) => isAcceptedStaffSeat(seat, salonId))
    .map(sanitizeBillingSeat);

const countActiveAcceptedStaffSeats = async ({ subscriptionId, salonId }) => {
  const activeSeats = await SubscriptionSeat.find({
    subscriptionId,
    status: "active",
  })
    .populate("barberId", SUBSCRIPTION_SEAT_BARBER_FIELDS)
    .lean();

  return filterAcceptedStaffSeats(activeSeats, salonId).length;
};

const getActiveSeatsForBarber = async (barberId) => {
  const query = SubscriptionSeat.find({
    barberId,
    status: "active",
  });
  const populated =
    query && typeof query.populate === "function"
      ? query.populate("subscriptionId")
      : query;

  return resolveQuery(populated);
};

const seatHasActiveParentSubscription = (seat) =>
  PAID_SUBSCRIPTION_STATUSES.includes(seat?.subscriptionId?.status);

const seatMatchesSalon = (seat, salonId) =>
  !salonId || getSeatSalonId(seat) === getIdString(salonId);

/* ───────────────────────────────────────────────────────────
 *  Default plan & basic subscription helpers (Phase 1)
 * ─────────────────────────────────────────────────────────── */

/**
 * Get or create the default subscription plan.
 * Idempotent — safe to call repeatedly.
 */
export const getOrCreateDefaultSubscriptionPlan = async () => {
  const existing = await SubscriptionPlan.findOne({ code: DEFAULT_PLAN_CODE });
  if (existing) {
    return existing;
  }

  return SubscriptionPlan.create({
    name: "Barber Monthly",
    code: DEFAULT_PLAN_CODE,
    pricePerSeat: 5000,
    currency: "AMD",
    interval: "month",
    features: [
      "Accept unlimited bookings",
      "Manage your schedule",
      "Client management",
    ],
    isActive: true,
  });
};

/**
 * Get subscription by owner type and owner ID, populated with plan.
 */
export const getSubscriptionByOwner = async ({ ownerType, ownerId }) => {
  if (!ownerType || !ownerId) {
    return null;
  }

  const subscription = await Subscription.findOne({ ownerType, ownerId })
    .populate("planId")
    .lean();

  return subscription;
};

/**
 * Create a trial subscription for a barber or salon owner.
 * Idempotent — if a subscription already exists for this owner, returns it.
 */
export const createTrialSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
}) => {
  // Idempotent: return existing if found
  const existing = await Subscription.findOne({ ownerType, ownerId });
  if (existing) {
    return existing;
  }

  const plan = await getOrCreateDefaultSubscriptionPlan();

  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const totalPrice = plan.pricePerSeat * seatCount;

  const subscription = await Subscription.create({
    ownerType,
    ownerId,
    ownerRefModel: ownerType === "barber" ? "User" : "Salon",
    payerId,
    planId: plan._id,
    status: "trialing",
    seatCount,
    pricePerSeat: plan.pricePerSeat,
    totalPrice,
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd,
    trialEndsAt: trialEnd,
    provider: "manual",
  });

  return subscription;
};

export const createSalonTrialSubscription = async ({
  salonId,
  payerId,
  seatCount = 1,
}) =>
  createTrialSubscription({
    ownerType: "salon",
    ownerId: salonId,
    payerId,
    seatCount,
  });

const addDays = (date, days) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

export const isManualActivationAvailable = () =>
  process.env.NODE_ENV !== "production";

export const isDevPaymentConfirmationAvailable = () =>
  process.env.NODE_ENV !== "production";

export const getDaysRemaining = (date, now = new Date()) => {
  if (!date) return null;

  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;

  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
};

export const serializeSubscriptionStatus = (
  subscription,
  plan = null,
  now = new Date()
) => {
  if (!subscription) return null;

  const raw = subscription.toObject ? subscription.toObject() : subscription;
  const planData = raw.planId && typeof raw.planId === "object" ? raw.planId : plan;
  const currentPeriodEnd = raw.currentPeriodEnd || raw.trialEndsAt || null;
  const daysRemaining = getDaysRemaining(currentPeriodEnd, now);
  const endDate = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const periodEnded =
    endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= now.getTime();
  const isExpired = raw.status === "expired" || Boolean(periodEnded);
  const seatCount = Number(raw.seatCount || 1);
  const pricePerSeat = Number(raw.pricePerSeat ?? planData?.pricePerSeat ?? 0);
  const monthlyTotal = Number(raw.totalPrice ?? pricePerSeat * seatCount);

  return {
    ...raw,
    id: raw.id || raw._id,
    daysRemaining,
    isExpired,
    isExpiringSoon:
      daysRemaining !== null && daysRemaining <= 7 && !isExpired,
    renewalRequiredAt: currentPeriodEnd,
    currentPeriodEnd,
    monthlyTotal,
    pricePerSeat,
    seatCount,
  };
};

export const grantSubscriptionGraceToExistingBarbers = async ({
  now = new Date(),
  graceDays = GRACE_DAYS,
} = {}) => {
  const plan = await getOrCreateDefaultSubscriptionPlan();
  const barbers = await User.find({ role: "barber" }).select("_id").lean();
  const currentPeriodEnd = addDays(now, graceDays);
  const summary = {
    totalBarbersFound: barbers.length,
    grantedCount: 0,
    skippedCount: 0,
    errorsCount: 0,
    errors: [],
  };

  for (const barber of barbers) {
    const barberId = barber._id;

    try {
      const activeSubscription = await Subscription.findOne({
        ownerType: "barber",
        ownerId: barberId,
        status: { $in: PAID_SUBSCRIPTION_STATUSES },
      });

      if (activeSubscription) {
        summary.skippedCount++;
        continue;
      }

      let subscription = await Subscription.findOne({
        ownerType: "barber",
        ownerId: barberId,
      });

      if (subscription) {
        subscription.ownerRefModel = "User";
        subscription.payerId = barberId;
        subscription.planId = plan._id;
        subscription.status = "active";
        subscription.seatCount = 1;
        subscription.pricePerSeat = plan.pricePerSeat;
        subscription.totalPrice = plan.pricePerSeat;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = currentPeriodEnd;
        subscription.trialEndsAt = undefined;
        subscription.provider = "manual";
        subscription.lastPaymentAt = now;
        await subscription.save();
      } else {
        subscription = await Subscription.create({
          ownerType: "barber",
          ownerRefModel: "User",
          ownerId: barberId,
          payerId: barberId,
          planId: plan._id,
          status: "active",
          seatCount: 1,
          pricePerSeat: plan.pricePerSeat,
          totalPrice: plan.pricePerSeat,
          provider: "manual",
          currentPeriodStart: now,
          currentPeriodEnd,
          lastPaymentAt: now,
        });
      }

      await PaymentRecord.create({
        subscriptionId: subscription._id,
        payerId: barberId,
        ownerType: "barber",
        ownerId: barberId,
        amount: plan.pricePerSeat,
        currency: plan.currency,
        seatCount: 1,
        periodStart: now,
        periodEnd: currentPeriodEnd,
        status: "paid",
        provider: "manual",
        paidAt: now,
      });

      summary.grantedCount++;
    } catch (error) {
      summary.errorsCount++;
      summary.errors.push({
        barberId: String(barberId),
        message: error.message,
      });
    }
  }

  return summary;
};

/**
 * Extend or activate a manual (dev/test) subscription.
 * Creates or updates an active subscription with the given seat count and months.
 * Creates a PaymentRecord with status "paid" and provider "manual".
 */
export const extendManualSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
  months = 1,
  requester = null,
}) => {
  if (!["barber", "salon"].includes(ownerType)) {
    const error = new Error("ownerType must be 'barber' or 'salon'");
    error.statusCode = 400;
    throw error;
  }

  if (!ownerId || !payerId) {
    const error = new Error("ownerId and payerId are required");
    error.statusCode = 400;
    throw error;
  }

  if (requester) {
    if (!requester._id) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      throw error;
    }

    if (requester.role !== "barber") {
      const error = new Error("Only barbers can activate subscriptions");
      error.statusCode = 403;
      throw error;
    }

    if (!sameId(requester._id, payerId)) {
      const error = new Error("payerId must match the authenticated user");
      error.statusCode = 403;
      throw error;
    }

    if (ownerType === "barber" && !sameId(requester._id, ownerId)) {
      const error = new Error("You can only activate your own subscription");
      error.statusCode = 403;
      throw error;
    }

    if (ownerType === "salon") {
      const salon = await Salon.findById(ownerId);
      if (!salon) {
        const error = new Error("Salon not found");
        error.statusCode = 404;
        throw error;
      }

      if (!canManageSalonRequest(salon, requester._id)) {
        const error = new Error("Only salon owner or admin can activate subscription");
        error.statusCode = 403;
        throw error;
      }
    }
  }

  const normalizedSeatCount = Number(seatCount ?? 1);
  const normalizedMonths = Number(months ?? 1);

  if (!Number.isInteger(normalizedSeatCount) || normalizedSeatCount < 1) {
    const error = new Error("seatCount must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(normalizedMonths) || normalizedMonths < 1) {
    const error = new Error("months must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  const plan = await getOrCreateDefaultSubscriptionPlan();

  const now = new Date();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;

  let subscription = await Subscription.findOne({
    ownerType,
    ownerId,
  });

  const isContinuingSubscription =
    subscription &&
    ["trialing", "active"].includes(subscription.status) &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now;
  const periodStart = isContinuingSubscription
    ? new Date(subscription.currentPeriodEnd)
    : now;
  const periodEnd = addMonths(periodStart, normalizedMonths);

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
    subscription.payerId = payerId;
    subscription.planId = plan._id;
    subscription.provider = MANUAL_PROVIDER;
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      ownerType,
      ownerId,
      ownerRefModel: ownerType === "barber" ? "User" : "Salon",
      payerId,
      planId: plan._id,
      status: "active",
      seatCount: normalizedSeatCount,
      pricePerSeat: plan.pricePerSeat,
      totalPrice: monthlyTotal,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      provider: MANUAL_PROVIDER,
      lastPaymentAt: now,
    });
  }

  await PaymentRecord.create({
    subscriptionId: subscription._id,
    payerId,
    ownerType,
    ownerId,
    amount: monthlyTotal * normalizedMonths,
    currency: plan.currency,
    seatCount: normalizedSeatCount,
    periodStart,
    periodEnd,
    status: "paid",
    provider: MANUAL_PROVIDER,
    paidAt: now,
  });

  return subscription;
};

export const grantManualSubscription = extendManualSubscription;

const normalizePaymentHistoryLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 100);
};

const buildPaymentAttemptExpiry = (now = new Date()) =>
  new Date(now.getTime() + PAYMENT_ATTEMPT_EXPIRY_HOURS * 60 * 60 * 1000);

const serializePaymentAttempt = (attempt) => {
  if (!attempt) return null;
  const raw = attempt.toObject ? attempt.toObject() : attempt;

  return {
    id: raw.id || raw._id,
    _id: raw._id,
    ownerType: raw.ownerType,
    ownerId: raw.ownerId,
    payerId: raw.payerId,
    purpose: raw.purpose || "subscription",
    subscriptionId: raw.subscriptionId || null,
    bookingId: raw.bookingId || null,
    provider: raw.provider,
    providerPaymentId: raw.providerPaymentId || raw.providerIntentId || null,
    providerIntentId: raw.providerIntentId || null,
    checkoutUrl: raw.checkoutUrl || null,
    amount: raw.amount,
    currency: raw.currency,
    seatCount: raw.seatCount,
    months: raw.months,
    status: raw.status,
    metadata: raw.metadata || {},
    paidAt: raw.paidAt || null,
    confirmedAt: raw.confirmedAt || null,
    failedAt: raw.failedAt || null,
    refundedAt: raw.refundedAt || null,
    expiresAt: raw.expiresAt || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};

const getLatestRecoverableSalonPaymentAttempt = async (salonId) => {
  const attempts = await SubscriptionPaymentAttempt.find({
    purpose: "subscription",
    ownerType: "salon",
    ownerId: salonId,
    status: { $in: RECOVERABLE_PAYMENT_ATTEMPT_STATUSES },
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  return serializePaymentAttempt(attempts?.[0]);
};

const validateSubscriptionRequester = async ({
  requester,
  ownerType,
  ownerId,
  payerId = null,
  action = "manage",
}) => {
  if (!requester?._id) {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  if (requester.role !== "barber") {
    const error = new Error("Only barbers can manage subscription payments");
    error.statusCode = 403;
    throw error;
  }

  if (ownerType === "barber") {
    if (!sameId(requester._id, ownerId) && !sameId(requester._id, payerId)) {
      const error = new Error(`You can only ${action} your own payment attempt`);
      error.statusCode = 403;
      throw error;
    }
    return null;
  }

  if (ownerType === "salon") {
    if (sameId(requester._id, payerId)) return null;

    const salon = await Salon.findById(ownerId);
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    if (!canManageSalonRequest(salon, requester._id)) {
      const error = new Error(`Only salon owner or admin can ${action} payment attempts`);
      error.statusCode = 403;
      throw error;
    }

    return salon;
  }

  const error = new Error("ownerType must be 'barber' or 'salon'");
  error.statusCode = 400;
  throw error;
};

const getAuthorizedPaymentAttempt = async ({
  paymentAttemptId,
  requester,
  action,
}) => {
  const attempt = await SubscriptionPaymentAttempt.findById(paymentAttemptId);
  if (!attempt) {
    const error = new Error("Payment attempt not found");
    error.statusCode = 404;
    throw error;
  }

  await validateSubscriptionRequester({
    requester,
    ownerType: attempt.ownerType,
    ownerId: attempt.ownerId,
    payerId: attempt.payerId,
    action,
  });

  return attempt;
};

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

  return PaymentRecord.find({
    $or: [
      { ownerType: "barber", ownerId: requester._id },
      { payerId: requester._id },
    ],
  })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(normalizePaymentHistoryLimit(limit))
    .lean();
};

export const getSalonSubscriptionPaymentHistory = async ({
  salonId,
  requester,
  limit = 20,
}) => {
  await requireSalonOwnerOrAdmin(salonId, requester?._id);

  return PaymentRecord.find({
    ownerType: "salon",
    ownerId: salonId,
  })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(normalizePaymentHistoryLimit(limit))
    .lean();
};

/**
 * Check if a barber has paid access to the platform.
 * Returns true if:
 *   1. The barber has an active or trialing individual subscription, OR
 *   2. The barber has an active SubscriptionSeat whose parent salon subscription
 *      is active or trialing.
 */
export const barberHasPaidAccess = async (barberId) => {
  // Check individual subscription
  const individualSub = await Subscription.findOne({
    ownerType: "barber",
    ownerId: barberId,
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
  });

  if (individualSub) {
    return true;
  }

  // Check salon seat coverage
  const activeSeat = await SubscriptionSeat.findOne({
    barberId,
    status: "active",
  }).populate("subscriptionId");

  if (!activeSeat || !activeSeat.subscriptionId) {
    return false;
  }

  const parentStatus = activeSeat.subscriptionId.status;
  if (!PAID_SUBSCRIPTION_STATUSES.includes(parentStatus)) {
    return false;
  }

  const seatSalonId = getSeatSalonId(activeSeat);
  const barber = await fetchBarberMembership(barberId);

  return isAcceptedSalonStaffMember(barber, seatSalonId);
};

export const barberHasPaidAccessForSalon = async (barberId, salonId = null) => {
  // Individual barber subscriptions preserve existing global access behavior.
  const individualSub = await Subscription.findOne({
    ownerType: "barber",
    ownerId: barberId,
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
  });

  if (individualSub) {
    return true;
  }

  const activeSeats = await getActiveSeatsForBarber(barberId);
  const matchingSeat = (activeSeats || []).find(
    (seat) => seatHasActiveParentSubscription(seat) && seatMatchesSalon(seat, salonId)
  );

  if (!matchingSeat) {
    return false;
  }

  const seatSalonId = getSeatSalonId(matchingSeat);
  const barber = await fetchBarberMembership(barberId);

  return isAcceptedSalonStaffMember(barber, seatSalonId);
};

export const barberHasPaidSeatAccessForSalon = async (barberId, salonId) => {
  if (!salonId) {
    return barberHasPaidAccess(barberId);
  }

  const activeSeats = await getActiveSeatsForBarber(barberId);
  const matchingSeat = (activeSeats || []).find(
    (seat) => seatHasActiveParentSubscription(seat) && seatMatchesSalon(seat, salonId)
  );

  if (!matchingSeat) {
    return false;
  }

  const seatSalonId = getSeatSalonId(matchingSeat);
  const barber = await fetchBarberMembership(barberId);

  return isAcceptedSalonStaffMember(barber, seatSalonId);
};

export const getPaidAccessByBarberIds = async (barberIds = []) => {
  const ids = [
    ...new Set(barberIds.map((id) => getIdString(id)).filter(Boolean)),
  ];
  const accessByBarberId = new Map(ids.map((id) => [id, false]));

  if (ids.length === 0) {
    return accessByBarberId;
  }

  const queryIds = getIdsForQuery(ids);

  const [individualSubscriptions, activeSeats, barbers] = await Promise.all([
    Subscription.find({
      ownerType: "barber",
      ownerId: { $in: queryIds },
      status: { $in: PAID_SUBSCRIPTION_STATUSES },
    })
      .select("ownerId")
      .lean(),
    SubscriptionSeat.find({
      barberId: { $in: queryIds },
      status: "active",
    })
      .populate("subscriptionId")
      .lean(),
    fetchBarberMemberships(ids),
  ]);
  const barbersById = new Map(
    (barbers || []).map((barber) => [getIdString(barber._id), barber])
  );

  for (const subscription of individualSubscriptions || []) {
    const ownerId = getIdString(subscription.ownerId);
    if (ownerId) accessByBarberId.set(ownerId, true);
  }

  for (const seat of activeSeats || []) {
    const parentStatus = seat?.subscriptionId?.status;
    if (!PAID_SUBSCRIPTION_STATUSES.includes(parentStatus)) continue;

    const barberId = getIdString(seat.barberId);
    const seatSalonId = getSeatSalonId(seat);
    const barber = barbersById.get(barberId);

    if (barberId && isAcceptedSalonStaffMember(barber, seatSalonId)) {
      accessByBarberId.set(barberId, true);
    }
  }

  return accessByBarberId;
};

export const getPaidAccessByBarberIdsForSalon = async (
  barberIds = [],
  salonId = null
) => {
  const ids = [
    ...new Set(barberIds.map((id) => getIdString(id)).filter(Boolean)),
  ];
  const accessByBarberId = new Map(ids.map((id) => [id, false]));

  if (ids.length === 0) {
    return accessByBarberId;
  }

  const queryIds = getIdsForQuery(ids);

  const [individualSubscriptions, activeSeats, barbers] = await Promise.all([
    Subscription.find({
      ownerType: "barber",
      ownerId: { $in: queryIds },
      status: { $in: PAID_SUBSCRIPTION_STATUSES },
    })
      .select("ownerId")
      .lean(),
    SubscriptionSeat.find({
      barberId: { $in: queryIds },
      status: "active",
    })
      .populate("subscriptionId")
      .lean(),
    fetchBarberMemberships(ids),
  ]);
  const barbersById = new Map(
    (barbers || []).map((barber) => [getIdString(barber._id), barber])
  );

  for (const subscription of individualSubscriptions || []) {
    const ownerId = getIdString(subscription.ownerId);
    if (ownerId) accessByBarberId.set(ownerId, true);
  }

  for (const seat of activeSeats || []) {
    if (!seatHasActiveParentSubscription(seat)) continue;
    if (!seatMatchesSalon(seat, salonId)) continue;

    const barberId = getIdString(seat.barberId);
    const seatSalonId = getSeatSalonId(seat);
    const barber = barbersById.get(barberId);

    if (barberId && isAcceptedSalonStaffMember(barber, seatSalonId)) {
      accessByBarberId.set(barberId, true);
    }
  }

  return accessByBarberId;
};

export const expireSubscriptions = async ({ now = new Date() } = {}) => {
  const subscriptions = await Subscription.find({
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
    $or: [
      { currentPeriodEnd: { $lt: now } },
      { trialEndsAt: { $lt: now } },
    ],
  });
  const summary = {
    checkedCount: subscriptions.length,
    expiredCount: 0,
    errorsCount: 0,
    errors: [],
  };

  for (const subscription of subscriptions) {
    try {
      subscription.status = "expired";
      await subscription.save();
      summary.expiredCount++;
    } catch (error) {
      summary.errorsCount++;
      summary.errors.push({
        subscriptionId: String(subscription._id),
        message: error.message,
      });
    }
  }

  return summary;
};

export const createSubscriptionPaymentIntent = async ({
  requester,
  ownerType,
  ownerId,
  seatCount = 1,
  months = 1,
  providerName = getConfiguredPaymentProviderName(),
  now = new Date(),
}) => {
  if (!["barber", "salon"].includes(ownerType)) {
    const error = new Error("ownerType must be 'barber' or 'salon'");
    error.statusCode = 400;
    throw error;
  }

  if (!ownerId) {
    const error = new Error("ownerId is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedSeatCount = Number(seatCount ?? 1);
  const normalizedMonths = Number(months ?? 1);
  if (!Number.isInteger(normalizedSeatCount) || normalizedSeatCount < 1) {
    const error = new Error("seatCount must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(normalizedMonths) || normalizedMonths < 1) {
    const error = new Error("months must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  await validateSubscriptionRequester({
    requester,
    ownerType,
    ownerId,
    payerId: ownerType === "barber" ? requester?._id : null,
    action: "prepare",
  });

  const plan = await getOrCreateDefaultSubscriptionPlan();
  const monthlyTotal = plan.pricePerSeat * normalizedSeatCount;
  const amount = monthlyTotal * normalizedMonths;
  const provider = getPaymentProvider(providerName);
  const paymentIntent = await provider.createPaymentIntent({
    amount,
    currency: plan.currency,
    metadata: {
      ownerType,
      ownerId: String(ownerId),
      seatCount: normalizedSeatCount,
      months: normalizedMonths,
      planCode: plan.code,
    },
  });
  const attempt = await SubscriptionPaymentAttempt.create({
    purpose: "subscription",
    ownerType,
    ownerId,
    payerId: requester._id,
    provider: providerName,
    providerPaymentId:
      paymentIntent.providerPaymentId || paymentIntent.providerIntentId || null,
    providerIntentId:
      paymentIntent.providerIntentId || paymentIntent.providerPaymentId || null,
    checkoutUrl: paymentIntent.checkoutUrl || null,
    amount,
    currency: plan.currency,
    seatCount: normalizedSeatCount,
    months: normalizedMonths,
    status: paymentIntent.status || "pending",
    metadata: {
      ownerType,
      ownerId: String(ownerId),
      seatCount: normalizedSeatCount,
      months: normalizedMonths,
      planCode: plan.code,
      monthlyTotal,
    },
    createdBy: requester._id,
    expiresAt: buildPaymentAttemptExpiry(now),
  });

  return {
    ...paymentIntent,
    paymentAttemptId: getIdString(attempt._id),
    paymentAttempt: serializePaymentAttempt(attempt),
    ownerType,
    ownerId: String(ownerId),
    seatCount: normalizedSeatCount,
    months: normalizedMonths,
    pricePerSeat: plan.pricePerSeat,
    monthlyTotal,
    amount,
    currency: plan.currency,
    status: attempt.status,
  };
};

export const getSubscriptionPaymentAttempt = async ({
  paymentAttemptId,
  requester,
}) => {
  const attempt = await getAuthorizedPaymentAttempt({
    paymentAttemptId,
    requester,
    action: "view",
  });

  return serializePaymentAttempt(attempt);
};

export const cancelSubscriptionPaymentAttempt = async ({
  paymentAttemptId,
  requester,
}) => {
  const attempt = await getAuthorizedPaymentAttempt({
    paymentAttemptId,
    requester,
    action: "cancel",
  });

  if (attempt.status !== "pending") {
    const error = new Error("Only pending payment attempts can be cancelled");
    error.statusCode = 400;
    throw error;
  }

  applyPaymentAttemptTransition(attempt, "cancelled");
  await attempt.save();

  return serializePaymentAttempt(attempt);
};

export const confirmSubscriptionPaymentAttempt = async ({
  paymentAttemptId,
  confirmedBy,
  now = new Date(),
}) => {
  if (!isDevPaymentConfirmationAvailable()) {
    const error = new Error("Dev payment confirmation is disabled in production");
    error.statusCode = 403;
    error.code = "DEV_PAYMENT_CONFIRM_DISABLED";
    throw error;
  }

  const attempt = await getAuthorizedPaymentAttempt({
    paymentAttemptId,
    requester: confirmedBy,
    action: "confirm",
  });

  if ((attempt.purpose || "subscription") !== "subscription") {
    const error = new Error("Only subscription payment attempts can be dev-confirmed");
    error.statusCode = 400;
    throw error;
  }

  if (attempt.status === "paid") {
    return {
      paymentAttempt: serializePaymentAttempt(attempt),
      subscription: attempt.subscriptionId
        ? serializeSubscriptionStatus(
            await Subscription.findById(attempt.subscriptionId),
            null,
            now
          )
        : null,
      idempotent: true,
    };
  }

  if (!["pending", "requires_action"].includes(attempt.status)) {
    const error = new Error("Only pending payment attempts can be confirmed");
    error.statusCode = 400;
    throw error;
  }

  if (attempt.expiresAt && new Date(attempt.expiresAt) <= now) {
    attempt.status = "expired";
    await attempt.save();

    const error = new Error("Payment attempt has expired");
    error.statusCode = 400;
    throw error;
  }

  const subscription = await extendManualSubscription({
    ownerType: attempt.ownerType,
    ownerId: attempt.ownerId,
    payerId: attempt.payerId,
    seatCount: attempt.seatCount,
    months: attempt.months,
  });

  applyPaymentAttemptTransition(attempt, "paid", now);
  attempt.subscriptionId = subscription._id;
  attempt.providerPaymentId =
    attempt.providerPaymentId || `${attempt.provider}:${attempt._id}`;
  attempt.providerIntentId =
    attempt.providerIntentId || attempt.providerPaymentId;
  await attempt.save();

  return {
    paymentAttempt: serializePaymentAttempt(attempt),
    subscription: serializeSubscriptionStatus(subscription, null, now),
    idempotent: false,
  };
};

/**
 * Get a user's subscription access details.
 * For barbers: returns individual subscription and salon seat coverage.
 * For clients: returns a clear "not applicable" indicator.
 */
export const getMySubscriptionAccess = async (user) => {
  if (user.role === "client") {
    return {
      hasAccess: false,
      role: "client",
      applicability: "not-applicable",
      message:
        "Clients use the platform free of charge. Subscriptions are for barbers and salon owners.",
      individualSubscription: null,
      salonSeatCoverage: null,
      coveredBy: null,
      defaultPlan: null,
      manualActivationAvailable: isManualActivationAvailable(),
    };
  }

  // role is "barber"
  const barberId = user._id;
  const [individualSubscription, plan] = await Promise.all([
    Subscription.findOne({
      ownerType: "barber",
      ownerId: barberId,
    })
      .populate("planId")
      .lean(),
    getOrCreateDefaultSubscriptionPlan(),
  ]);
  const serializedIndividualSubscription = serializeSubscriptionStatus(
    individualSubscription,
    plan
  );

  // Check salon seat coverage
  const activeSeat = await SubscriptionSeat.findOne({
    barberId,
    status: "active",
  })
    .populate({
      path: "subscriptionId",
      populate: { path: "planId" },
    })
    .lean();

  let hasAccess = false;
  let salonSeatCoverage = null;
  let coveredBy = null;

  if (
    serializedIndividualSubscription &&
    ["trialing", "active"].includes(serializedIndividualSubscription.status) &&
    !serializedIndividualSubscription.isExpired
  ) {
    hasAccess = true;
    coveredBy = "individual";
  }

  if (activeSeat && activeSeat.subscriptionId) {
    const parentStatus = activeSeat.subscriptionId.status;
    const seatSalonId = getSeatSalonId(activeSeat);
    const barber = await fetchBarberMembership(barberId);

    if (
      (parentStatus === "active" || parentStatus === "trialing") &&
      isAcceptedSalonStaffMember(barber, seatSalonId)
    ) {
      hasAccess = true;
      salonSeatCoverage = {
        ...activeSeat,
        subscriptionId: serializeSubscriptionStatus(
          activeSeat.subscriptionId,
          activeSeat.subscriptionId?.planId || plan
        ),
      };
      coveredBy = coveredBy ? "both" : "salon";
    }
  }

  return {
    hasAccess,
    role: "barber",
    applicability: "applicable",
    individualSubscription: serializedIndividualSubscription,
    salonSeatCoverage,
    coveredBy,
    defaultPlan: plan
      ? {
          code: plan.code,
          name: plan.name,
          pricePerSeat: plan.pricePerSeat,
          currency: plan.currency,
          interval: plan.interval,
        }
      : null,
    manualActivationAvailable: isManualActivationAvailable(),
  };
};

/* ══════════════════════════════════════════════════════════
 *  Phase 2 — Salon seat assignment
 * ══════════════════════════════════════════════════════════ */

/* ── Internal authorization helpers ─────────────────────── */

/**
 * Fetch a salon and verify the requester is the owner or an admin.
 * On success returns the salon document.
 * Throws an error with a statusCode property on failure.
 */
const requireSalonOwnerOrAdmin = async (salonId, requesterId) => {
  if (!requesterId) {
    const err = new Error("Authentication required");
    err.statusCode = 401;
    throw err;
  }

  const salon = await Salon.findById(salonId);
  if (!salon) {
    const err = new Error("Salon not found");
    err.statusCode = 404;
    throw err;
  }

  if (!canManageSalonRequest(salon, requesterId)) {
    const err = new Error("Only salon owner or admin can perform this action");
    err.statusCode = 403;
    throw err;
  }

  return salon;
};

/**
 * Check if a barber user is accepted staff for the given salon.
 */
const isApprovedMember = (barber, salonId) => {
  return isAcceptedSalonStaffMember(barber, salonId);
};

/* ── Public service functions ───────────────────────────── */

export const revokeSalonSeatsForRemovedMember = async ({
  salonId,
  barberId,
  revokedBy = null,
  now = new Date(),
}) => {
  if (!salonId || !barberId) {
    const err = new Error("salonId and barberId are required");
    err.statusCode = 400;
    throw err;
  }

  const activeSeats = await SubscriptionSeat.find({
    barberId,
    status: "active",
  }).populate("subscriptionId");
  const revokedSeats = [];

  for (const seat of activeSeats || []) {
    if (getSeatSalonId(seat) !== getIdString(salonId)) continue;

    seat.status = "revoked";
    seat.revokedAt = now;
    await seat.save();
    revokedSeats.push(seat);
  }

  return {
    salonId: getIdString(salonId),
    barberId: getIdString(barberId),
    revokedBy: getIdString(revokedBy) || null,
    revokedCount: revokedSeats.length,
    seats: revokedSeats,
  };
};

/**
 * Get salon subscription details including seats and approved members.
 *
 * @param {Object} params
 * @param {string} params.salonId
 * @param {Object} params.requester - Express req.user (must have _id)
 * @returns {Object} { subscription, activeSeats, revokedSeats, availableSeatCount, approvedMembers }
 */
export const getSalonSubscriptionDetails = async ({ salonId, requester }) => {
  const salon = await requireSalonOwnerOrAdmin(salonId, requester?._id);
  const plan = await getOrCreateDefaultSubscriptionPlan();

  // Fetch the salon's subscription (active/trialing or any)
  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
  }).lean();
  const serializedSubscription = serializeSubscriptionStatus(subscription, plan);

  // Fetch active and revoked seats, populated with barber basic info
  const [rawActiveSeats, rawRevokedSeats, pendingPaymentAttempt] = await Promise.all([
    SubscriptionSeat.find({
      subscriptionId: subscription?._id,
      status: "active",
    })
      .populate("barberId", SUBSCRIPTION_SEAT_BARBER_FIELDS)
      .lean(),
    SubscriptionSeat.find({
      subscriptionId: subscription?._id,
      status: "revoked",
    })
      .populate("barberId", SUBSCRIPTION_SEAT_BARBER_FIELDS)
      .sort({ revokedAt: -1 })
      .limit(20)
      .lean(),
    getLatestRecoverableSalonPaymentAttempt(salon._id),
  ]);
  const activeSeats = filterAcceptedStaffSeats(rawActiveSeats, salon._id);
  const revokedSeats = filterAcceptedStaffSeats(rawRevokedSeats, salon._id);

  // Compute available seat count
  const activeSeatCount = activeSeats.length;
  const availableSeatCount = serializedSubscription
    ? Math.max(0, serializedSubscription.seatCount - activeSeatCount)
    : 0;

  // Fetch accepted staff only; chair renters remain independently billed.
  const approvedMemberDocs = await User.find(
    {
      role: "barber",
      $or: [
        {
          salons: {
            $elemMatch: {
              salon: salon._id,
              status: "approved",
              $and: [
                {
                  $or: [
                    { relationshipType: "staff" },
                    { relationshipType: { $exists: false } },
                  ],
                },
                {
                  $or: [
                    { relationshipStatus: "accepted" },
                    { relationshipStatus: { $exists: false } },
                  ],
                },
              ],
            },
          },
        },
        { salon: salon._id, salonStatus: "approved" },
      ],
    },
    "name phone avatarUrl profession salon salonStatus salons.salon salons.status salons.relationshipType salons.relationshipStatus"
  ).lean();
  const approvedMembers = approvedMemberDocs
    .filter((member) => isAcceptedSalonStaffMember(member, salon._id))
    .map(sanitizeApprovedMember);

  return {
    subscription: serializedSubscription,
    activeSeats,
    revokedSeats,
    availableSeatCount,
    approvedMembers,
    pendingPaymentAttempt,
    defaultPlan: plan
      ? {
          code: plan.code,
          name: plan.name,
          pricePerSeat: plan.pricePerSeat,
          currency: plan.currency,
          interval: plan.interval,
        }
      : null,
    manualActivationAvailable: isManualActivationAvailable(),
  };
};

/**
 * Assign a salon subscription seat to a barber.
 *
 * @param {Object} params
 * @param {string} params.salonId
 * @param {string} params.barberId
 * @param {Object} params.assignedBy - Express req.user (must have _id)
 * @returns {Object} the SubscriptionSeat document
 */
export const assignSalonSubscriptionSeat = async ({
  salonId,
  barberId,
  assignedBy,
}) => {
  const salon = await requireSalonOwnerOrAdmin(salonId, assignedBy?._id);

  // Fetch subscription
  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
    status: { $in: ["trialing", "active"] },
  });

  if (!subscription) {
    const err = new Error(
      "Salon does not have an active or trialing subscription. Please activate a subscription first."
    );
    err.statusCode = 400;
    throw err;
  }

  // Verify barber exists
  const barber = await User.findById(barberId);
  if (!barber || barber.role !== "barber") {
    const err = new Error("Barber not found");
    err.statusCode = 404;
    throw err;
  }

  // Verify barber is accepted staff for this salon.
  if (!isApprovedMember(barber, salonId)) {
    const err = new Error(
      "Barber is not an accepted staff member of this salon"
    );
    err.statusCode = 400;
    throw err;
  }

  // Check for existing active seat for this subscription + barber
  const existingActive = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "active",
  });

  if (existingActive) {
    return existingActive;
  }

  // Count currently active seats after duplicate detection so repeated
  // assignment attempts for the same barber remain idempotent.
  const activeSeatCount = await countActiveAcceptedStaffSeats({
    subscriptionId: subscription._id,
    salonId: salon._id,
  });

  if (activeSeatCount >= subscription.seatCount) {
    const err = new Error(
      `Cannot assign more than ${subscription.seatCount} active seats. Please increase your paid seat count first.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Check for existing revoked seat for this subscription + barber — reactivate
  const existingRevoked = await SubscriptionSeat.findOne({
    subscriptionId: subscription._id,
    barberId,
    status: "revoked",
  });

  if (existingRevoked) {
    existingRevoked.status = "active";
    existingRevoked.revokedAt = null;
    existingRevoked.assignedBy = assignedBy._id;
    existingRevoked.assignedAt = new Date();
    await existingRevoked.save();
    return existingRevoked;
  }

  // Create new seat
  try {
    const seat = await SubscriptionSeat.create({
      subscriptionId: subscription._id,
      salonId: salon._id,
      barberId: barber._id,
      assignedBy: assignedBy._id,
      status: "active",
      assignedAt: new Date(),
    });

    return seat;
  } catch (error) {
    if (error?.code === 11000) {
      const activeSeat = await SubscriptionSeat.findOne({
        subscriptionId: subscription._id,
        barberId,
        status: "active",
      });

      if (activeSeat) return activeSeat;

      const err = new Error("Seat is already assigned to this barber");
      err.statusCode = 400;
      throw err;
    }

    throw error;
  }
};

/**
 * Revoke an active salon subscription seat.
 *
 * @param {Object} params
 * @param {string} params.seatId
 * @param {Object} params.requester - Express req.user (must have _id)
 * @returns {Object} the updated SubscriptionSeat
 */
export const revokeSalonSubscriptionSeat = async ({ seatId, requester }) => {
  if (!requester?._id) {
    const err = new Error("Authentication required");
    err.statusCode = 401;
    throw err;
  }

  // Fetch seat with subscription populated to verify salon ownership
  const seat = await SubscriptionSeat.findById(seatId)
    .populate("subscriptionId");

  if (!seat) {
    const err = new Error("Seat not found");
    err.statusCode = 404;
    throw err;
  }

  if (seat.status !== "active") {
    const err = new Error("Only active seats can be revoked");
    err.statusCode = 400;
    throw err;
  }

  // Verify requester is owner/admin of the parent salon
  const salonId = seat.subscriptionId?.ownerId || seat.salonId;
  await requireSalonOwnerOrAdmin(salonId, requester._id);

  // Revoke
  seat.status = "revoked";
  seat.revokedAt = new Date();
  await seat.save();

  return seat;
};

/**
 * Update the seat count of a salon subscription.
 *
 * @param {Object} params
 * @param {string} params.salonId
 * @param {number} params.seatCount - New seat count (>= 1)
 * @param {Object} params.requester - Express req.user (must have _id)
 * @returns {Object} the updated Subscription
 */
export const updateSalonSubscriptionSeatCount = async ({
  salonId,
  seatCount,
  requester,
}) => {
  await requireSalonOwnerOrAdmin(salonId, requester?._id);

  if (!Number.isInteger(seatCount) || seatCount < 1) {
    const err = new Error("Seat count must be at least 1");
    err.statusCode = 400;
    throw err;
  }

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
  });

  if (!subscription) {
    const err = new Error(
      "Salon does not have a subscription. Please create one first."
    );
    err.statusCode = 400;
    throw err;
  }

  if (seatCount > subscription.seatCount) {
    const err = new Error(
      "Increasing paid seats requires preparing payment and activating the subscription."
    );
    err.statusCode = 400;
    throw err;
  }

  // Cannot reduce below current active seat count
  const activeSeatCount = await SubscriptionSeat.countDocuments({
    subscriptionId: subscription._id,
    status: "active",
  });

  if (seatCount < activeSeatCount) {
    const err = new Error(
      `Cannot reduce seat count below ${activeSeatCount} active seats currently assigned. Please revoke seats first.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Update seat count and total price
  const plan = await getOrCreateDefaultSubscriptionPlan();
  subscription.seatCount = seatCount;
  subscription.totalPrice = plan.pricePerSeat * seatCount;
  subscription.pricePerSeat = plan.pricePerSeat;
  await subscription.save();

  return subscription;
};
