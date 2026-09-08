import api from "@/shared/api/axios";

export async function getPlatformAuditLogs(params = {}) {
  const { data } = await api.get("/platform/audit", { params });
  return data;
}
