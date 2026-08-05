export const emptyPromotionForm = {
  title: "",
  description: "",
  discountType: "fixed",
  discountValue: "",
  applicableServiceIds: [],
  applicableBarberIds: [],
  startDate: "",
  endDate: "",
  maxUses: "1",
  code: "",
};

export function createEmptyPromotionForm() {
  return { ...emptyPromotionForm };
}

export function formatPromotionDate(date) {
  if (!date) return "—";

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "—";

  return parsedDate.toLocaleDateString("en-CA");
}

export function formatPromotionPrice(price) {
  return `${Number(price).toLocaleString()} դր`;
}

export function buildPromotionForm(promotion) {
  return {
    title: promotion.title || "",
    description: promotion.description || "",
    discountType: promotion.discountType || "fixed",
    discountValue: String(promotion.amount ?? ""),
    applicableServiceIds:
      promotion.applicableServiceIds?.map((service) => String(service._id || service)) || [],
    applicableBarberIds:
      promotion.applicableBarberIds?.map((barber) => String(barber._id || barber)) || [],
    startDate: promotion.startDate ? new Date(promotion.startDate).toISOString().slice(0, 10) : "",
    endDate: promotion.expiresAt ? new Date(promotion.expiresAt).toISOString().slice(0, 10) : "",
    maxUses: String(promotion.maxUses ?? "1"),
    code: promotion.code || "",
  };
}

export function validatePromotionForm(form) {
  const title = form.title.trim();
  if (!title) {
    return "Title is required.";
  }

  const discountValue = Number(form.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return "Discount value must be a positive number.";
  }

  if (form.discountType === "percentage" && discountValue > 100) {
    return "Percentage discount cannot exceed 100%.";
  }

  const maxUses = Number(form.maxUses);
  if (!Number.isFinite(maxUses) || maxUses < 1) {
    return "Max uses must be >= 1.";
  }

  return "";
}

export function buildPromotionPayload(form, isEditingPromotion) {
  const payload = {
    title: form.title.trim(),
    description: form.description.trim(),
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    applicableServiceIds: form.applicableServiceIds,
    applicableBarberIds: form.applicableBarberIds,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    maxUses: Number(form.maxUses),
  };

  if (!isEditingPromotion) {
    payload.code = form.code.trim();
  }

  return payload;
}
