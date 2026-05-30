import { getBarberRevenueSummary } from "../services/revenueService.js";
import { sendControllerError } from "../utils/controllerError.js";

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
    return sendControllerError(res, error, "Could not fetch revenue summary");
  }
};
