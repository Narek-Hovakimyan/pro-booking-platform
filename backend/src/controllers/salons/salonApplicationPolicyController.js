import Salon from "../../models/Salon.js";
import { canUserManageSalon } from "../../services/salon/salonMembershipService.js";
import {
  getEffectiveJoinApplicationPolicy,
  isJoinApplicationPolicy,
} from "../../utils/salonJoinApplicationPolicy.js";
import { sendControllerError } from "../../utils/controllerError.js";

export const updateSalonJoinApplicationPolicy = async (req, res) => {
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Not allowed to manage this salon" });
    }

    const { joinApplicationPolicy } = req.body || {};
    if (!isJoinApplicationPolicy(joinApplicationPolicy)) {
      return res.status(400).json({ message: "Invalid join application policy" });
    }

    const salon = await Salon.findById(req.params.salonId);
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    if (!canUserManageSalon(req.user, salon)) {
      return res.status(403).json({ message: "Not allowed to manage this salon" });
    }

    salon.joinApplicationPolicy = joinApplicationPolicy;
    await salon.save();

    return res.json({
      salonId: String(salon._id),
      joinApplicationPolicy: getEffectiveJoinApplicationPolicy(salon),
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not update salon application policy");
  }
};
