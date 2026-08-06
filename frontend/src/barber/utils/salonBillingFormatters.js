export const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

export const getSalonList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.salons)) return data.salons;
  return [];
};

export const getSalonId = (salon) => getIdString(salon?.salon || salon);

export const getSalonName = (salon) => {
  const salonData = salon?.salon || salon;
  return salonData?.name || salon?.name || "Salon";
};

export const getPersonName = (person) => {
  const value = person?.barberId || person;
  return value?.name || person?.name || "Specialist";
};

export const getPersonId = (person) => getIdString(person?.barberId || person);

export const formatCurrency = (amount, currency = "AMD") =>
  `${Number(amount || 0).toLocaleString()} ${currency}`;

export const formatDate = (value) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const formatPaymentPeriod = (payment) =>
  `${formatDate(payment?.periodStart)} - ${formatDate(payment?.periodEnd)}`;

export const getSubscriptionStatusLabel = (status) => {
  if (status === "active") return "Active";
  if (status === "trialing") return "Trial";
  if (status === "expired") return "Expired";
  if (status === "past_due") return "Past due";
  if (status === "cancelled") return "Cancelled";
  return status ? status.replace("_", " ") : "No subscription";
};

export const getStatusBadgeClass = (subscription) => {
  if (subscription?.isExpired || subscription?.status === "expired") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (subscription?.status === "past_due") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (subscription?.status === "trialing") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (subscription?.status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-neutral-200 bg-neutral-100 text-neutral-700";
};

export const getStatusPanelClass = (subscription) => {
  if (subscription?.isExpired || subscription?.status === "expired") {
    return "border-rose-100 bg-rose-50/80 text-rose-800";
  }

  if (subscription?.status === "past_due") {
    return "border-amber-100 bg-amber-50/80 text-amber-800";
  }

  if (subscription?.status === "trialing") {
    return "border-violet-100 bg-violet-50/80 text-violet-800";
  }

  if (subscription?.status === "active") {
    return "border-emerald-100 bg-emerald-50/80 text-emerald-800";
  }

  return "border-neutral-200 bg-white text-neutral-700";
};

export const formatStatusText = (status) =>
  status ? status.replace("_", " ") : "Pending";

export const normalizeError = (error, fallback) =>
  error?.response?.data?.message || fallback;
