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
