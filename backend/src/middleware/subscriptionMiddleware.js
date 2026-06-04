import { barberHasPaidAccess } from "../services/subscriptionService.js";

/**
 * Middleware that blocks requests from unpaid barbers.
 *
 * - Non-barber roles pass through (clients, admins, etc.)
 * - Barber users with active/trialing individual subscription OR
 *   active salon seat from an active/trialing salon subscription pass through.
 * - Unpaid barbers get a 403 response with code "SUBSCRIPTION_REQUIRED".
 */
export const requireBarberSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Non-barber roles pass through
    if (req.user.role !== "barber") {
      return next();
    }

    const hasAccess = await barberHasPaidAccess(req.user._id);

    if (!hasAccess) {
      return res.status(403).json({
        code: "SUBSCRIPTION_REQUIRED",
        message:
          "An active subscription or salon seat assignment is required to access this feature.",
      });
    }

    return next();
  } catch (error) {
    console.error("requireBarberSubscription error:", error);
    return res.status(500).json({
      message: "Could not verify subscription status",
    });
  }
};
