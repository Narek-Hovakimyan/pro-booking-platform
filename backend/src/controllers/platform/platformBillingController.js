import Salon from "../../models/Salon.js";
import {
  getAllSalonBillingSummaries,
  getSalonBillingDetail,
  getSalonSeatManagement,
  getSalonPayments,
  getSalonTransactions,
  getSalonPaymentAttempts,
  getAllSalonPayments,
  getAllSalonPaymentAttempts,
  getAllIndividualBillingSummaries,
  getIndividualPayments,
  getIndividualTransactions,
  getIndividualPaymentAttempts,
  activateSalonSubscription,
  updateSalonSeatCount,
  assignSalonSeat,
  revokeSalonSeat,
  cancelSalonSubscription,
  confirmSalonPayment,
} from "../../services/platform/platformBillingService.js";

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

export const getSalonSeatManagementHandler = async (req, res, next) => {
  try {
    const management = await getSalonSeatManagement(req.params.salonId);
    if (!management) {
      return res.status(404).json({ message: "Salon not found" });
    }
    return res.json(management);
  } catch (error) {
    next(error);
  }
};

/**
 * Legacy GET /api/platform/billing/salons/:salonId/payments.
 * Kept temporarily for external compatibility; new clients use the explicit reads.
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

const getExistingSalon = async (salonId) =>
  Salon.findById(salonId).select("_id").lean();

export const getSalonTransactionsHandler = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    if (!(await getExistingSalon(salonId))) {
      return res.status(404).json({ message: "Salon not found" });
    }
    return res.json(await getSalonTransactions(salonId, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    }));
  } catch (error) {
    next(error);
  }
};

export const getSalonPaymentAttemptsHandler = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    if (!(await getExistingSalon(salonId))) {
      return res.status(404).json({ message: "Salon not found" });
    }
    return res.json(await getSalonPaymentAttempts(salonId, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status || undefined,
    }));
  } catch (error) {
    next(error);
  }
};

/**
 * Legacy GET /api/platform/billing/payments.
 * Kept temporarily for external compatibility; new clients use /payment-attempts.
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

export const listAllSalonPaymentAttempts = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    return res.json(await getAllSalonPaymentAttempts({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    }));
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
 * Legacy GET /api/platform/billing/individuals/:barberId/payments.
 * Kept temporarily for external compatibility; new clients use the explicit reads.
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

const sendIndividualRead = async (req, res, next, read) => {
  try {
    const result = await read(req.params.barberId, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status || undefined,
    });
    if (!result) return res.status(404).json({ message: "Barber not found" });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getIndividualTransactionsHandler = (req, res, next) =>
  sendIndividualRead(req, res, next, getIndividualTransactions);

export const getIndividualPaymentAttemptsHandler = (req, res, next) =>
  sendIndividualRead(req, res, next, getIndividualPaymentAttempts);

/**
 * PATCH /api/platform/billing/salons/:salonId/subscription/activate
 * Activate or renew a salon subscription manually.
 */
export const activateSubscription = async (req, res, next) => {
  try {
    const { salonId } = req.params;
    const { seatCount, months, note } = req.body;
    const idempotencyKey = req.get?.("Idempotency-Key") || req.headers?.["idempotency-key"];

    const result = await activateSalonSubscription(salonId, {
      seatCount,
      months,
      note,
      actor: req.user,
      requestIp: getRequestIp(req),
      idempotencyKey,
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
