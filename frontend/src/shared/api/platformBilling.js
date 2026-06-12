import api from "@/shared/api/axios";

/**
 * Fetch paginated list of salon billing summaries (platform admin only).
 * @param {object} params
 * @param {number} params.page
 * @param {number} params.limit
 * @param {string} [params.search]  – salon name search
 * @param {string} [params.subscriptionStatus] – 'active' | 'expired' | 'none'
 * @returns {Promise<object>} { salons, total }
 */
export async function getPlatformBillingSalons(params = {}) {
  const { data } = await api.get("/platform/billing/salons", { params });
  return data;
}

/**
 * Fetch detailed billing info for a single salon (platform admin only).
 * @param {string} salonId
 * @returns {Promise<object>} Salon billing detail
 */
export async function getPlatformBillingSalonDetail(salonId) {
  const { data } = await api.get(`/platform/billing/salons/${salonId}`);
  return data;
}

/**
 * Fetch paginated payment attempts for a salon (platform admin only).
 * @param {string} salonId
 * @param {object} params
 * @param {number} params.page
 * @param {number} params.limit
 * @returns {Promise<object>} { payments, total }
 */
export async function getPlatformBillingSalonPayments(salonId, params = {}) {
  const { data } = await api.get(`/platform/billing/salons/${salonId}/payments`, { params });
  return data;
}
