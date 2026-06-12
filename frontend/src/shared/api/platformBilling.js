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

/**
 * Activate or renew a salon subscription (platform admin only).
 * @param {string} salonId
 * @param {object} payload - { seatCount?, months?, note }
 * @returns {Promise<object>} Updated salon billing detail
 */
export async function activatePlatformSalonSubscription(salonId, payload) {
  const { data } = await api.patch(`/platform/billing/salons/${salonId}/subscription/activate`, payload);
  return data;
}

/**
 * Update salon subscription seat count (platform admin only).
 * @param {string} salonId
 * @param {object} payload - { seatCount, note }
 * @returns {Promise<object>} Updated salon billing detail
 */
export async function updatePlatformSalonSeatCount(salonId, payload) {
  const { data } = await api.patch(`/platform/billing/salons/${salonId}/subscription/seat-count`, payload);
  return data;
}

/**
 * Assign a subscription seat to an accepted staff barber (platform admin only).
 * @param {string} salonId
 * @param {object} payload - { barberId, note }
 * @returns {Promise<object>} Updated salon billing detail
 */
export async function assignPlatformSalonSeat(salonId, payload) {
  const { data } = await api.post(`/platform/billing/salons/${salonId}/seats/assign`, payload);
  return data;
}

/**
 * Revoke a subscription seat from an assigned staff barber (platform admin only).
 * @param {string} salonId
 * @param {object} payload - { barberId, note }
 * @returns {Promise<object>} Updated salon billing detail
 */
export async function revokePlatformSalonSeat(salonId, payload) {
  const { data } = await api.post(`/platform/billing/salons/${salonId}/seats/revoke`, payload);
  return data;
}

/**
 * Manually confirm a salon subscription payment attempt (platform admin only).
 * @param {string} paymentId
 * @param {object} payload - { note }
 * @returns {Promise<object>} Confirmation result
 */
export async function confirmPlatformSalonPayment(paymentId, payload) {
  const { data } = await api.post(`/platform/billing/payments/${paymentId}/confirm`, payload);
  return data;
}
