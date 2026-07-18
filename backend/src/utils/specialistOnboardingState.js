import mongoose from "mongoose";

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
  "both",
]);

const readOwnDataField = (candidate, field) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, field);
    if (!descriptor) return { present: false, valid: false };
    if (!("value" in descriptor)) return { present: true, valid: false };
    return { present: true, valid: true, value: descriptor.value };
  } catch {
    return { present: true, valid: false };
  }
};

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

const isSupportedPlainObject = (value) => {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const findPrototypeDataField = (value, field) => {
  try {
    let prototype = Object.getPrototypeOf(value);

    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, field);
      if (descriptor) {
        return "value" in descriptor
          ? { present: true, valid: true, value: descriptor.value }
          : { present: true, valid: false };
      }
      prototype = Object.getPrototypeOf(prototype);
    }

    return { present: false, valid: true };
  } catch {
    return { present: true, valid: false };
  }
};

const normalizeMongooseDocument = (value) => {
  try {
    if (!(value instanceof mongoose.Document)) return { isMongooseDocument: false };

    const toObject = findPrototypeDataField(value, "toObject");
    if (!toObject.present || !toObject.valid || typeof toObject.value !== "function") {
      return { isMongooseDocument: true, value: null };
    }

    const plainValue = toObject.value.call(value);
    return {
      isMongooseDocument: true,
      value: isSupportedPlainObject(plainValue) ? plainValue : null,
    };
  } catch {
    return { isMongooseDocument: true, value: null };
  }
};

const readStrictPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const normalized = normalizeMongooseDocument(value);
  if (normalized.isMongooseDocument) return normalized.value;
  return isSupportedPlainObject(value) ? value : null;
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

export const classifySpecialistOnboardingState = (user) => {
  try {
    if (!user || typeof user !== "object" || Array.isArray(user)) {
      return { kind: "legacy" };
    }

    const normalized = normalizeMongooseDocument(user);
    if (normalized.isMongooseDocument && !normalized.value) {
      return { kind: "malformed" };
    }

    const candidate = normalized.isMongooseDocument ? normalized.value : user;
    const field = readOwnDataField(candidate, "specialistOnboarding");

    if (!field.present) {
      const inherited = findPrototypeDataField(candidate, "specialistOnboarding");
      if (!inherited.valid || inherited.present) return { kind: "malformed" };
      return { kind: "legacy" };
    }
    if (!field.valid || field.value === undefined) return { kind: "malformed" };

    const state = readStrictPlainObject(field.value);
    if (!state) return { kind: "malformed" };

    const version = readOwnDataField(state, "version");
    const status = readOwnDataField(state, "status");
    const currentStep = readOwnDataField(state, "currentStep");
    const workplace = readOwnDataField(state, "workplace");
    const completedAtValue = readOwnDataField(state, "completedAt");

    if (
      !version.valid ||
      !status.valid ||
      !currentStep.valid ||
      !workplace.valid ||
      !completedAtValue.valid
    ) {
      return { kind: "malformed" };
    }

    if (version.value !== SPECIALIST_ONBOARDING_VERSION) return { kind: "malformed" };
    if (!specialistOnboardingStatuses.includes(status.value)) return { kind: "malformed" };
    if (!isAllowedOrNull(currentStep.value, specialistOnboardingSteps)) {
      return { kind: "malformed" };
    }
    if (!isAllowedOrNull(workplace.value, specialistOnboardingWorkplaces)) {
      return { kind: "malformed" };
    }

    const completedAt = serializeCompletedAt(completedAtValue.value);
    if (completedAt === undefined) return { kind: "malformed" };

    return {
      kind: "valid",
      state: {
        version: SPECIALIST_ONBOARDING_VERSION,
        status: status.value,
        currentStep: currentStep.value,
        workplace: workplace.value,
        completedAt,
      },
    };
  } catch {
    return { kind: "malformed" };
  }
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
