export const serviceCategories = [
  { value: "haircut", label: "Haircut" },
  { value: "hair-color", label: "Hair color" },
  { value: "styling", label: "Styling" },
  { value: "beard", label: "Beard" },
  { value: "nails", label: "Nails" },
  { value: "makeup", label: "Makeup" },
  { value: "cosmetology", label: "Cosmetology" },
  { value: "lashes-brows", label: "Lashes & brows" },
  { value: "massage", label: "Massage" },
  { value: "other", label: "Other" },
];

export const serviceCategoryLabels = Object.fromEntries(
  serviceCategories.map((category) => [category.value, category.label])
);

export const getServiceCategoryLabel = (category) =>
  serviceCategoryLabels[category] || serviceCategoryLabels.other;

/**
 * Get the display category name for a service.
 *
 * - If the service has a populated customCategoryId with a name, returns that name.
 * - Otherwise falls back to the system category label.
 *
 * Safe for:
 * - customCategoryId as populated object { _id, name, ... }
 * - customCategoryId as raw ObjectId string
 * - customCategoryId as null/undefined
 * - service without customCategoryId field
 *
 * @param {object} service
 * @returns {string}
 */
export const getServiceDisplayCategory = (service) => {
  const custom = service?.customCategoryId;
  if (custom && typeof custom === "object" && custom.name) {
    return String(custom.name);
  }
  return getServiceCategoryLabel(service?.category || "other");
};

/**
 * Get a stable, unique key for a service's display category.
 *
 * Returns:
 * - `"custom:<_id>"` for custom categories (populated object)
 * - `"system:<category>"` for system categories
 * - `"system:other"` for fallback
 *
 * Safe React `key` prop, suitable for deduplication.
 *
 * @param {object} service
 * @returns {string}
 */
export const getServiceDisplayCategoryKey = (service) => {
  const custom = service?.customCategoryId;
  if (custom && typeof custom === "object" && custom._id) {
    return `custom:${custom._id}`;
  }
  return `system:${service?.category || "other"}`;
};

/**
 * Group services by their display category.
 *
 * Returns an array of { key, label, services[] } preserving
 * first-seen group order from the input array.
 * Deduplicates by getServiceDisplayCategoryKey.
 *
 * Safe for:
 * - null/undefined services
 * - raw string customCategoryId
 * - populated customCategoryId
 * - missing category
 * - system "other"
 *
 * @param {Array<object>} services
 * @returns {Array<{key: string, label: string, services: Array<object>}>}
 */
export const groupServicesByDisplayCategory = (services) => {
  if (!Array.isArray(services)) return [];

  const groupMap = new Map();
  const order = [];

  for (const service of services) {
    if (!service) continue;
    const key = getServiceDisplayCategoryKey(service);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      order.push(key);
    }
    groupMap.get(key).push(service);
  }

  return order.map((key) => ({
    key,
    label: getServiceDisplayCategory(groupMap.get(key)[0]),
    services: groupMap.get(key),
  }));
};
