import api from "./axios";

export const getMyRevenue = async ({ from, to } = {}) => {
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;
  const { data } = await api.get("/api/revenue/me", { params });
  return data;
};
