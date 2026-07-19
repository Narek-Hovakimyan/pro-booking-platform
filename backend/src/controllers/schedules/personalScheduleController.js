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

export const getPersonalScheduleByBarber = async (req, res) => {
  if (!canAccessPersonalSchedule(req, res)) return undefined;

  try {
    const schedule = await getPersonalSchedule(req.user._id);
    return res.json(serializePersonalSchedule(schedule, Boolean(schedule)));
  } catch {
    return res.status(500).json({ message: "Could not fetch personal schedule" });
  }
};

export const upsertPersonalScheduleByBarber = async (req, res) => {
  if (!canAccessPersonalSchedule(req, res)) return undefined;

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
