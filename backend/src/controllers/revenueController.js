import { getBarberRevenueSummary, RevenueError } from "../services/revenueService.js";

export const getMyRevenue = async (req, res) => {
  try {
    const { from, to } = req.query;
    const summary = await getBarberRevenueSummary({
      barberId: req.user._id,
      requester: req.user,
      from,
      to,
    });

    return res.json(summary);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || "Could not fetch revenue summary",
    });
  }
};
