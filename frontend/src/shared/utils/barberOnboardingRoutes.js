const currentStepRoutes = Object.freeze({
  workplace: "/onboarding",
  professional_basics: "/admin/profile",
  personal_schedule: "/admin/schedule",
  review: "/onboarding",
});

export const getOnboardingStepRoute = (currentStep) =>
  currentStepRoutes[currentStep] || "/onboarding";

export const isOnboardingComplete = (status) =>
  status?.needsOnboarding === false || status?.legacyCompatible === true;

export const isRequiredOnboardingRoute = (pathname, status) =>
  pathname === getOnboardingStepRoute(status?.state?.currentStep);

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

  const requiredRoute = getOnboardingStepRoute(status.state?.currentStep);
  return pathname === requiredRoute ? null : requiredRoute;
};
