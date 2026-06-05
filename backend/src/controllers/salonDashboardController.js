import { getSalonDashboard, DashboardError } from "../services/salon/salonDashboardService.js";
import { sendControllerError } from "../utils/controllerError.js";

/**
 * GET /api/salons/:salonId/dashboard
 * Returns salon owner dashboard data.
 * Only accessible by salon owner or admin.
 */
export const getDashboard = async (req, res) => {
  try {
    const { salonId } = req.params;
    const userId = req.user._id;

    const dashboardData = await getSalonDashboard(salonId, userId);

    return res.json(dashboardData);
  } catch (error) {
    if (error instanceof DashboardError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return sendControllerError(res, error, "Could not fetch salon dashboard");
  }
};
