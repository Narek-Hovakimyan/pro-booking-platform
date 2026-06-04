import Subscription from "../models/Subscription.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import {
  getOrCreateDefaultSubscriptionPlan,
  getMySubscriptionAccess,
  extendManualSubscription,
  getSalonSubscriptionDetails,
  assignSalonSubscriptionSeat,
  revokeSalonSubscriptionSeat,
  updateSalonSubscriptionSeatCount,
  createSubscriptionPaymentIntent,
} from "../services/subscriptionService.js";

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * GET /api/subscriptions/me
 * Protected — barber only.
 * Returns the current user's subscription access details.
 */
export const getMySubscription = async (req, res) => {
  try {
    const result = await getMySubscriptionAccess(req.user);
    return res.json(result);
  } catch (error) {
    console.error("Could not fetch subscription access", error);
    return res.status(500).json({ message: "Could not fetch subscription access" });
  }
};

/**
 * GET /api/subscriptions/plan/default
 * Returns the default subscription plan.
 */
export const getDefaultPlan = async (req, res) => {
  try {
    const plan = await getOrCreateDefaultSubscriptionPlan();
    return res.json(plan);
  } catch (error) {
    console.error("Could not fetch default plan", error);
    return res.status(500).json({ message: "Could not fetch default plan" });
  }
};

/**
 * POST /api/subscriptions/dev/grant
 * Protected — disabled in production.
 * Grants a manual subscription for development/testing.
 */
export const devGrantSubscription = async (req, res) => {
  if (isProduction()) {
    return res.status(403).json({
      code: "DEV_SUBSCRIPTION_DISABLED",
      message: "Dev subscription activation is disabled in production",
    });
  }

  try {
    const { ownerType, ownerId, payerId, seatCount, months } = req.body;

    if (!ownerType || !ownerId || !payerId) {
      return res.status(400).json({ message: "ownerType, ownerId, and payerId are required" });
    }

    if (!["barber", "salon"].includes(ownerType)) {
      return res.status(400).json({ message: "ownerType must be 'barber' or 'salon'" });
    }

    const subscription = await extendManualSubscription({
      ownerType,
      ownerId,
      payerId,
      seatCount: seatCount || 1,
      months: months || 1,
    });

    return res.status(201).json(subscription);
  } catch (error) {
    console.error("Could not grant subscription", error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      code: error.code,
      message: error.message || "Could not grant subscription",
    });
  }
};

export const devExtendSubscription = devGrantSubscription;

export const createPaymentIntent = async (req, res) => {
  try {
    const { ownerType, ownerId, seatCount } = req.body || {};

    const paymentIntent = await createSubscriptionPaymentIntent({
      requester: req.user,
      ownerType,
      ownerId,
      seatCount,
      providerName: "manual",
    });

    return res.json(paymentIntent);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      code: error.code,
      message: error.message || "Could not prepare payment",
    });
  }
};

/* ══════════════════════════════════════════════════════════
 *  Phase 2 — Salon seat assignment
 * ══════════════════════════════════════════════════════════ */

/**
 * GET /api/subscriptions/salon/:salonId
 * Protected — salon owner/admin only.
 * Returns salon subscription details including seats and approved members.
 */
export const getSalonSubscription = async (req, res) => {
  try {
    const result = await getSalonSubscriptionDetails({
      salonId: req.params.salonId,
      requester: req.user,
    });
    return res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Could not fetch salon subscription details",
    });
  }
};

/**
 * GET /api/subscriptions/salon/:salonId/seats
 * Protected — salon owner/admin only.
 * Returns seats for the salon's subscription.
 */
export const getSalonSubscriptionSeats = async (req, res) => {
  try {
    const { subscription, activeSeats, revokedSeats, availableSeatCount } =
      await getSalonSubscriptionDetails({
        salonId: req.params.salonId,
        requester: req.user,
      });

    return res.json({
      subscription,
      activeSeats,
      revokedSeats,
      availableSeatCount,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Could not fetch salon subscription seats",
    });
  }
};

/**
 * POST /api/subscriptions/salon/:salonId/seats
 * Protected — salon owner/admin only.
 * Assigns a seat to a barber.
 * Body: { barberId }
 */
export const assignSeat = async (req, res) => {
  try {
    const { barberId } = req.body;

    if (!barberId) {
      return res.status(400).json({ message: "barberId is required" });
    }

    const seat = await assignSalonSubscriptionSeat({
      salonId: req.params.salonId,
      barberId,
      assignedBy: req.user,
    });

    return res.status(201).json(seat);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Could not assign seat",
    });
  }
};

/**
 * PATCH /api/subscriptions/seats/:seatId/revoke
 * Protected — salon owner/admin of the seat's parent salon only.
 * Revokes a seat.
 */
export const revokeSeat = async (req, res) => {
  try {
    const seat = await revokeSalonSubscriptionSeat({
      seatId: req.params.seatId,
      requester: req.user,
    });

    return res.json(seat);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Could not revoke seat",
    });
  }
};

/**
 * PATCH /api/subscriptions/salon/:salonId/seat-count
 * Protected — salon owner/admin only.
 * Updates the paid seat count for a salon subscription.
 * Body: { seatCount }
 */
export const updateSeatCount = async (req, res) => {
  try {
    const { seatCount } = req.body;

    if (seatCount === undefined || seatCount === null) {
      return res.status(400).json({ message: "seatCount is required" });
    }

    const subscription = await updateSalonSubscriptionSeatCount({
      salonId: req.params.salonId,
      seatCount: Number(seatCount),
      requester: req.user,
    });

    return res.json(subscription);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Could not update seat count",
    });
  }
};
