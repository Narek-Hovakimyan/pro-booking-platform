import api from "@/shared/api/axios";

/**
 * Fetch salon reports with date-range analytics.
 * @param {string} salonId
 * @param {object} params - { from: YYYY-MM-DD, to: YYYY-MM-DD, barberId?: string }
 * @returns {Promise<object>} Report data
 */
export async function getSalonReports(salonId, params) {
  const { data } = await api.get(`/salons/${salonId}/reports`, { params });
  return data;
}
