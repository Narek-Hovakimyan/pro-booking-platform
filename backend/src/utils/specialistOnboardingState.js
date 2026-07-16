export const SPECIALIST_ONBOARDING_VERSION = 1;

export const specialistOnboardingStatuses = Object.freeze([
  "not_started",
  "in_progress",
  "completed",
]);

export const specialistOnboardingSteps = Object.freeze([
  "professional_basics",
  "workplace",
  "personal_schedule",
  "review",
]);

export const specialistOnboardingWorkplaces = Object.freeze([
  "independent",
  "salon",
]);

const readPlainObject = (value) => {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const plainValue = typeof value.toObject === "function" ? value.toObject() : value;
    return plainValue && typeof plainValue === "object" && !Array.isArray(plainValue)
      ? plainValue
      : null;
  } catch {
    return null;
  }
};

const serializeCompletedAt = (value) => {
  try {
    if (value === null || value === undefined) return null;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return undefined;
    return new Date(value.getTime());
  } catch {
    return undefined;
  }
};

export const createInitialSpecialistOnboardingState = () => ({
  version: SPECIALIST_ONBOARDING_VERSION,
  status: "not_started",
  currentStep: "professional_basics",
  workplace: null,
  completedAt: null,
});

const serializeInitialState = () => ({
  ...createInitialSpecialistOnboardingState(),
  needsOnboarding: true,
});

const serializeLegacyState = () => ({
  version: 0,
  status: "legacy",
  currentStep: null,
  workplace: null,
  completedAt: null,
  needsOnboarding: false,
});

const isAllowedOrNull = (value, allowedValues) =>
  value === null || allowedValues.includes(value);

const readOwnField = (candidate, field) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) {
      return { valid: false };
    }

    return { valid: true, value: candidate[field] };
  } catch {
    return { valid: false };
  }
};

const serializeExplicitState = (value) => {
  const state = readPlainObject(value);
  if (!state) return null;

  const version = readOwnField(state, "version");
  const status = readOwnField(state, "status");
  const currentStep = readOwnField(state, "currentStep");
  const workplace = readOwnField(state, "workplace");
  const completedAtValue = readOwnField(state, "completedAt");

  if (
    !version.valid ||
    !status.valid ||
    !currentStep.valid ||
    !workplace.valid ||
    !completedAtValue.valid
  ) {
    return null;
  }

  if (version.value !== SPECIALIST_ONBOARDING_VERSION) return null;
  if (!specialistOnboardingStatuses.includes(status.value)) return null;
  if (!isAllowedOrNull(currentStep.value, specialistOnboardingSteps)) return null;
  if (!isAllowedOrNull(workplace.value, specialistOnboardingWorkplaces)) return null;

  const completedAt = serializeCompletedAt(completedAtValue.value);
  if (completedAt === undefined) return null;

  return {
    version: SPECIALIST_ONBOARDING_VERSION,
    status: status.value,
    currentStep: currentStep.value,
    workplace: workplace.value,
    completedAt,
    needsOnboarding: status.value !== "completed",
  };
};

export const serializeSpecialistOnboardingState = (user) => {
  let role;
  let specialistOnboarding;

  try {
    role = user?.role;
    specialistOnboarding = user?.specialistOnboarding;
  } catch {
    return role === "barber" ? serializeInitialState() : undefined;
  }

  if (role !== "barber") return undefined;

  if (specialistOnboarding === undefined) {
    return serializeLegacyState();
  }

  return serializeExplicitState(specialistOnboarding) || serializeInitialState();
};
