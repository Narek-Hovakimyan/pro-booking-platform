const currentStepRoutes = Object.freeze({
  workplace: "/onboarding",
  professional_basics: "/onboarding",
  personal_schedule: "/onboarding",
  review: "/onboarding",
});

export const getOnboardingStepRoute = (currentStep) =>
  currentStepRoutes[currentStep] || "/onboarding";

export const isOnboardingComplete = (status) =>
  status?.needsOnboarding === false || status?.legacyCompatible === true;

export const isRequiredOnboardingRoute = (pathname, status) =>
  status?.needsOnboarding === true &&
  !isOnboardingComplete(status) &&
  pathname === "/onboarding";

export const getBarberOnboardingRedirect = (pathname, status) => {
  if (!status || status.applicable === false) {
    return null;
  }

  if (isOnboardingComplete(status)) {
    return pathname === "/onboarding" ? "/admin" : null;
  }

  if (pathname === "/onboarding") {
    return null;
  }

  return "/onboarding";
};
