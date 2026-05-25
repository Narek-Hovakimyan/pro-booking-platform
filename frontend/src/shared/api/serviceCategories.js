import api from "./axios";

/**
 * Fetch service categories for a barber owner.
 *
 * When ownerType/ownerId are provided, the API returns system categories
 * + the authenticated barber's own custom categories.
 *
 * Without owner params, returns only system categories (public).
 *
 * @param {string} ownerId - The barber's user ID
 * @returns {Promise<Array>} Flat array of category objects
 */
export async function fetchServiceCategories(ownerId) {
  const params = ownerId
    ? { ownerType: "barber", ownerId }
    : {};

  const { data } = await api.get("/service-categories", { params });
  return data;
}

/**
 * Create a custom service category owned by the barber.
 *
 * @param {string} name - Display name
 * @param {string} ownerId - The barber's user ID
 * @returns {Promise<object>} Created category object
 */
export async function createServiceCategory(name, ownerId) {
  const { data } = await api.post("/service-categories", {
    name,
    ownerType: "barber",
    ownerId,
  });
  return data;
}
