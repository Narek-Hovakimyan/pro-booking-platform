import User from "../../models/User.js";
import { classifySpecialistOnboardingState } from "../../utils/specialistOnboardingState.js";
import {
  createCompletedOnboardingResponse,
  createLegacyOnboardingResponse,
} from "../../utils/barberOnboardingResponse.js";
import { getBarberOnboardingReadiness } from "./barberOnboardingReadinessService.js";

const USER_PROJECTION = "_id role name phone city profession barberType specialistOnboarding";
const incompleteStatuses = ["not_started", "in_progress"];

export class BarberOnboardingStatusError extends Error {
  constructor(code, statusCode, message, missing) {
    super(message);
    this.name = "BarberOnboardingStatusError";
    this.code = code;
    this.statusCode = statusCode;
    if (Array.isArray(missing)) this.missing = [...missing];
  }
}

export const createBarberOnboardingError = (code, statusCode, message, missing) =>
  new BarberOnboardingStatusError(code, statusCode, message, missing);

const executeQuery = async (query, projection) => {
  const selected = typeof query?.select === "function" ? query.select(projection) : query;
  const lean = typeof selected?.lean === "function" ? selected.lean() : selected;
  return lean && typeof lean.then === "function" ? lean : await lean;
};

const findUser = (UserModel, barberId) => executeQuery(UserModel.findById(barberId), USER_PROJECTION);

const updateUser = (UserModel, barberId, workplace) => executeQuery(
  UserModel.findOneAndUpdate(
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
    { returnDocument: "after", runValidators: true, projection: USER_PROJECTION }
  ),
  USER_PROJECTION
);

const assertBarberUser = (user) => {
  if (!user || user.role !== "barber") {
    throw createBarberOnboardingError("BARBER_ROLE_REQUIRED", 403, "Barber role required");
  }
};

const classifyForStatus = (user) => {
  assertBarberUser(user);
  const classified = classifySpecialistOnboardingState(user);
  if (classified.kind === "malformed") {
    throw createBarberOnboardingError(
      "MALFORMED_ONBOARDING_STATE",
      409,
      "Onboarding state is invalid"
    );
  }
  return classified;
};

const createIncompleteResponse = async (user, state, dependencies) => {
  const progress = await dependencies.getBarberOnboardingReadiness(
    user._id,
    user,
    state,
    dependencies
  );
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
      readyForFinalization: progress.readyForFinalization,
    },
    missing: [...progress.missing],
    allowedActions: [...progress.allowedActions],
  };
};

const normalizeDependencies = (dependencies) => ({
  UserModel: dependencies.UserModel || User,
  getBarberOnboardingReadiness:
    dependencies.getBarberOnboardingReadiness || getBarberOnboardingReadiness,
  BarberProfileModel: dependencies.BarberProfileModel,
  ScheduleModel: dependencies.ScheduleModel,
  validatePersonalWeeklySchedule: dependencies.validatePersonalWeeklySchedule,
});

export const getBarberOnboardingStatus = async (barberId, dependencies = {}) => {
  const deps = normalizeDependencies(dependencies);
  const user = await findUser(deps.UserModel, barberId);
  const classified = classifyForStatus(user);
  if (classified.kind === "legacy") return createLegacyOnboardingResponse();
  if (classified.state.status === "completed") return createCompletedOnboardingResponse(classified.state);
  return createIncompleteResponse(user, classified.state, deps);
};

export const updateBarberOnboardingWorkplace = async (barberId, workplace, dependencies = {}) => {
  const deps = normalizeDependencies(dependencies);
  const user = await findUser(deps.UserModel, barberId);
  const classified = classifyForStatus(user);
  if (classified.kind === "legacy") {
    throw createBarberOnboardingError(
      "LEGACY_ONBOARDING_NOT_APPLICABLE", 409, "Onboarding is not applicable for this account"
    );
  }
  if (classified.state.status === "completed") {
    throw createBarberOnboardingError("ONBOARDING_ALREADY_COMPLETED", 409, "Onboarding is already completed");
  }

  const updatedUser = await updateUser(deps.UserModel, barberId, workplace);
  if (!updatedUser) {
    const latest = classifyForStatus(await findUser(deps.UserModel, barberId));
    if (latest.kind === "legacy") {
      throw createBarberOnboardingError(
        "LEGACY_ONBOARDING_NOT_APPLICABLE", 409, "Onboarding is not applicable for this account"
      );
    }
    if (latest.state.status === "completed") {
      throw createBarberOnboardingError("ONBOARDING_ALREADY_COMPLETED", 409, "Onboarding is already completed");
    }
    throw createBarberOnboardingError("INVALID_ONBOARDING_REQUEST", 409, "Onboarding update could not be applied");
  }

  const updated = classifyForStatus(updatedUser);
  if (updated.kind !== "valid" || updated.state.status === "completed") {
    throw createBarberOnboardingError("INVALID_ONBOARDING_REQUEST", 409, "Onboarding update could not be applied");
  }
  return createIncompleteResponse(updatedUser, updated.state, deps);
};
