import api from "@/shared/api/axios";

export async function confirmRecentAuthentication(payload) {
  await api.post("/auth/recent-authentication", payload);
}
