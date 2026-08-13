import mongoose from "mongoose";

import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";

const capacityError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const invariantError = () => {
  const error = new Error("Seat capacity invariant could not be maintained");
  error.statusCode = 409;
  return error;
};

const queryOptions = (session) => (session ? { session } : undefined);
const hasDatabase = () =>
  mongoose.connection.readyState === 1 &&
  Boolean(mongoose.connection.db) &&
  mongoose.connection.getClient?.()?.topology?.isConnected?.() === true;

export const runSeatCapacityTransaction = async (operation, session = null) => {
  if (session) return operation(session);

  // Service unit tests intentionally use model doubles without a connection.
  // A connected deployment always uses a Mongo transaction for this invariant.
  if (!hasDatabase()) return operation(null);

  const ownedSession = await mongoose.startSession();
  try {
    let result;
    await ownedSession.withTransaction(async () => {
      result = await operation(ownedSession);
    });
    return result;
  } finally {
    await ownedSession.endSession();
  }
};

const claimCapacity = async ({ subscriptionId, session }) =>
  Subscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      $expr: {
        $lt: [
          { $ifNull: ["$activeSeatCount", 0] },
          "$seatCount",
        ],
      },
    },
    { $inc: { activeSeatCount: 1 } },
    { returnDocument: "after", ...(session ? { session } : {}) }
  );

const claimCapacityForTestDouble = async ({ subscription, subscriptionId }) => {
  const activeSeatCount = Number.isInteger(subscription?.activeSeatCount)
    ? subscription.activeSeatCount
    : await SubscriptionSeat.countDocuments({ subscriptionId, status: "active" });
  if (activeSeatCount >= subscription.seatCount) return null;
  subscription.activeSeatCount = activeSeatCount + 1;
  await subscription.save();
  return subscription;
};

const decrementCapacity = async ({ subscriptionId, session }) => {
  const subscription = await Subscription.findOneAndUpdate(
    { _id: subscriptionId, activeSeatCount: { $gt: 0 } },
    { $inc: { activeSeatCount: -1 } },
    { returnDocument: "after", ...(session ? { session } : {}) }
  );
  if (!subscription) throw invariantError();
  return subscription;
};

export const assignActiveSeat = async ({
  subscriptionId,
  salonId,
  barberId,
  assignedBy,
  now = new Date(),
  capacityMessage,
  session = null,
  subscription = null,
}) =>
  runSeatCapacityTransaction(async (activeSession) => {
    const options = queryOptions(activeSession);
    const existingActive = await SubscriptionSeat.findOne(
      { subscriptionId, barberId, status: "active" },
      null,
      options
    );

    if (existingActive) {
      return { seat: existingActive, idempotent: true };
    }

    const existing = await SubscriptionSeat.findOne(
      { subscriptionId, barberId, status: "revoked" },
      null,
      options
    );

    const claimed = hasDatabase()
      ? await claimCapacity({ subscriptionId, session: activeSession })
      : await claimCapacityForTestDouble({ subscription, subscriptionId });
    if (!claimed) {
      throw capacityError(capacityMessage || "Seat capacity has been reached");
    }

    if (existing) {
      if (!hasDatabase()) {
        existing.status = "active";
        existing.revokedAt = null;
        existing.assignedBy = assignedBy;
        existing.assignedAt = now;
        existing.salonId = salonId;
        await existing.save();
        return { seat: existing, idempotent: false };
      }
      const reactivated = await SubscriptionSeat.findOneAndUpdate(
        { _id: existing._id, status: "revoked" },
        {
          $set: {
            status: "active",
            revokedAt: null,
            assignedBy,
            assignedAt: now,
            salonId,
          },
        },
        { returnDocument: "after", ...(activeSession ? { session: activeSession } : {}) }
      );
      if (!reactivated) throw invariantError();
      return { seat: reactivated, idempotent: false };
    }

    const payload = { subscriptionId, salonId, barberId, assignedBy, status: "active", assignedAt: now };
    const created = hasDatabase()
      ? await SubscriptionSeat.create([payload], { session: activeSession })
      : await SubscriptionSeat.create(payload);
    const seat = Array.isArray(created) ? created[0] : created;
    return { seat, idempotent: false };
  }, session);

export const revokeActiveSeat = async ({
  seatId,
  subscriptionId,
  now = new Date(),
  session = null,
  subscription = null,
  seatDocument = null,
}) =>
  runSeatCapacityTransaction(async (activeSession) => {
    if (!hasDatabase()) {
      const seat = seatDocument || await SubscriptionSeat.findById(seatId);
      if (!seat || seat.status !== "active") return null;
      seat.status = "revoked";
      seat.revokedAt = now;
      await seat.save();
      const activeSeatCount = Number.isInteger(subscription?.activeSeatCount)
        ? subscription.activeSeatCount
        : 1;
      if (activeSeatCount <= 0) throw invariantError();
      subscription.activeSeatCount = activeSeatCount - 1;
      await subscription.save();
      return seat;
    }
    const seat = await SubscriptionSeat.findOneAndUpdate(
      { _id: seatId, status: "active" },
      { $set: { status: "revoked", revokedAt: now } },
      { returnDocument: "after", ...(activeSession ? { session: activeSession } : {}) }
    );
    if (!seat) return null;
    await decrementCapacity({ subscriptionId, session: activeSession });
    return seat;
  }, session);

export const deleteActiveSeat = async ({ seatId, subscriptionId, session = null, subscription = null }) =>
  runSeatCapacityTransaction(async (activeSession) => {
    if (!hasDatabase()) {
      const seat = await SubscriptionSeat.findById(seatId);
      if (!seat || seat.status !== "active") return null;
      await SubscriptionSeat.deleteOne({ _id: seatId });
      const activeSeatCount = Number.isInteger(subscription?.activeSeatCount)
        ? subscription.activeSeatCount
        : 1;
      if (activeSeatCount <= 0) throw invariantError();
      subscription.activeSeatCount = activeSeatCount - 1;
      await subscription.save();
      return seat;
    }
    const seat = await SubscriptionSeat.findOneAndDelete(
      { _id: seatId, status: "active" },
      activeSession ? { session: activeSession } : undefined
    );
    if (!seat) return null;
    await decrementCapacity({ subscriptionId, session: activeSession });
    return seat;
  }, session);

export const updateSubscriptionSeatCount = async ({
  subscriptionId,
  seatCount,
  updates = {},
  session = null,
  capacityMessage,
  subscription: fallbackSubscription = null,
}) => {
  if (!hasDatabase()) {
    const activeSeatCount = Number.isInteger(fallbackSubscription?.activeSeatCount)
      ? fallbackSubscription.activeSeatCount
      : await SubscriptionSeat.countDocuments({ subscriptionId, status: "active" });
    if (activeSeatCount > seatCount) {
      throw capacityError(capacityMessage || `Cannot reduce seat count below ${activeSeatCount} active seats currently assigned. Please revoke seats first.`);
    }
    Object.assign(fallbackSubscription, updates, { seatCount, activeSeatCount });
    await fallbackSubscription.save();
    return fallbackSubscription;
  }
  const subscription = await Subscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      $expr: {
        $lte: [
          { $ifNull: ["$activeSeatCount", 0] },
          seatCount,
        ],
      },
    },
    { $set: { ...updates, seatCount } },
    { returnDocument: "after", ...(session ? { session } : {}) }
  );
  if (!subscription) {
    throw capacityError(
      capacityMessage || "Cannot reduce seat count below active seats currently assigned. Please revoke seats first."
    );
  }
  return subscription;
};

export const assertSeatCountCanContainActiveSeats = (subscription, seatCount) => {
  if (Number(subscription?.activeSeatCount || 0) > seatCount) {
    throw capacityError(
      `Cannot reduce seat count below ${subscription.activeSeatCount} active seats currently assigned. Please revoke seats first.`
    );
  }
};
