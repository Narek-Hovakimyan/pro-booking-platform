import {
  getPersonalSchedule,
  upsertPersonalSchedule,
} from "../../services/schedule/personalScheduleService.js";
import {
  getPersonalScheduleRequestWeeklySchedule,
  PersonalScheduleValidationError,
  serializePersonalSchedule,
  validatePersonalWeeklySchedule,
} from "../../utils/personalScheduleUtils.js";
import { getBarberOnboardingStatus } from "../../services/onboarding/barberOnboardingStatusService.js";
import { barberHasPaidAccess } from "../../services/subscriptionService.js";

const defaultDependencies = { getBarberOnboardingStatus, barberHasPaidAccess };

const forbiddenResponse = (res) =>
  res.status(403).json({
    code: "FORBIDDEN_PERSONAL_SCHEDULE_ACCESS",
    message: "You can access only your personal schedule",
  });

const canAccessPersonalSchedule = (req, res) => {
  if (req.user?.role !== "barber") {
    forbiddenResponse(res);
    return false;
  }

  if (String(req.user?._id) !== String(req.params?.barberId || "")) {
    forbiddenResponse(res);
    return false;
  }

  return true;
};

const invalidScheduleResponse = (res) =>
  res.status(400).json({
    code: "INVALID_PERSONAL_SCHEDULE",
    message: "Invalid personal schedule",
  });

const subscriptionRequiredResponse = (res) =>
  res.status(403).json({
    code: "SUBSCRIPTION_REQUIRED",
    message: "An active subscription or salon seat assignment is required to access this feature.",
  });

export const createPersonalScheduleController = (dependencies = defaultDependencies) => {
  const canAccessWithOnboarding = async (req, res, failureMessage) => {
    if (!canAccessPersonalSchedule(req, res)) return false;

    try {
      const onboarding = await dependencies.getBarberOnboardingStatus(req.user._id);
      if (onboarding?.needsOnboarding === true && onboarding?.legacyCompatible !== true) {
        return true;
      }
      if (onboarding?.needsOnboarding !== false) {
        res.status(500).json({ message: failureMessage });
        return false;
      }
      if (await dependencies.barberHasPaidAccess(req.user._id)) return true;
      subscriptionRequiredResponse(res);
      return false;
    } catch {
      res.status(500).json({ message: failureMessage });
      return false;
    }
  };

  const getPersonalScheduleByBarber = async (req, res) => {
    if (!await canAccessWithOnboarding(req, res, "Could not fetch personal schedule")) {
      return undefined;
    }

    try {
      const schedule = await getPersonalSchedule(req.user._id);
      return res.json(serializePersonalSchedule(schedule, Boolean(schedule)));
    } catch {
      return res.status(500).json({ message: "Could not fetch personal schedule" });
    }
  };

  const upsertPersonalScheduleByBarber = async (req, res) => {
    if (!await canAccessWithOnboarding(req, res, "Could not save personal schedule")) {
      return undefined;
    }

    let weeklySchedule;

    try {
      weeklySchedule = validatePersonalWeeklySchedule(
        getPersonalScheduleRequestWeeklySchedule(req.body)
      );
    } catch (error) {
      if (error instanceof PersonalScheduleValidationError) {
        return invalidScheduleResponse(res);
      }
      return invalidScheduleResponse(res);
    }

    try {
      const schedule = await upsertPersonalSchedule(req.user._id, weeklySchedule);
      return res.json(serializePersonalSchedule(schedule, true));
    } catch (error) {
      if (error instanceof PersonalScheduleValidationError) {
        return invalidScheduleResponse(res);
      }

      return res.status(500).json({ message: "Could not save personal schedule" });
    }
  };

  return { getPersonalScheduleByBarber, upsertPersonalScheduleByBarber };
};

export const {
  getPersonalScheduleByBarber,
  upsertPersonalScheduleByBarber,
} = createPersonalScheduleController();
