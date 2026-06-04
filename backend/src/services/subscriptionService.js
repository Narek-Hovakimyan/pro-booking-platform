import mongoose from "mongoose";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import PaymentRecord from "../models/PaymentRecord.js";
import Salon from "../models/Salon.js";
import User from "../models/User.js";
import {
  canManageSalonRequest,
  sameId,
} from "../utils/salonPermissions.js";

const DEFAULT_PLAN_CODE = "barber_monthly";
const TRIAL_DAYS = 14;
const GRACE_DAYS = 30;
const PAID_SUBSCRIPTION_STATUSES = ["trialing", "active"];

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const getIdsForQuery = (ids) =>
  ids.map((id) =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
  );

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
 * Grant a manual (dev/test) subscription.
 * Creates or updates an active subscription with the given seat count and months.
 * Creates a PaymentRecord with status "paid" and provider "manual".
 */
export const grantManualSubscription = async ({
  ownerType,
  ownerId,
  payerId,
  seatCount = 1,
  months = 1,
}) => {
  const plan = await getOrCreateDefaultSubscriptionPlan();

  const now = new Date();
  const periodEnd = new Date(
    now.getFullYear(),
    now.getMonth() + months,
    now.getDate()
  );

  const totalPrice = plan.pricePerSeat * seatCount;

  // Upsert: find existing active/trialing subscription or create new one
  let subscription = await Subscription.findOne({
    ownerType,
    ownerId,
    status: { $in: ["trialing", "active"] },
  });

  if (subscription) {
    // Update existing
    subscription.status = "active";
    subscription.seatCount = seatCount;
    subscription.pricePerSeat = plan.pricePerSeat;
    subscription.totalPrice = totalPrice;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = periodEnd;
    subscription.lastPaymentAt = now;
    subscription.trialEndsAt = undefined;
    subscription.payerId = payerId;
    subscription.planId = plan._id;
    subscription.provider = "manual";
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      ownerType,
      ownerId,
      ownerRefModel: ownerType === "barber" ? "User" : "Salon",
      payerId,
      planId: plan._id,
      status: "active",
      seatCount,
      pricePerSeat: plan.pricePerSeat,
      totalPrice,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      provider: "manual",
      lastPaymentAt: now,
    });
  }

  // Create payment record
  await PaymentRecord.create({
    subscriptionId: subscription._id,
    payerId,
    ownerType,
    ownerId,
    amount: totalPrice,
    currency: "AMD",
    seatCount,
    periodStart: now,
    periodEnd,
    status: "paid",
    provider: "manual",
    paidAt: now,
  });

  return subscription;
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
  return PAID_SUBSCRIPTION_STATUSES.includes(parentStatus);
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

  const [individualSubscriptions, activeSeats] = await Promise.all([
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
  ]);

  for (const subscription of individualSubscriptions || []) {
    const ownerId = getIdString(subscription.ownerId);
    if (ownerId) accessByBarberId.set(ownerId, true);
  }

  for (const seat of activeSeats || []) {
    const parentStatus = seat?.subscriptionId?.status;
    if (PAID_SUBSCRIPTION_STATUSES.includes(parentStatus)) {
      const barberId = getIdString(seat.barberId);
      if (barberId) accessByBarberId.set(barberId, true);
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
    individualSubscription &&
    ["trialing", "active"].includes(individualSubscription.status)
  ) {
    hasAccess = true;
    coveredBy = "individual";
  }

  if (activeSeat && activeSeat.subscriptionId) {
    const parentStatus = activeSeat.subscriptionId.status;
    if (parentStatus === "active" || parentStatus === "trialing") {
      hasAccess = true;
      salonSeatCoverage = activeSeat;
      coveredBy = coveredBy ? "both" : "salon";
    }
  }

  return {
    hasAccess,
    role: "barber",
    applicability: "applicable",
    individualSubscription: individualSubscription || null,
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
 * Check if a barber user is an approved member of the given salon.
 */
const isApprovedMember = (barber, salonId) => {
  const stringId = String(salonId);

  return (
    (barber.salons || []).some(
      (s) => String(s.salon) === stringId && s.status === "approved"
    ) ||
    (String(barber.salon) === stringId && barber.salonStatus === "approved")
  );
};

/* ── Public service functions ───────────────────────────── */

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

  // Fetch the salon's subscription (active/trialing or any)
  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
  }).lean();

  // Fetch active and revoked seats, populated with barber basic info
  const [activeSeats, revokedSeats] = await Promise.all([
    SubscriptionSeat.find({
      subscriptionId: subscription?._id,
      status: "active",
    })
      .populate("barberId", "name phone avatarUrl profession")
      .lean(),
    SubscriptionSeat.find({
      subscriptionId: subscription?._id,
      status: "revoked",
    })
      .populate("barberId", "name phone avatarUrl profession")
      .sort({ revokedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  // Compute available seat count
  const activeSeatCount = activeSeats.length;
  const availableSeatCount = subscription
    ? Math.max(0, subscription.seatCount - activeSeatCount)
    : 0;

  // Fetch approved members (barbers whose salons array has this salon as "approved")
  const approvedMembers = await User.find(
    {
      role: "barber",
      $or: [
        { "salons.salon": salon._id, "salons.status": "approved" },
        { salon: salon._id, salonStatus: "approved" },
      ],
    },
    "name phone avatarUrl profession"
  ).lean();

  return {
    subscription: subscription || null,
    activeSeats,
    revokedSeats,
    availableSeatCount,
    approvedMembers,
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

  // Count currently active seats
  const activeSeatCount = await SubscriptionSeat.countDocuments({
    subscriptionId: subscription._id,
    status: "active",
  });

  if (activeSeatCount >= subscription.seatCount) {
    const err = new Error(
      `Cannot assign more than ${subscription.seatCount} active seats. Please increase your seat count first.`
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

  // Verify barber is an approved member of this salon
  if (!isApprovedMember(barber, salonId)) {
    const err = new Error(
      "Barber is not an approved member of this salon"
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
  const seat = await SubscriptionSeat.create({
    subscriptionId: subscription._id,
    salonId: salon._id,
    barberId: barber._id,
    assignedBy: assignedBy._id,
    status: "active",
    assignedAt: new Date(),
  });

  return seat;
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

  if (typeof seatCount !== "number" || seatCount < 1) {
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
