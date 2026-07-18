import api from "./axios";

export const getMyBarberOnboarding = async () => {
  const { data } = await api.get("/barber-onboarding/me");
  return data;
};

export const updateMyBarberOnboardingWorkplace = async (workplace) => {
  const { data } = await api.patch("/barber-onboarding/me", { workplace });
  return data;
};

export const finalizeMyBarberOnboarding = async () => {
  const { data } = await api.post("/barber-onboarding/me/finalize");
  return data;
};

let onboardingStatusRequest = null;

export const getMyBarberOnboardingDeduped = () => {
  if (!onboardingStatusRequest) {
    onboardingStatusRequest = getMyBarberOnboarding().finally(() => {
      onboardingStatusRequest = null;
    });
  }

  return onboardingStatusRequest;
};

export const resolvePostAuthDestination = async (
  user,
  existingDestination,
  token
) => {
  if (user?.role !== "barber") {
    return existingDestination;
  }

  try {
    const options = token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined;
    const { data: status } = await api.get("/barber-onboarding/me", options);
    return status?.needsOnboarding === true ? "/onboarding" : existingDestination;
  } catch {
    return existingDestination;
  }
};
