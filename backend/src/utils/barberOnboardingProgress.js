export const professionalBasicsProfessions = Object.freeze([
  "barber",
  "hair_stylist",
  "nail_master",
  "makeup_artist",
  "cosmetologist",
  "lash_brow",
  "massage",
  "other",
]);

export const professionalBasicsBarberTypes = Object.freeze([
  "men",
  "women",
  "unisex",
]);

const allowedActionsBase = Object.freeze([
  "EDIT_PROFILE",
  "UPDATE_WORKPLACE",
  "EDIT_PERSONAL_SCHEDULE",
]);

const readFact = (facts, field) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(facts, field);
    if (!descriptor || !("value" in descriptor)) return undefined;
    return descriptor.value;
  } catch {
    return undefined;
  }
};

const boolFact = (facts, field) => readFact(facts, field) === true;

const stringFact = (facts, field) => {
  const value = readFact(facts, field);
  return typeof value === "string" ? value : null;
};

const hasNonEmptyString = (facts, field) => boolFact(facts, field);

const isValidProfession = (profession) =>
  professionalBasicsProfessions.includes(profession);

const isWorkplaceSelected = (workplace) =>
  workplace === "independent" || workplace === "salon";

export const buildBarberOnboardingProgress = (facts) => {
  const safeFacts = facts && typeof facts === "object" && !Array.isArray(facts)
    ? facts
    : Object.create(null);
  const profession = stringFact(safeFacts, "profession");
  const workplace = stringFact(safeFacts, "workplace");
  const storedStatus = stringFact(safeFacts, "storedStatus");
  const hasName = hasNonEmptyString(safeFacts, "hasName");
  const hasPhone = hasNonEmptyString(safeFacts, "hasPhone");
  const hasCity = hasNonEmptyString(safeFacts, "hasCity");
  const hasBarberType = boolFact(safeFacts, "hasBarberType");
  const hasIndependentAddress = boolFact(safeFacts, "hasIndependentAddress");
  const personalScheduleExists = boolFact(safeFacts, "personalScheduleExists");
  const personalScheduleValid = personalScheduleExists &&
    boolFact(safeFacts, "personalScheduleValid");
  const validProfession = isValidProfession(profession);
  const barberTypeRequired = profession === "barber";
  const professionalBasicsComplete = hasName &&
    hasPhone &&
    hasCity &&
    validProfession &&
    (!barberTypeRequired || hasBarberType);
  const workplaceSelected = isWorkplaceSelected(workplace);
  const readyForReview = professionalBasicsComplete &&
    workplaceSelected &&
    personalScheduleValid;

  const missing = [];
  if (!hasName) missing.push("NAME_REQUIRED");
  if (!hasPhone) missing.push("PHONE_REQUIRED");
  if (!hasCity) missing.push("CITY_REQUIRED");
  if (!validProfession) missing.push("PROFESSION_REQUIRED");
  if (barberTypeRequired && !hasBarberType) missing.push("BARBER_TYPE_REQUIRED");
  if (!workplaceSelected) missing.push("WORKPLACE_REQUIRED");
  if (!personalScheduleExists) {
    missing.push("PERSONAL_SCHEDULE_REQUIRED");
  } else if (!personalScheduleValid) {
    missing.push("PERSONAL_SCHEDULE_INVALID");
  }
  if (workplace === "independent" && !hasIndependentAddress) {
    missing.push("INDEPENDENT_ADDRESS_REQUIRED");
  }

  let derivedCurrentStep = "review";
  if (!professionalBasicsComplete) {
    derivedCurrentStep = "professional_basics";
  } else if (!workplaceSelected) {
    derivedCurrentStep = "workplace";
  } else if (!personalScheduleValid) {
    derivedCurrentStep = "personal_schedule";
  }

  if (storedStatus === "completed") {
    return {
      derivedCurrentStep: null,
      professionalBasicsComplete,
      workplaceSelected,
      personalScheduleExists,
      personalScheduleValid,
      readyForReview,
      missing: [],
      allowedActions: [],
      needsOnboarding: false,
    };
  }

  return {
    derivedCurrentStep,
    professionalBasicsComplete,
    workplaceSelected,
    personalScheduleExists,
    personalScheduleValid,
    readyForReview,
    missing: [...missing],
    allowedActions: readyForReview
      ? [...allowedActionsBase, "REVIEW_ONBOARDING"]
      : [...allowedActionsBase],
    needsOnboarding: true,
  };
};
