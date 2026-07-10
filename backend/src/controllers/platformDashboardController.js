import { getPlatformDashboardSummary } from "../services/platform/platformDashboardService.js";

/**
 * GET /api/platform/dashboard/summary
 * Safe read-only summary for the platform dashboard.
 */
export const getPlatformDashboardSummaryHandler = async (req, res, next) => {
  try {
    const summary = await getPlatformDashboardSummary();
    return res.json(summary);
  } catch (error) {
    next(error);
  }
};
