import { getBarberMonthlyIncomeSummary } from "../../services/booking/bookingAnalyticsService.js";
import {
  getAccessibleClientReliabilitySummary,
} from "../../services/clientReliabilityService.js";
import {
  authorizeDebugAccess,
  debugAvailability,
  validateDebugRequest,
} from "../../services/booking/availabilityDebugService.js";

export const getBarberMonthlyIncome = async (req, res) => {
  try {
    const summary = await getBarberMonthlyIncomeSummary({
      barberId: req.params.barberId,
      year: req.query.year,
      month: req.query.month,
      requester: req.user,
    });

    return res.json(summary);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch barber income",
    });
  }
};

export const getClientReliability = async (req, res) => {
  try {
    const { clientId } = req.params;
    const summary = await getAccessibleClientReliabilitySummary({
      clientId,
      requester: req.user,
    });

    return res.json(summary);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch client reliability summary",
    });
  }
};

export const debugBookingAvailability = async (req, res) => {
  try {
    const { barberId, salonId, date, time, serviceId } = req.body;

    // Validate required fields
    const validation = validateDebugRequest({ barberId, salonId, date, time, serviceId });

    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.message });
    }

    // Authorize access
    const auth = await authorizeDebugAccess({ requester: req.user, barberId, salonId });

    if (!auth.allowed) {
      return res.status(auth.status).json({ message: auth.message });
    }

    // Run diagnostics
    const result = await debugAvailability({ barberId, salonId, date, time, serviceId });

    if (result.status) {
      return res.status(result.status).json({ message: result.message });
    }

    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not debug availability",
    });
  }
};
