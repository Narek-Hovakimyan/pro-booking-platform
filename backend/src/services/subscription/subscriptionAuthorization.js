import Salon from "../../models/Salon.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import {
  canManageSalonRequest,
  sameId,
} from "../../utils/salonPermissions.js";

/**
 * Require the requester to be the salon owner or an admin of the salon.
 * Throws 401/403/404 on failure.
 * Returns the salon document on success.
 */
export const requireSalonOwnerOrAdmin = async (salonId, requesterId) => {
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
 * Validate that the requester can manage a subscription payment attempt.
 */
export const validateSubscriptionRequester = async ({
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

/**
 * Get a payment attempt and validate the requester has access.
 */
export const getAuthorizedPaymentAttempt = async ({
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
