import api from "./axios";

export const getMyLoyaltyProgress = async () => {
  const { data } = await api.get("/loyalty/progress/me");
  return data;
};
