import BarberProfile from "../../models/BarberProfile.js";
import Schedule from "../../models/Schedule.js";
import { buildBarberOnboardingProgress } from "../../utils/barberOnboardingProgress.js";
import {
  PersonalScheduleValidationError,
  validatePersonalWeeklySchedule,
} from "../../utils/personalScheduleUtils.js";

const PROFILE_PROJECTION = "address";
const SCHEDULE_PROJECTION = "weeklySchedule";

const executeQuery = async (query, projection) => {
  const selected = typeof query?.select === "function" ? query.select(projection) : query;
  const lean = typeof selected?.lean === "function" ? selected.lean() : selected;
  return lean && typeof lean.then === "function" ? lean : await lean;
};

const hasTrimmedString = (value) => typeof value === "string" && value.trim().length > 0;
const hasCanonicalBarberType = (value) => value === "men" || value === "women" || value === "unisex";

const findProfile = (BarberProfileModel, barberId) =>
  executeQuery(BarberProfileModel.findOne({ barberId }), PROFILE_PROJECTION);

const findSchedule = (ScheduleModel, barberId) =>
  executeQuery(ScheduleModel.findOne({ barberId, salonId: null }), SCHEDULE_PROJECTION);

const readScheduleFacts = async (ScheduleModel, barberId, validateWeeklySchedule) => {
  const schedule = await findSchedule(ScheduleModel, barberId);
  if (!schedule) return { personalScheduleExists: false, personalScheduleValid: false };

  try {
    validateWeeklySchedule(schedule.weeklySchedule);
    return { personalScheduleExists: true, personalScheduleValid: true };
  } catch (error) {
    if (!(error instanceof PersonalScheduleValidationError)) throw error;
    return { personalScheduleExists: true, personalScheduleValid: false };
  }
};

const normalizeDependencies = (dependencies) => ({
  BarberProfileModel: dependencies.BarberProfileModel || BarberProfile,
  ScheduleModel: dependencies.ScheduleModel || Schedule,
  validatePersonalWeeklySchedule: dependencies.validatePersonalWeeklySchedule || validatePersonalWeeklySchedule,
});

export const getBarberOnboardingReadiness = async (
  barberId,
  userSnapshot,
  onboardingState,
  dependencies = {}
) => {
  const deps = normalizeDependencies(dependencies);
  const [profile, scheduleFacts] = await Promise.all([
    onboardingState.workplace === "independent"
      ? findProfile(deps.BarberProfileModel, barberId)
      : Promise.resolve(null),
    readScheduleFacts(deps.ScheduleModel, barberId, deps.validatePersonalWeeklySchedule),
  ]);

  return buildBarberOnboardingProgress({
    hasName: hasTrimmedString(userSnapshot.name),
    hasPhone: hasTrimmedString(userSnapshot.phone),
    hasCity: hasTrimmedString(userSnapshot.city),
    profession: userSnapshot.profession,
    hasBarberType: hasCanonicalBarberType(userSnapshot.barberType),
    workplace: onboardingState.workplace,
    hasIndependentAddress: hasTrimmedString(profile?.address),
    personalScheduleExists: scheduleFacts.personalScheduleExists,
    personalScheduleValid: scheduleFacts.personalScheduleValid,
    storedStatus: onboardingState.status,
  });
};
