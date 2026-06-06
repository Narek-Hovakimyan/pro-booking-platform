import { getSalonReport, ReportError } from "../services/salon/salonReportService.js";
import { sendControllerError } from "../utils/controllerError.js";

/**
 * GET /api/salons/:salonId/reports
 * Returns date-range salon analytics for owner/admin only.
 * Query params: from=YYYY-MM-DD, to=YYYY-MM-DD, barberId (optional)
 */
export const getReports = async (req, res) => {
  try {
    const { salonId } = req.params;
    const userId = req.user._id;
    const { from, to, barberId } = req.query;

    const reportData = await getSalonReport(salonId, userId, { from, to, barberId });

    return res.json(reportData);
  } catch (error) {
    if (error instanceof ReportError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return sendControllerError(res, error, "Could not fetch salon reports");
  }
};
