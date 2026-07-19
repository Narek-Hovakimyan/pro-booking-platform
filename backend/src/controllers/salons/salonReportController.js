import {
  ReportError,
  getSalonReport,
  getSalonReportCsvExport,
} from "../../services/salon/salonReportService.js";
import { sendControllerError } from "../../utils/controllerError.js";

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
      return res.status(error.statusCode).json({
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
      });
    }

    return sendControllerError(res, error, "Could not fetch salon reports");
  }
};

/**
 * GET /api/salons/:salonId/reports/export
 * Returns backend-generated salon report export for owner/admin only.
 * Query params: format=csv, from=YYYY-MM-DD, to=YYYY-MM-DD, barberId (optional)
 */
export const exportReports = async (req, res) => {
  try {
    const { salonId } = req.params;
    const userId = req.user._id;
    const { format, from, to, barberId } = req.query;

    const exportData = await getSalonReportCsvExport(salonId, userId, {
      format,
      from,
      to,
      barberId,
    });

    res.setHeader("Content-Type", exportData.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${exportData.filename}"`
    );

    return res.send(exportData.content);
  } catch (error) {
    if (error instanceof ReportError) {
      return res.status(error.statusCode).json({
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
      });
    }

    return sendControllerError(res, error, "Could not export salon reports");
  }
};
