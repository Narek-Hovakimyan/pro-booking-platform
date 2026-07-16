import BarberProfile from "../../models/BarberProfile.js";
import Schedule from "../../models/Schedule.js";
import User from "../../models/User.js";
import { buildBarberOnboardingProgress } from "../../utils/barberOnboardingProgress.js";
import { validatePersonalWeeklySchedule } from "../../utils/personalScheduleUtils.js";
import { classifySpecialistOnboardingState } from "../../utils/specialistOnboardingState.js";

const USER_PROJECTION = "_id role name phone city profession barberType specialistOnboarding";
const PROFILE_PROJECTION = "address";
const SCHEDULE_PROJECTION = "weeklySchedule";
const incompleteStatuses = ["not_started", "in_progress"];

export class BarberOnboardingStatusError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = "BarberOnboardingStatusError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const domainError = (code, statusCode, message) => new BarberOnboardingStatusError(code, statusCode, message);

const executeQuery = async (query, projection) => {
  const selected = typeof query?.select === "function" ? query.select(projection) : query;
  const lean = typeof selected?.lean === "function" ? selected.lean() : selected;
  return lean && typeof lean.then === "function" ? lean : await lean;
};

const findUser = (UserModel, barberId) => {
  const query = UserModel.findById(barberId);
  return executeQuery(query, USER_PROJECTION);
};

const findProfile = (BarberProfileModel, barberId) => {
  const query = BarberProfileModel.findOne({ barberId });
  return executeQuery(query, PROFILE_PROJECTION);
};

const findSchedule = (ScheduleModel, barberId) => {
  const query = ScheduleModel.findOne({ barberId, salonId: null });
  return executeQuery(query, SCHEDULE_PROJECTION);
};

const updateUser = (UserModel, barberId, workplace) => {
  const query = UserModel.findOneAndUpdate(
    {
      _id: barberId,
      role: "barber",
      "specialistOnboarding.version": 1,
      "specialistOnboarding.status": { $in: incompleteStatuses },
    },
    {
      $set: {
        "specialistOnboarding.workplace": workplace,
        "specialistOnboarding.status": "in_progress",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      projection: USER_PROJECTION,
    }
  );
  return executeQuery(query, USER_PROJECTION);
};

const hasTrimmedString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const hasCanonicalBarberType = (value) =>
  value === "men" || value === "women" || value === "unisex";

const readPersonalScheduleStatus = async (ScheduleModel, barberId) => {
  const schedule = await findSchedule(ScheduleModel, barberId);
  if (!schedule) {
    return { personalScheduleExists: false, personalScheduleValid: false };
  }

  try {
    validatePersonalWeeklySchedule(schedule.weeklySchedule);
    return { personalScheduleExists: true, personalScheduleValid: true };
  } catch {
    return { personalScheduleExists: true, personalScheduleValid: false };
  }
};

const completedAtJson = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toJSON();
  }
  return null;
};

const createLegacyResponse = () => ({
  applicable: false,
  legacyCompatible: true,
  needsOnboarding: false,
  state: null,
  progress: null,
  missing: [],
  allowedActions: [],
});

const createCompletedResponse = (state) => ({
  applicable: true,
  legacyCompatible: false,
  needsOnboarding: false,
  state: {
    version: 1,
    status: "completed",
    currentStep: null,
    workplace: state.workplace,
    completedAt: completedAtJson(state.completedAt),
  },
  progress: null,
  missing: [],
  allowedActions: [],
});

const assertBarberUser = (user) => {
  if (!user || user.role !== "barber") {
    throw domainError("BARBER_ROLE_REQUIRED", 403, "Barber role required");
  }
};

const classifyForStatus = (user) => {
  assertBarberUser(user);
  const classified = classifySpecialistOnboardingState(user);

  if (classified.kind === "legacy") return classified;
  if (classified.kind === "malformed") {
    throw domainError(
      "MALFORMED_ONBOARDING_STATE",
      409,
      "Onboarding state is invalid"
    );
  }

  return classified;
};

const createIncompleteResponse = async (user, state, dependencies) => {
  const [profile, scheduleStatus] = await Promise.all([
    findProfile(dependencies.BarberProfileModel, user._id),
    readPersonalScheduleStatus(dependencies.ScheduleModel, user._id),
  ]);
  const progress = buildBarberOnboardingProgress({
    hasName: hasTrimmedString(user.name),
    hasPhone: hasTrimmedString(user.phone),
    hasCity: hasTrimmedString(user.city),
    profession: user.profession,
    hasBarberType: hasCanonicalBarberType(user.barberType),
    workplace: state.workplace,
    hasIndependentAddress: hasTrimmedString(profile?.address),
    personalScheduleExists: scheduleStatus.personalScheduleExists,
    personalScheduleValid: scheduleStatus.personalScheduleValid,
    storedStatus: state.status,
  });

  return {
    applicable: true,
    legacyCompatible: false,
    needsOnboarding: progress.needsOnboarding,
    state: {
      version: 1,
      status: state.status,
      currentStep: progress.derivedCurrentStep,
      workplace: state.workplace,
      completedAt: null,
    },
    progress: {
      professionalBasicsComplete: progress.professionalBasicsComplete,
      workplaceSelected: progress.workplaceSelected,
      personalScheduleExists: progress.personalScheduleExists,
      personalScheduleValid: progress.personalScheduleValid,
      readyForReview: progress.readyForReview,
    },
    missing: progress.missing,
    allowedActions: progress.allowedActions,
  };
};

const normalizeDependencies = (dependencies) => ({
  UserModel: dependencies.UserModel || User,
  BarberProfileModel: dependencies.BarberProfileModel || BarberProfile,
  ScheduleModel: dependencies.ScheduleModel || Schedule,
});

export const getBarberOnboardingStatus = async (barberId, dependencies = {}) => {
  const deps = normalizeDependencies(dependencies);
  const user = await findUser(deps.UserModel, barberId);
  const classified = classifyForStatus(user);

  if (classified.kind === "legacy") return createLegacyResponse();
  if (classified.state.status === "completed") {
    return createCompletedResponse(classified.state);
  }

  return createIncompleteResponse(user, classified.state, deps);
};

export const updateBarberOnboardingWorkplace = async (
  barberId,
  workplace,
  dependencies = {}
) => {
  const deps = normalizeDependencies(dependencies);
  const user = await findUser(deps.UserModel, barberId);
  const classified = classifyForStatus(user);

  if (classified.kind === "legacy") {
    throw domainError(
      "LEGACY_ONBOARDING_NOT_APPLICABLE",
      409,
      "Onboarding is not applicable for this account"
    );
  }
  if (classified.state.status === "completed") {
    throw domainError("ONBOARDING_ALREADY_COMPLETED", 409, "Onboarding is already completed");
  }

  const updatedUser = await updateUser(deps.UserModel, barberId, workplace);

  if (!updatedUser) {
    const latestUser = await findUser(deps.UserModel, barberId);
    const latest = classifyForStatus(latestUser);

    if (latest.kind === "legacy") {
      throw domainError(
        "LEGACY_ONBOARDING_NOT_APPLICABLE",
        409,
        "Onboarding is not applicable for this account"
      );
    }
    if (latest.state.status === "completed") {
      throw domainError("ONBOARDING_ALREADY_COMPLETED", 409, "Onboarding is already completed");
    }

    throw domainError("INVALID_ONBOARDING_REQUEST", 409, "Onboarding update could not be applied");
  }

  const updated = classifyForStatus(updatedUser);
  if (updated.kind !== "valid" || updated.state.status === "completed") {
    throw domainError("INVALID_ONBOARDING_REQUEST", 409, "Onboarding update could not be applied");
  }

  return createIncompleteResponse(updatedUser, updated.state, deps);
};
