export const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatCurrency = (amount, currency = "AMD") =>
  `${Number(amount || 0).toLocaleString()} ${currency}`;

export const getStatusBadgeClass = (isExpired, status) => {
  if (isExpired || status === "expired") return "bg-red-50 text-red-700";
  if (status === "past_due") return "bg-amber-50 text-amber-700";
  if (status === "active" || status === "trialing")
    return "bg-emerald-50 text-emerald-700";
  return "bg-neutral-100 text-neutral-700";
};

export const getPaymentStatusLabel = (payment) => {
  if (!payment) return null;
  const status = payment.status || "unknown";
  if (status === "paid" || status === "confirmed") return "Paid";
  if (status === "pending") return "Pending — not paid";
  if (status === "requires_action") return "Requires action";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  return status.replace(/_/g, " ");
};

export const getPaymentActionLabel = (payment) => {
  if (payment?.action === "update_seats") return "Seat update";
  if (payment?.action === "renew") return "Renewal";
  if (payment?.source === "payment_record") return "Paid record";
  return "Subscription";
};

export const getSubscriptionStatusLabel = (subscription) => {
  if (!subscription) return "No subscription";
  if (subscription.isExpired || subscription.status === "expired") return "Expired";
  if (subscription.status === "active") return "Active";
  if (subscription.status === "trialing") return "Trial";
  if (subscription.status === "cancelled") return "Cancelled";
  if (subscription.status === "past_due") return "Past due";
  return subscription.status || "—";
};

export const getProviderLabel = (provider) => {
  if (!provider || provider === "manual") return "Manual";
  if (provider === "disabled") return "Disabled";
  return provider;
};