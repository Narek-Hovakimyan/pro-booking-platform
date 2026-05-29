import api from "./axios";

export const getMyLoyaltyProgress = async () => {
  const { data } = await api.get("/api/loyalty/progress/me");
  return data;
};
