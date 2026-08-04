import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionPaymentAttempt from "../../models/SubscriptionPaymentAttempt.js";
import { DEFAULT_PLAN_CODE } from "./subscriptionHelpers.js";
import {
  canManageSalonRequest,
  sameId,
} from "../../utils/salonPermissions.js";

export const buildTransactionUnavailableError = () => {
  const error = new Error(
    "Payment confirmation requires an active database transaction"
  );
  error.statusCode = 503;
  error.code = "PAYMENT_CONFIRMATION_TRANSACTION_UNAVAILABLE";
  return error;
};

export const createWithRequiredSession = async (Model, payload, session) => {
  if (!session) {
    throw buildTransactionUnavailableError();
  }

  const [document] = await Model.create([payload], { session });
  return document;
};

export const runInRequiredTransaction = async (operation) => {
  if (mongoose.connection.readyState !== 1) {
    throw buildTransactionUnavailableError();
  }

  const session = await mongoose.startSession();
  if (!session) {
    throw buildTransactionUnavailableError();
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

export const getOrCreateDefaultSubscriptionPlanWithSession = async (session) => {
  if (!session) {
    throw buildTransactionUnavailableError();
  }

  const options = { session };
  const existing = await SubscriptionPlan.findOne(
    { code: DEFAULT_PLAN_CODE },
    null,
    options
  );
  if (existing) {
    return existing;
  }

  try {
    return await createWithRequiredSession(
      SubscriptionPlan,
      {
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
      },
      session
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return SubscriptionPlan.findOne({ code: DEFAULT_PLAN_CODE }, null, options);
  }
};

export const getAuthorizedPaymentAttemptInSession = async ({
  paymentAttemptId,
  requester,
  action,
  session,
}) => {
  if (!session) {
    throw buildTransactionUnavailableError();
  }

  const options = { session };
  const attempt = await SubscriptionPaymentAttempt.findById(
    paymentAttemptId,
    null,
    options
  );
  if (!attempt) {
    const error = new Error("Payment attempt not found");
    error.statusCode = 404;
    throw error;
  }

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

  if (attempt.ownerType === "barber") {
    if (
      !sameId(requester._id, attempt.ownerId) &&
      !sameId(requester._id, attempt.payerId)
    ) {
      const error = new Error(`You can only ${action} your own payment attempt`);
      error.statusCode = 403;
      throw error;
    }

    return attempt;
  }

  if (attempt.ownerType === "salon") {
    const salon = await Salon.findById(attempt.ownerId, null, options);
    if (!salon) {
      const error = new Error("Salon not found");
      error.statusCode = 404;
      throw error;
    }

    if (!canManageSalonRequest(salon, requester._id)) {
      const error = new Error(
        `Only salon owner or admin can ${action} payment attempts`
      );
      error.statusCode = 403;
      throw error;
    }

    return attempt;
  }

  const error = new Error("ownerType must be 'barber' or 'salon'");
  error.statusCode = 400;
  throw error;
};
