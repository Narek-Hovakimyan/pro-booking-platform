import api from "@/shared/api/axios";

/**
 * Fetch salon dashboard summary.
 * @param {string} salonId
 * @returns {Promise<object>} Dashboard data
 */
export async function getSalonDashboard(salonId) {
  const { data } = await api.get(`/salons/${salonId}/dashboard`);
  return data;
}
