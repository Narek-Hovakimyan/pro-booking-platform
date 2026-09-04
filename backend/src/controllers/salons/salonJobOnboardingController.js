import { serializeApplication } from "../../utils/salonJobApplicationUtils.js";
import { sendControllerError } from "../../utils/controllerError.js";
import {
  SalonJobOnboardingError,
  confirmSalonJobOnboarding,
} from "../../services/salon/salonJobOnboardingService.js";

export const confirmSalonJobOnboardingForApplicant = async (req, res) => {
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Only the applicant can confirm onboarding" });
    }

    const result = await confirmSalonJobOnboarding({
      applicationId: req.params.applicationId,
      applicantId: req.user._id,
    });

    return res.json({
      application: serializeApplication(result.application),
      idempotent: result.idempotent,
    });
  } catch (error) {
    if (error instanceof SalonJobOnboardingError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return sendControllerError(res, error, "Could not confirm job onboarding");
  }
};
