const paymentTypes = new Set(["none", "commission", "fixed"]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toPlainObject = (value) => value?.toObject?.() || value || {};

const numberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export const getSafeStaffPayment = (staffPayment) => {
  const payment = toPlainObject(staffPayment);
  const type = paymentTypes.has(payment.type) ? payment.type : "none";

  return {
    paymentType: type,
    commissionStaffPercent: numberOrNull(payment.commissionStaffPercent),
    commissionSalonPercent: numberOrNull(payment.commissionSalonPercent),
    fixedAmount: numberOrNull(payment.fixedAmount),
    fixedPeriod: payment.fixedPeriod || "",
  };
};

const parseReportDate = (value) => new Date(`${value}T00:00:00.000Z`);

const getInclusiveDayCount = (from, to) => {
  const start = parseReportDate(from);
  const end = parseReportDate(to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
};

const getDaysInMonth = (year, monthIndex) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const getMonthlyProrationUnits = (from, to) => {
  const start = parseReportDate(from);
  const end = parseReportDate(to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let totalUnits = 0;
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  );

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month, daysInMonth));
    const overlapStart = start > monthStart ? start : monthStart;
    const overlapEnd = end < monthEnd ? end : monthEnd;

    if (overlapStart <= overlapEnd) {
      totalUnits += getInclusiveDayCount(
        overlapStart.toISOString().slice(0, 10),
        overlapEnd.toISOString().slice(0, 10)
      ) / daysInMonth;
    }

    cursor = new Date(Date.UTC(year, month + 1, 1));
  }

  return totalUnits;
};

const getFixedProration = (
  safePayment,
  { from, to, completedBookingDates = [] } = {}
) => {
  const fixedAmount = safePayment.fixedAmount ?? 0;
  const uniqueCompletedBookingDates = [
    ...new Set(completedBookingDates.filter(Boolean)),
  ];

  if (uniqueCompletedBookingDates.length === 0 || fixedAmount <= 0) {
    return { staffEarnings: 0, fixedProratedDays: 0, fixedProrationUnits: 0 };
  }

  if (safePayment.fixedPeriod === "daily") {
    const fixedProratedDays = uniqueCompletedBookingDates.length;
    return {
      staffEarnings: fixedAmount * fixedProratedDays,
      fixedProratedDays,
      fixedProrationUnits: fixedProratedDays,
    };
  }

  const fixedProratedDays = getInclusiveDayCount(from, to);
  const fixedProrationUnits =
    safePayment.fixedPeriod === "weekly"
      ? fixedProratedDays / 7
      : safePayment.fixedPeriod === "monthly"
        ? getMonthlyProrationUnits(from, to)
        : 0;

  return {
    staffEarnings: fixedAmount * fixedProrationUnits,
    fixedProratedDays,
    fixedProrationUnits,
  };
};

export const getStaffEarningsBreakdown = (
  grossRevenue,
  staffPayment,
  options = {}
) => {
  const safePayment = getSafeStaffPayment(staffPayment);

  if (safePayment.paymentType === "commission") {
    const staffPercent = safePayment.commissionStaffPercent ?? 0;
    const salonPercent = safePayment.commissionSalonPercent ?? 0;

    return {
      grossRevenue,
      staffEarnings: (grossRevenue * staffPercent) / 100,
      salonEarnings: (grossRevenue * salonPercent) / 100,
      ...safePayment,
      fixedAmount: null,
      fixedPeriod: "",
      fixedProratedDays: null,
      fixedProrationUnits: null,
      earningsCalculationStatus: "calculated",
    };
  }

  if (safePayment.paymentType === "fixed") {
    const fixedProration = getFixedProration(safePayment, options);

    return {
      grossRevenue,
      staffEarnings: fixedProration.staffEarnings,
      salonEarnings: Math.max(0, grossRevenue - fixedProration.staffEarnings),
      ...safePayment,
      commissionStaffPercent: null,
      commissionSalonPercent: null,
      ...fixedProration,
      earningsCalculationStatus: "calculated_prorated",
    };
  }

  return {
    grossRevenue,
    staffEarnings: 0,
    salonEarnings: grossRevenue,
    ...safePayment,
    commissionStaffPercent: null,
    commissionSalonPercent: null,
    fixedAmount: null,
    fixedPeriod: "",
    fixedProratedDays: null,
    fixedProrationUnits: null,
    earningsCalculationStatus: "not_configured",
  };
};

const revenueAmountExpression = {
  $cond: [
    {
      $and: [
        { $ne: ["$finalPrice", null] },
        {
          $or: [
            { $ne: ["$promotionId", null] },
            { $ne: ["$voucherId", null] },
            { $ne: ["$promotionCode", ""] },
            { $ne: ["$voucherCode", ""] },
            { $gt: [{ $ifNull: [{ $toDouble: "$discountAmount" }, 0] }, 0] },
            { $gt: [{ $ifNull: [{ $toDouble: "$voucherDiscount" }, 0] }, 0] },
          ],
        },
      ],
    },
    { $ifNull: [{ $toDouble: "$finalPrice" }, 0] },
    { $ifNull: [{ $toDouble: "$price" }, 0] },
  ],
};

export const getBookingRevenueAmount = (booking) => {
  const finalPrice = Number(booking?.finalPrice);
  const hasDiscountMarker = Boolean(
    booking?.promotionId ||
      booking?.voucherId ||
      booking?.promotionCode ||
      booking?.voucherCode ||
      Number(booking?.discountAmount || booking?.voucherDiscount || 0) > 0
  );
  if (
    hasDiscountMarker &&
    booking?.finalPrice !== undefined &&
    booking?.finalPrice !== null &&
    Number.isFinite(finalPrice)
  ) {
    return finalPrice;
  }

  const price = Number(booking?.price || booking?.totalPrice || 0);
  return Number.isFinite(price) ? price : 0;
};

export { revenueAmountExpression };
