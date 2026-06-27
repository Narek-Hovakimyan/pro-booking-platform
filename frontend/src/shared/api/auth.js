import api from "./axios";

export async function forgotPassword(phone) {
  const { data } = await api.post("/auth/forgot-password", { phone });
  return data;
}

export async function resetPassword(token, password) {
  const { data } = await api.post("/auth/reset-password", { token, password });
  return data;
}
