/**
 * Client Reliability Summary Service
 *
 * Calculates a summary of a client's booking history with a barber.
 *
 * Scoring (reliabilityScore):
 * - Starts at 100
 * - Each no_show:        -20
 * - Each late_cancelled: -10
 * - Each cancelled:       -5
 * - Minimum 0, maximum 100
 * - Only bookings with a clientId are counted (walk-ins without a user account are excluded)
 * - rejected/pending/accepted/completed/expired do NOT reduce the score
 *
 * This score is for informational purposes only.
 * It is NOT used to block or penalize clients.
 */

import mongoose from "mongoose";
import Booking from "../models/Booking.js";

export class ClientReliabilityAccessError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ClientReliabilityAccessError";
    this.statusCode = statusCode;
  }
}

const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

/**
 * @param {string} clientId - The client's ObjectId
 * @returns {Promise<Object>} reliability summary
 */
export async function getClientReliabilitySummary(clientId) {
  if (!isValidObjectId(clientId)) {
    return {
      clientId,
      totalBookings: 0,
      completedCount: 0,
      cancelledCount: 0,
      noShowCount: 0,
      lateCancelledCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
      acceptedCount: 0,
      expiredCount: 0,
      reliabilityScore: 100,
    };
  }

  const pipeline = [
    { $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        completedCount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
        noShowCount: { $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] } },
        lateCancelledCount: { $sum: { $cond: [{ $eq: ["$status", "late_cancelled"] }, 1, 0] } },
        rejectedCount: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        acceptedCount: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
        expiredCount: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
      },
    },
    { $project: { _id: 0 } },
  ];

  const results = await Booking.aggregate(pipeline);
  const counts = results[0] || {
    totalBookings: 0,
    completedCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    lateCancelledCount: 0,
    rejectedCount: 0,
    pendingCount: 0,
    acceptedCount: 0,
    expiredCount: 0,
  };

  const {
    totalBookings,
    completedCount,
    cancelledCount,
    noShowCount,
    lateCancelledCount,
    rejectedCount,
    pendingCount,
    acceptedCount,
    expiredCount,
  } = counts;

  // Calculate reliability score
  let reliabilityScore = 100;
  reliabilityScore -= noShowCount * 20;
  reliabilityScore -= lateCancelledCount * 10;
  reliabilityScore -= cancelledCount * 5;
  reliabilityScore = Math.max(0, Math.min(100, reliabilityScore));

  return {
    clientId,
    totalBookings,
    completedCount,
    cancelledCount,
    noShowCount,
    lateCancelledCount,
    rejectedCount,
    pendingCount,
    acceptedCount,
    expiredCount,
    reliabilityScore,
  };
}

/**
 * Checks whether a user has a booking relationship with a client.
 * A barber must have at least one booking where they are the barber and the client is the specified client.
 *
 * @param {string} barberId
 * @param {string} clientId
 * @returns {Promise<boolean>}
 */
export async function barberHasBookingWithClient(barberId, clientId) {
  const count = await Booking.countDocuments({
    barberId,
    clientId,
  });
  return count > 0;
}

export async function getAccessibleClientReliabilitySummary({ clientId, requester }) {
  if (!isValidObjectId(clientId)) {
    throw new ClientReliabilityAccessError(400, "Invalid clientId");
  }

  const requesterId = requester?._id;
  const requesterRole = requester?.role;

  if (requesterRole === "client" && String(requesterId) === String(clientId)) {
    return getClientReliabilitySummary(clientId);
  }

  if (requesterRole === "barber") {
    const hasRelationship = await barberHasBookingWithClient(requesterId, clientId);

    if (hasRelationship) {
      return getClientReliabilitySummary(clientId);
    }
  }

  throw new ClientReliabilityAccessError(
    403,
    "You do not have access to this client's reliability summary"
  );
}
