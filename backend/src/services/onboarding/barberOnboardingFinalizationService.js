import User from "../../models/User.js";
import { classifySpecialistOnboardingState } from "../../utils/specialistOnboardingState.js";
import { createCompletedOnboardingResponse } from "../../utils/barberOnboardingResponse.js";
import { getBarberOnboardingReadiness } from "./barberOnboardingReadinessService.js";
import { createBarberOnboardingError } from "./barberOnboardingStatusService.js";

const INITIAL_PROJECTION = "_id role name phone city profession barberType specialistOnboarding";
const COMPLETION_PROJECTION = "_id role specialistOnboarding";
const incompleteStatuses = ["not_started", "in_progress"];

const executeQuery = async (query, projection) => {
  const selected = typeof query?.select === "function" ? query.select(projection) : query;
  const lean = typeof selected?.lean === "function" ? selected.lean() : selected;
  return lean && typeof lean.then === "function" ? lean : await lean;
};

const findUser = (UserModel, barberId, projection) =>
  executeQuery(UserModel.findById(barberId), projection);

const completeUser = (UserModel, barberId, workplace, completedAt) => executeQuery(
  UserModel.findOneAndUpdate(
    {
      _id: barberId,
      role: "barber",
      "specialistOnboarding.version": 1,
      "specialistOnboarding.status": { $in: incompleteStatuses },
      "specialistOnboarding.completedAt": null,
      "specialistOnboarding.workplace": workplace,
    },
    {
      $set: {
        "specialistOnboarding.status": "completed",
        "specialistOnboarding.currentStep": null,
        "specialistOnboarding.completedAt": completedAt,
      },
    },
    { returnDocument: "after", runValidators: true, projection: COMPLETION_PROJECTION }
  ),
  COMPLETION_PROJECTION
);

const normalizeDependencies = (dependencies) => ({
  UserModel: dependencies.UserModel || User,
  getBarberOnboardingReadiness:
    dependencies.getBarberOnboardingReadiness || getBarberOnboardingReadiness,
  BarberProfileModel: dependencies.BarberProfileModel,
  ScheduleModel: dependencies.ScheduleModel,
  validatePersonalWeeklySchedule: dependencies.validatePersonalWeeklySchedule,
  now: dependencies.now || (() => new Date()),
});

const assertBarber = (user) => {
  if (!user || user.role !== "barber") {
    throw createBarberOnboardingError("BARBER_ROLE_REQUIRED", 403, "Barber role required");
  }
};

const classify = (user) => {
  assertBarber(user);
  const classified = classifySpecialistOnboardingState(user);
  if (classified.kind === "malformed") {
    throw createBarberOnboardingError("MALFORMED_ONBOARDING_STATE", 409, "Onboarding state is invalid");
  }
  return classified;
};

const throwLegacy = () => {
  throw createBarberOnboardingError(
    "LEGACY_ONBOARDING_NOT_APPLICABLE", 409, "Onboarding is not applicable for this account"
  );
};

const throwConflict = () => {
  throw createBarberOnboardingError(
    "ONBOARDING_FINALIZATION_CONFLICT", 409, "Onboarding finalization could not be applied"
  );
};

export const finalizeBarberOnboarding = async (barberId, dependencies = {}) => {
  const deps = normalizeDependencies(dependencies);
  const user = await findUser(deps.UserModel, barberId, INITIAL_PROJECTION);
  const initial = classify(user);
  if (initial.kind === "legacy") throwLegacy();
  if (initial.state.status === "completed") return createCompletedOnboardingResponse(initial.state);

  const readiness = await deps.getBarberOnboardingReadiness(
    barberId,
    user,
    initial.state,
    deps
  );
  if (!readiness.readyForFinalization) {
    throw createBarberOnboardingError(
      "ONBOARDING_REQUIREMENTS_INCOMPLETE",
      400,
      "Onboarding requirements are incomplete",
      readiness.missing
    );
  }

  const completedAt = deps.now();
  const updatedUser = await completeUser(
    deps.UserModel,
    barberId,
    initial.state.workplace,
    completedAt
  );
  if (updatedUser) {
    const updated = classify(updatedUser);
    if (updated.kind === "valid" && updated.state.status === "completed") {
      return createCompletedOnboardingResponse(updated.state);
    }
    throwConflict();
  }

  const latestUser = await findUser(deps.UserModel, barberId, COMPLETION_PROJECTION);
  if (!latestUser) throwConflict();
  const latest = classify(latestUser);
  if (latest.kind === "legacy") throwLegacy();
  if (latest.state.status === "completed") return createCompletedOnboardingResponse(latest.state);
  throwConflict();
};
