import api from "./axios";

/**
 * Fetch public portfolio photos for a given barber.
 * No auth required. Backend filters: active=true, isPublic=true, consentConfirmed=true.
 * @param {string} barberId - Barber's user ID
 * @returns {Promise<Array>} Array of public portfolio photo objects
 */
export async function getPublicPortfolio(barberId) {
  const { data } = await api.get(`/portfolio/barber/${barberId}`);
  return data;
}

/**
 * Fetch the authenticated barber's own portfolio photos.
 * @returns {Promise<Array>} Array of portfolio photo objects
 */
export async function getMyPortfolio() {
  const { data } = await api.get("/portfolio/me");
  return data;
}

export async function getPortfolioImageBlob(id, kind) {
  const { data } = await api.get(`/portfolio/${id}/images/${kind}`, {
    responseType: "blob",
  });
  return data;
}

/**
 * Create a new portfolio before/after photo pair.
 * @param {FormData} formData - Must include beforeImage and afterImage files.
 *   May include caption, category, tags, isPublic, consentConfirmed.
 * @returns {Promise<object>} Created portfolio photo object
 */
export async function createPortfolioPhoto(formData) {
  const { data } = await api.post("/portfolio", formData);
  return data;
}

/**
 * Update portfolio photo metadata.
 * @param {string} id - Portfolio photo ID
 * @param {object} payload - Fields to update (caption, category, tags, isPublic,
 *   consentConfirmed, sortOrder, salonId, serviceId)
 * @returns {Promise<object>} Updated portfolio photo object
 */
export async function updatePortfolioPhoto(id, payload) {
  const { data } = await api.put(`/portfolio/${id}`, payload);
  return data;
}

/**
 * Soft-delete a portfolio photo.
 * @param {string} id - Portfolio photo ID
 * @returns {Promise<void>}
 */
export async function deletePortfolioPhoto(id) {
  await api.delete(`/portfolio/${id}`);
}
