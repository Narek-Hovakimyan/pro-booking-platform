/**
 * Build a pure safeUpdates object for booking status transitions.
 * No DB calls, no side effects — only data assembly.
 *
 * Currently supports: "rejected", "cancelled"
 *
 * @param {string} status - Target booking status
 * @param {Object} options
 * @param {string} [options.reason] - rejectionReason or cancelReason
 * @param {Object} options.requester - User performing the action (must have _id)
 * @returns {Object} safeUpdates object to merge into booking
 */
export const buildBookingStatusUpdate = (status, { reason, requester } = {}) => {
  if (status === "rejected") {
    return {
      status: "rejected",
      rejectionReason: (reason || "").trim(),
      rejectedAt: new Date(),
      rejectedBy: requester._id,
    };
  }

  if (status === "cancelled") {
    return {
      status: "cancelled",
      cancelReason: (reason || "").trim(),
      cancelledAt: new Date(),
      cancelledBy: requester._id,
    };
  }

  // Unsupported status — return empty so controller handles as today
  return {};
};