import mongoose from "mongoose";

import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import ClientRelationship from "../../models/ClientRelationship.js";
import EventCertificate from "../../models/EventCertificate.js";
import EventRegistration from "../../models/EventRegistration.js";
import EventReview from "../../models/EventReview.js";
import Favorite from "../../models/Favorite.js";
import LoyaltyProgress from "../../models/LoyaltyProgress.js";
import LoyaltyRewardRedemption from "../../models/LoyaltyRewardRedemption.js";
import MediaObject, { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import Message from "../../models/Message.js";
import Notification from "../../models/Notification.js";
import PaymentEvent from "../../models/PaymentEvent.js";
import PaymentRecord from "../../models/PaymentRecord.js";
import PaymentTransaction from "../../models/PaymentTransaction.js";
import PortfolioPhoto from "../../models/PortfolioPhoto.js";
import RefreshSession from "../../models/RefreshSession.js";
import Review from "../../models/Review.js";
import Salon from "../../models/Salon.js";
import SalonFavorite from "../../models/SalonFavorite.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import SalonReview from "../../models/SalonReview.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import WaitlistEntry from "../../models/WaitlistEntry.js";
import { hasValidRecentAuthentication } from "../auth/recentAuthenticationService.js";
import AccountDeletionRecord from "../../models/AccountDeletionRecord.js";
import { beginAccountDeletionFence, completeAccountDeletionFence, releaseAccountDeletionFence } from "./accountDeletionFenceService.js";

const ACTIVE_BOOKING_STATUSES = ["pending", "accepted", "confirmed"];
const ACTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due"];
const DELETED_USER = "Deleted user";

export class AccountDeletionError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "AccountDeletionError";
    this.statusCode = statusCode;
  }
}

const queryResult = async (query) => query?.lean ? query.lean() : query;
const unknownCommit = (error) =>
  error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
  error?.errorLabels?.includes("UnknownTransactionCommitResult");
const update = (Model, filter, value, session) => Model.updateMany(filter, value, { session });
const ids = (rows) => rows.map((row) => row._id);
const completedDeletionTombstone = async ({ userId, deletionId, RecordModel }) => {
  try {
    return Boolean(await RecordModel?.exists?.({ userId, deletionId, state: "deleted" }));
  } catch {
    return false;
  }
};

const assertPreconditions = async ({ userId, session, models }) => {
  const [owner, activeBooking, subscription] = await Promise.all([
    queryResult(models.Salon.findOne({ ownerId: userId }, null, { session })),
    queryResult(models.Booking.findOne({ $or: [{ clientId: userId }, { barberId: userId }], status: { $in: ACTIVE_BOOKING_STATUSES } }, null, { session })),
    queryResult(models.Subscription.findOne({
      status: { $in: ACTIVE_SUBSCRIPTION_STATUSES },
      $or: [{ payerId: userId }, { ownerType: "barber", ownerId: userId }],
    }, null, { session })),
  ]);
  if (owner) throw new AccountDeletionError("Transfer or close owned salons before deleting your account", 409);
  if (activeBooking) throw new AccountDeletionError("Resolve active bookings before deleting your account", 409);
  if (subscription) throw new AccountDeletionError("Cancel unresolved subscriptions before deleting your account", 409);
};

const markMediaPending = (models, filter, session) =>
  update(models.MediaObject, { ...filter, status: MEDIA_OBJECT_STATES.ACTIVE }, {
    $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, deletePendingAt: new Date() },
  }, session);

const scrubBookings = async ({ userId, session, models }) => {
  const privateBookings = await queryResult(models.Booking.find({ clientId: userId }, "_id", { session }));
  await Promise.all([
    update(models.Booking, { clientId: userId }, {
      $set: { clientName: DELETED_USER, clientPhone: "", phone: "", note: "", referenceImages: [] },
    }, session),
    update(models.Booking, { barberId: userId }, { $set: { note: "" } }, session),
    update(models.Booking, { rejectedBy: userId }, { $set: { rejectionReason: "", rejectedBy: null } }, session),
    update(models.Booking, { cancelledBy: userId }, { $set: { cancelReason: "", cancelledBy: null } }, session),
  ]);
  if (privateBookings.length) {
    await markMediaPending(models, {
      ownerModel: "Booking",
      ownerId: { $in: ids(privateBookings) },
      mediaClass: "booking-reference",
    }, session);
  }
};

const scrubHistory = async ({ userId, session, models }) => {
  const paymentTransactions = await queryResult(models.PaymentTransaction.find({ userId }, "_id", { session }));
  await Promise.all([
    update(models.Review, { clientId: userId }, { $set: { comment: DELETED_USER } }, session),
    update(models.Review, { "reply.repliedBy": userId }, { $set: { "reply.message": "", "reply.repliedBy": null } }, session),
    update(models.SalonReview, { clientId: userId }, { $set: { comment: DELETED_USER } }, session),
    update(models.SalonReview, { "reply.repliedBy": userId }, { $set: { "reply.message": "", "reply.repliedBy": null } }, session),
    update(models.EventReview, { userId }, { $set: { comment: DELETED_USER } }, session),
    update(models.Message, { $or: [{ senderId: userId }, { receiverId: userId }] }, { $set: { text: DELETED_USER } }, session),
    update(models.EventRegistration, { $or: [{ userId }, { barberId: userId }] }, { $set: { message: "", rejectionReason: "" } }, session),
    update(models.PaymentTransaction, { userId }, { $set: { userId: null } }, session),
    update(models.PaymentRecord, { payerId: userId }, { $set: { payerId: null } }, session),
    update(models.SubscriptionPaymentAttempt, { createdBy: userId }, { $set: { createdBy: null } }, session),
  ]);
  void paymentTransactions;
};

const scrubCertificates = async ({ userId, session, models }) => {
  const certificates = await queryResult(models.EventCertificate.find({ $or: [{ userId }, { organizerId: userId }] }, "_id", { session }));
  if (!certificates.length) return;
  const revoke = {
    $set: {
      status: "revoked",
      revokedAt: new Date(),
      revokedReason: "account_deleted",
      fileUrl: "",
      fileType: "",
      originalFileName: "",
      mediaObjectId: null,
    },
  };
  await update(models.EventCertificate, { userId }, { ...revoke, $set: { ...revoke.$set, participantName: DELETED_USER } }, session);
  await update(models.EventCertificate, { organizerId: userId }, { ...revoke, $set: { ...revoke.$set, organizerName: DELETED_USER } }, session);
  await markMediaPending(models, {
    ownerModel: "EventCertificate",
    ownerId: { $in: ids(certificates) },
    mediaClass: "event-certificate",
  }, session);
};

const removePrivateState = async ({ userId, session, models }) => {
  const portfolios = await queryResult(models.PortfolioPhoto.find({ barberId: userId }, "_id", { session }));
  await Promise.all([
    models.Notification.deleteMany({ userId }, { session }),
    models.Favorite.deleteMany({ $or: [{ clientId: userId }, { barberId: userId }] }, { session }),
    models.SalonFavorite.deleteMany({ clientId: userId }, { session }),
    models.ClientRelationship.deleteMany({ $or: [{ clientId: userId }, { barberId: userId }, { updatedBy: userId }] }, { session }),
    models.LoyaltyProgress.deleteMany({ clientId: userId }, { session }),
    models.LoyaltyRewardRedemption.deleteMany({ $or: [{ clientId: userId }, { barberId: userId }] }, { session }),
    models.WaitlistEntry.deleteMany({ $or: [{ clientId: userId }, { barberId: userId }] }, { session }),
    models.SalonJoinRequest.deleteMany({ barberId: userId }, { session }),
    models.Service.deleteMany({ barberId: userId }, { session }),
    models.Schedule.deleteMany({ barberId: userId }, { session }),
    models.BarberProfile.deleteMany({ barberId: userId }, { session }),
    models.PortfolioPhoto.deleteMany({ barberId: userId }, { session }),
    update(models.User, { favoriteBarbers: userId }, { $pull: { favoriteBarbers: userId } }, session),
    update(models.Salon, { admins: userId }, { $pull: { admins: userId } }, session),
    update(models.SubscriptionSeat, { $or: [{ barberId: userId }, { assignedBy: userId }], status: "active" }, { $set: { status: "revoked", revokedAt: new Date() } }, session),
    markMediaPending(models, { ownerModel: "User", ownerId: userId, mediaClass: { $in: ["profile-avatar", "profile-certification"] } }, session),
  ]);
  if (portfolios.length) {
    await markMediaPending(models, { ownerModel: "PortfolioPhoto", ownerId: { $in: ids(portfolios) } }, session);
  }
};

const defaults = {
  User, Booking, Salon, Subscription, SubscriptionSeat, SubscriptionPaymentAttempt,
  EventCertificate, EventRegistration, EventReview, Review, SalonReview, Message,
  Notification, Favorite, SalonFavorite, ClientRelationship, LoyaltyProgress,
  LoyaltyRewardRedemption, WaitlistEntry, SalonJoinRequest, BarberProfile, Service,
  Schedule, PortfolioPhoto, MediaObject, PaymentTransaction, PaymentRecord,
  PaymentEvent, RefreshSession, AccountDeletionRecord,
};
export const accountDeletionModels = defaults;

export const deleteAccountAtomically = async ({
  userId,
  now = new Date(),
  models = accountDeletionModels,
  startSession = () => mongoose.connection.startSession(),
  beginFence = beginAccountDeletionFence,
  completeFence = completeAccountDeletionFence,
  releaseFence = releaseAccountDeletionFence,
  isCommitProven = completedDeletionTombstone,
} = {}) => {
  if (!userId) throw new AccountDeletionError("Not authorized", 403);
  let session;
  let deletionId;
  let committed = false;
  try {
    const fence = await beginFence({ userId, RecordModel: models.AccountDeletionRecord });
    deletionId = fence.deletionId;
    if (fence.alreadyDeleted) return { deleted: true, recovered: true };
    session = await startSession();
    if (!session?.withTransaction) throw new AccountDeletionError("Account deletion is temporarily unavailable", 503);
    await session.withTransaction(async () => {
      const user = await queryResult(models.User.findById(userId).select("+authVersion +recentAuthAt +recentAuthVersion").session(session));
      if (!user) throw new AccountDeletionError("Not authorized", 403);
      if (!hasValidRecentAuthentication(user, { now })) {
        throw new AccountDeletionError("Recent authentication is required", 403);
      }
      await assertPreconditions({ userId, session, models });
      const pendingAttempt = await queryResult(models.SubscriptionPaymentAttempt.findOne({ payerId: userId, status: { $in: ["pending", "requires_action"] } }, null, { session }));
      if (pendingAttempt) throw new AccountDeletionError("Resolve pending payment attempts before deleting your account", 409);
      await scrubBookings({ userId, session, models });
      await scrubHistory({ userId, session, models });
      await scrubCertificates({ userId, session, models });
      await removePrivateState({ userId, session, models });
      await models.RefreshSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: "user_deleted" } }, { session });
      const removed = await models.User.deleteOne({ _id: userId, authVersion: user.authVersion }, { session });
      if (!removed?.deletedCount) throw new AccountDeletionError("Account deletion could not be completed", 409);
    });
    committed = true;
    await completeFence({ userId, deletionId, RecordModel: models.AccountDeletionRecord });
    return { deleted: true };
  } catch (error) {
    if (unknownCommit(error)) {
      const user = await queryResult(models.User.findById(userId));
      if (!user && await isCommitProven({ userId, deletionId, RecordModel: models.AccountDeletionRecord })) return { deleted: true, recovered: true };
      throw new AccountDeletionError("Account deletion outcome is unknown; retry later", 503);
    }
    if (deletionId && !committed) await releaseFence({ userId, deletionId, RecordModel: models.AccountDeletionRecord }).catch(() => {});
    throw error;
  } finally {
    await session?.endSession?.().catch(() => {});
  }
};
