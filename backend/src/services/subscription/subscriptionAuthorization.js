import Salon from "../../models/Salon.js";
import { canManageSalonRequest } from "../../utils/salonPermissions.js";

/**
 * Require the requester to be the salon owner or an admin of the salon.
 * Throws 401/403/404 on failure.
 * Returns the salon document on success.
 */
export const requireSalonOwnerOrAdmin = async (salonId, requesterId) => {
  if (!requesterId) {
    const err = new Error("Authentication required");
    err.statusCode = 401;
    throw err;
  }

  const salon = await Salon.findById(salonId);
  if (!salon) {
    const err = new Error("Salon not found");
    err.statusCode = 404;
    throw err;
  }

  if (!canManageSalonRequest(salon, requesterId)) {
    const err = new Error("Only salon owner or admin can perform this action");
    err.statusCode = 403;
    throw err;
  }

  return salon;
};
