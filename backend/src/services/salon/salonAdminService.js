import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { serializeUser } from "../../utils/salonUtils.js";

const salonAdminUserFields = "name avatarUrl city";

export class SalonAdminError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "SalonAdminError";
    this.statusCode = statusCode;
  }
}

export const getSalonAdminsForSalon = async (salonId) => {
  const salon = await Salon.findById(salonId);

  if (!salon) {
    throw new SalonAdminError(404, "Salon not found");
  }

  const owner = await User.findById(salon.ownerId).select(salonAdminUserFields);
  const adminIds = salon.admins || [];
  const admins = adminIds.length > 0
    ? await User.find({ _id: { $in: adminIds } }).select(salonAdminUserFields)
    : [];

  return {
    owner: serializeUser(owner),
    admins: admins.map(serializeUser),
  };
};
