import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import { serializeUserPaymentRecord } from "../payment/subscriptionPaymentSerializers.js";
import { serializeSubscriptionStatus } from "./subscriptionSerializers.js";
import {
  requireSalonOwnerOrAdmin,
} from "./subscriptionAuthorization.js";
import {
  getLatestRecoverableSalonPaymentAttempt,
} from "./paymentAttemptHelpers.js";
import {
  filterAcceptedStaffSeats,
  isAcceptedSalonStaffMember,
  sanitizeApprovedMember,
} from "./seatHelpers.js";
import {
  SUBSCRIPTION_SEAT_BARBER_FIELDS,
  getOwnerIdForQuery,
  resolveQuery,
  subscriptionHasPaidAccess,
  PAID_SUBSCRIPTION_STATUSES,
  normalizePaymentHistoryLimit,
} from "./subscriptionHelpers.js";
import { getOrCreateDefaultSubscriptionPlan, isManualActivationAvailable } from "./subscriptionPlanHelpers.js";

/**
 * Check if a salon has an active or trialing subscription.
 */
export const salonHasActiveSubscription = async (
  salonId,
  { now = new Date() } = {}
) => {
  if (!salonId) return false;

  const subscription = await resolveQuery(
    Subscription.findOne({
      ownerType: "salon",
      ownerId: getOwnerIdForQuery(salonId),
      status: { $in: PAID_SUBSCRIPTION_STATUSES },
    })
  );

  return subscriptionHasPaidAccess(subscription, now, {
    statusAlreadyFiltered: true,
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
 * Get detailed salon subscription info for the owner/admin.
 */
export const getSalonSubscriptionDetails = async ({ salonId, requester }) => {
  const salon = await requireSalonOwnerOrAdmin(salonId, requester?._id);
  const plan = await getOrCreateDefaultSubscriptionPlan();

  const subscription = await Subscription.findOne({
    ownerType: "salon",
    ownerId: salonId,
  }).lean();
  const serializedSubscription = serializeSubscriptionStatus(subscription, plan);

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

  const activeSeatCount = activeSeats.length;
  const activeCapacity = serializedSubscription?.isActive
    ? serializedSubscription.seatCount
    : 0;
  const availableSeatCount = Math.max(0, activeCapacity - activeSeatCount);

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
    "name phone avatarUrl profession salon salonStatus salons.salon salons.status salons.relationshipType salons.relationshipStatus salons.worksAsSpecialist"
  ).lean();
  const approvedMembers = approvedMemberDocs
    .filter((member) => isAcceptedSalonStaffMember(member, salon._id))
    .map(sanitizeApprovedMember);

  return {
    subscription: serializedSubscription,
    activeSeats,
    revokedSeats,
    availableSeatCount,
    activeCapacity,
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
 * Get salon subscription payment history.
 */
export const getSalonSubscriptionPaymentHistory = async ({
  salonId,
  requester,
  limit = 20,
}) => {
  await requireSalonOwnerOrAdmin(salonId, requester?._id);

  const payments = await PaymentRecord.find({
    ownerType: "salon",
    ownerId: salonId,
  })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(normalizePaymentHistoryLimit(limit))
    .lean();

  return payments.map(serializeUserPaymentRecord);
};
