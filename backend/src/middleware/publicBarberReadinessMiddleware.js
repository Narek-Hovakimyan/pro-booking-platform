import { getPublicBarberReadiness } from "../services/barber/publicBarberReadinessService.js";

export const requirePublicBarberReadiness = async (req, res, next) => {
  const barberId = req.params.barberId;
  const requesterId = req.user?._id || req.user?.id;
  if (req.user?.role === "barber" && String(requesterId) === String(barberId)) return next();
  try {
    if (!(await getPublicBarberReadiness(barberId)).publicReady) {
      return res.status(404).json({ message: "Barber not found" });
    }
    return next();
  } catch {
    return res.status(404).json({ message: "Barber not found" });
  }
};
