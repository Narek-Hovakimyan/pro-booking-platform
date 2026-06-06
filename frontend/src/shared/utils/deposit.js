export const calculateDepositEstimate = (depositSettings, finalPrice) => {
  const safeFinalPrice = Number(finalPrice);

  if (
    !depositSettings?.enabled ||
    !Number.isFinite(safeFinalPrice) ||
    safeFinalPrice <= 0
  ) {
    return {
      depositRequired: false,
      depositAmount: 0,
      remainingDue: Math.max(0, Number.isFinite(safeFinalPrice) ? safeFinalPrice : 0),
    };
  }

  const minimumBookingPrice =
    depositSettings.minimumBookingPrice === null ||
    depositSettings.minimumBookingPrice === undefined ||
    depositSettings.minimumBookingPrice === ""
      ? null
      : Number(depositSettings.minimumBookingPrice);

  if (
    Number.isFinite(minimumBookingPrice) &&
    safeFinalPrice < minimumBookingPrice
  ) {
    return {
      depositRequired: false,
      depositAmount: 0,
      remainingDue: safeFinalPrice,
    };
  }

  const value = Number(depositSettings.value);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      depositRequired: false,
      depositAmount: 0,
      remainingDue: safeFinalPrice,
    };
  }

  const rawDeposit =
    depositSettings.mode === "fixed"
      ? value
      : Math.round((safeFinalPrice * Math.min(value, 100)) / 100);
  const depositAmount = Math.min(Math.max(0, rawDeposit), safeFinalPrice);

  return {
    depositRequired: depositAmount > 0,
    depositAmount,
    remainingDue: Math.max(0, safeFinalPrice - depositAmount),
  };
};
