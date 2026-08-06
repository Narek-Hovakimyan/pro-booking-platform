import { getPersonId, getSalonId } from "./salonBillingFormatters";

export const getAttemptId = (attempt) => attempt?.id || attempt?._id || "";

export const getActiveSeatMemberIds = (activeSeats = []) =>
  new Set(activeSeats.map((seat) => getPersonId(seat)));

export const getAssignableMembers = (approvedMembers = [], activeSeats = []) => {
  const activeSeatMemberIds = getActiveSeatMemberIds(activeSeats);
  return approvedMembers.filter(
    (member) => !activeSeatMemberIds.has(getPersonId(member))
  );
};

export const getSelectedSalon = (salons, selectedSalonId) =>
  salons.find((salon) => getSalonId(salon) === selectedSalonId) || null;

export const getSeatUsagePercent = (usedSeatCount, activeCapacity) => {
  if (activeCapacity <= 0) return 0;
  return Math.min(100, Math.round((usedSeatCount / activeCapacity) * 100));
};

export const getBillingValidationError = ({
  salonId,
  seatCount,
  months,
  requireMonths = false,
}) => {
  if (!salonId || !Number.isInteger(seatCount) || seatCount < 1) {
    return "Seat count must be at least 1.";
  }
  if (requireMonths && (!Number.isInteger(months) || months < 1)) {
    return "Months must be at least 1.";
  }
  return "";
};

export const getBillingInputs = ({
  salonId,
  seatCount,
  months,
  requireMonths = false,
  defaultMonths = true,
}) => {
  const normalizedSeatCount = Number(seatCount || 1);
  const normalizedMonths = Number(defaultMonths ? months || 1 : months);
  return {
    seatCount: normalizedSeatCount,
    months: normalizedMonths,
    validationError: getBillingValidationError({
      salonId,
      seatCount: normalizedSeatCount,
      months: normalizedMonths,
      requireMonths,
    }),
  };
};

export const normalizeBillingCount = (value) =>
  Math.max(1, Number(value) || 1);

export const getBillingPurchaseTotals = ({
  pricePerSeat,
  seatCount,
  months,
}) => {
  const purchaseSeatCount = normalizeBillingCount(seatCount);
  const purchaseMonths = normalizeBillingCount(months);
  const purchaseMonthlyTotal = Number(pricePerSeat || 0) * purchaseSeatCount;
  const purchaseTotal = purchaseMonthlyTotal * purchaseMonths;

  return {
    purchaseSeatCount,
    purchaseMonths,
    purchaseMonthlyTotal,
    purchaseTotal,
  };
};
