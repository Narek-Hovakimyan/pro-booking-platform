import Salon from "../models/Salon.js";
import {
  getAllSalonBillingSummaries,
  getSalonBillingDetail,
  getSalonPayments,
  getAllSalonPayments,
} from "../services/platformBillingService.js";

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
