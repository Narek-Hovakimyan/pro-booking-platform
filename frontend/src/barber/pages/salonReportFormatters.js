const getIdString = (value) => {
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

export const formatCurrency = (amount, currency = "AMD") =>
  `${Number(amount || 0).toLocaleString()} ${currency}`;

export const formatPaymentLabel = (staff) => {
  if (staff.paymentType === "commission") {
    const staffPercent = staff.commissionStaffPercent;
    const salonPercent = staff.commissionSalonPercent;

    if (
      staffPercent !== null &&
      staffPercent !== undefined &&
      salonPercent !== null &&
      salonPercent !== undefined
    ) {
      return `Commission ${staffPercent}/${salonPercent}`;
    }

    return "Commission";
  }

  if (staff.paymentType === "fixed") {
    return "Fixed — prorated estimate";
  }

  return "Not configured";
};

export const formatFixedPaymentSub = (staff) => {
  if (
    staff.paymentType !== "fixed" ||
    staff.fixedAmount === null ||
    staff.fixedAmount === undefined
  ) {
    return "";
  }

  const period = staff.fixedPeriod ? ` / ${staff.fixedPeriod}` : "";
  return `${formatCurrency(staff.fixedAmount)}${period}`;
};

export const getTodayString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const get30DaysAgoString = () => {
  const past = new Date();
  past.setDate(past.getDate() - 30);
  const y = past.getFullYear();
  const m = String(past.getMonth() + 1).padStart(2, "0");
  const d = String(past.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
