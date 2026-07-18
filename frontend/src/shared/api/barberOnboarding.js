import api from "./axios";

export const getMyBarberOnboarding = async () => {
  const { data } = await api.get("/barber-onboarding/me");
  return data;
};

export const updateMyBarberOnboardingWorkplace = async (workplace) => {
  const { data } = await api.patch("/barber-onboarding/me", { workplace });
  return data;
};
