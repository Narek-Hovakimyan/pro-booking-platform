const completedAtJson = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value.toJSON() : null;

export const createLegacyOnboardingResponse = () => ({
  applicable: false,
  legacyCompatible: true,
  needsOnboarding: false,
  state: null,
  progress: null,
  missing: [],
  allowedActions: [],
});

export const createCompletedOnboardingResponse = (state) => ({
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
