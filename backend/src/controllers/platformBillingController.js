import Salon from "../models/Salon.js";
import {
  getAllSalonBillingSummaries,
  getSalonBillingDetail,
  getSalonPayments,
  getAllSalonPayments,
  getAllIndividualBillingSummaries,
  getIndividualPayments,
  activateSalonSubscription,
  updateSalonSeatCount,
  assignSalonSeat,
  revokeSalonSeat,
  cancelSalonSubscription,
  confirmSalonPayment,
} from "../services/platform/platformBillingService.js";

const getRequestIp = (req) => req.ip || req.socket?.remoteAddress || "";

/**
 * GET /api/platform/billing/salons
 * List all salon billing summaries (paginated).
 */
export const listSalonBillingSummaries = async (req, res, next) => {
  try {
    const { page, limit, search, subscriptionStatus } = req.query;
    const result = await getAllSalonBillingSummaries({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || undefined,
      subscriptionStatus: subscriptionStatus || undefined,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/platform/billing/salons/:salonId
 * Get full billing detail for one salon.
 */
export const getSalonBillingDetailHandler = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const detail = await getSalonBillingDetail(salonId);
    if (!detail) {
      return res.status(404).json({ message: "Salon not found" });
    }
    return res.json(detail);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/platform/billing/salons/:salonId/payments
 * Get payment attempts for one salon.
 */
export const getSalonPaymentsHandler = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const { page, limit } = req.query;

    const salon = await Salon.findById(salonId).select("_id").lean();
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    const result = await getSalonPayments(salonId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/platform/billing/payments
 * All salon subscription payment attempts (paginated).
 */
export const listAllSalonPayments = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await getAllSalonPayments({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/platform/billing/individuals
 * List all individual barber billing summaries (paginated).
 */
export const listIndividualBillingSummaries = async (req, res, next) => {
  try {
    const { page, limit, search, subscriptionStatus } = req.query;
    const result = await getAllIndividualBillingSummaries({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || undefined,
      subscriptionStatus: subscriptionStatus || undefined,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/platform/billing/individuals/:barberId/payments
 * Get subscription payment history for one individual barber.
 */
export const getIndividualPaymentsHandler = async (req, res, next) => {
  try {
    const { barberId } = req.params;
    const { page, limit } = req.query;
    const result = await getIndividualPayments(barberId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });

    if (!result) {
      return res.status(404).json({ message: "Barber not found" });
    }

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/platform/billing/salons/:salonId/subscription/activate
 * Activate or renew a salon subscription manually.
 */
export const activateSubscription = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const { seatCount, months, note } = req.body;

    const result = await activateSalonSubscription(salonId, {
      seatCount,
      months,
      note,
      actor: req.user,
      requestIp: getRequestIp(req),
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/platform/billing/salons/:salonId/subscription/seat-count
 * Update salon subscription seat count.
 */
export const updateSeatCount = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const { seatCount, note } = req.body;

    const result = await updateSalonSeatCount(salonId, {
      seatCount,
      note,
      actor: req.user,
      requestIp: getRequestIp(req),
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/platform/billing/salons/:salonId/seats/assign
 * Assign a subscription seat to an accepted staff barber.
 */
export const assignSeat = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const { barberId, note } = req.body;

    const result = await assignSalonSeat(salonId, {
      barberId,
      note,
      actor: req.user,
      requestIp: getRequestIp(req),
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/platform/billing/salons/:salonId/seats/revoke
 * Revoke a subscription seat from an assigned staff barber.
 */
export const revokeSeat = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const { barberId, note } = req.body;

    const result = await revokeSalonSeat(salonId, {
      barberId,
      note,
      actor: req.user,
      requestIp: getRequestIp(req),
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/platform/billing/salons/:salonId/subscription/cancel
 * Cancel/deactivate a salon subscription (soft cancel only).
 */
export const cancelSubscription = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const { note } = req.body;

    const result = await cancelSalonSubscription(salonId, {
      note,
      actor: req.user,
      requestIp: getRequestIp(req),
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/platform/billing/payments/:paymentId/confirm
 * Manually confirm a salon subscription payment.
 */
export const confirmPayment = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { note } = req.body;

    const result = await confirmSalonPayment(paymentId, {
      note,
      actor: req.user,
      requestIp: getRequestIp(req),
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
};
