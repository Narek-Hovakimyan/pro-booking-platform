/**
 * Parse consultation and consent from booking create request body.
 * Handles plain objects and JSON-stringified FormData values.
 *
 * @param {Object} body - req.body
 * @returns {Object} { consultation, consent } — both validated objects
 * @throws {Error} with statusCode 400 if invalid
 */
export const parseConsultationAndConsent = (body) => {
  const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  let consultation = body.consultation || {};
  let consent = body.consent || {};

  try {
    if (typeof consultation === "string") consultation = JSON.parse(consultation);
  } catch {
    const error = new Error("Invalid consultation JSON");
    error.statusCode = 400;
    throw error;
  }
  if (!isPlainObject(consultation)) {
    const error = new Error("Invalid consultation JSON");
    error.statusCode = 400;
    throw error;
  }

  try {
    if (typeof consent === "string") consent = JSON.parse(consent);
  } catch {
    const error = new Error("Invalid consent JSON");
    error.statusCode = 400;
    throw error;
  }
  if (!isPlainObject(consent)) {
    const error = new Error("Invalid consent JSON");
    error.statusCode = 400;
    throw error;
  }

  if (consent.accepted === true) {
    if (!consent.textVersion || !consent.textVersion.trim()) {
      const error = new Error("Consent requires a non-empty textVersion");
      error.statusCode = 400;
      throw error;
    }
    consent.acceptedAt = new Date(); // server-authoritative timestamp
  } else {
    consent.accepted = false;
    consent.acceptedAt = null;
  }

  return { consultation, consent };
};

/**
 * Build the Booking.create payload object.
 * Pure data assembly function — no DB calls, no side effects.
 *
 * All sensitive fields are set server-side (price, status, duration, serviceName,
 * salonId, deposit snapshot, consultation/consent timestamps, referenceImages).
 *
 * @param {Object} params
 * @returns {Object} Payload for Booking.create(...)
 */
export const buildBookingCreatePayload = ({
  barberId,
  serviceId,
  depositRequired,
  depositAmount,
  depositStatus,
  depositSettings,
  clientId,
  clientName,
  clientPhone,
  phone,
  createdBy,
  isManualBooking,
  note,
  referenceImages,
  salonId,
  bookingDate,
  time,
  dayKey,
  serviceName,
  duration,
  price,
  status,
  consultation,
  consent,
  loyaltyDiscount,
  bookingPrice,
  voucherClaim,
  rawVoucherCode,
  pricing,
}) => {
  return {
    barberId,
    serviceId,
    depositRequired,
    depositAmount,
    depositStatus,
    depositMode: depositSettings.enabled ? (depositSettings.mode || "percentage") : "",
    depositValue: depositSettings.enabled ? (depositSettings.value || 0) : 0,
    depositPolicyText: depositSettings.enabled ? (depositSettings.noShowPolicyText || "") : "",
    clientId: isManualBooking ? null : clientId,
    clientName: isManualBooking ? clientName : clientName,
    clientPhone,
    phone: isManualBooking ? clientPhone : phone,
    createdBy: isManualBooking ? "barber" : "client",
    note: note || "",
    referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
    salonId,
    bookingDate,
    time,
    dayKey,
    serviceName,
    duration,
    price,
    status,
    consultation,
    consent,
    ...(loyaltyDiscount.applied
      ? {
        originalPrice: bookingPrice,
        finalPrice: loyaltyDiscount.finalPrice,
        discountAmount: loyaltyDiscount.amount,
        loyaltyDiscountApplied: true,
        loyaltyDiscountPercent: loyaltyDiscount.percent,
        loyaltyDiscountAmount: loyaltyDiscount.amount,
        loyaltyEligibleCompletedBookings:
          loyaltyDiscount.eligibleCompletedBookings,
        loyaltyTierIndex: loyaltyDiscount.tierIndex,
        loyaltyRuleSnapshot: loyaltyDiscount.ruleSnapshot,
      }
      : loyaltyDiscount.eligibleCompletedBookings > 0
        ? {
          loyaltyDiscountApplied: false,
          loyaltyDiscountPercent: 0,
          loyaltyDiscountAmount: 0,
          loyaltyEligibleCompletedBookings:
            loyaltyDiscount.eligibleCompletedBookings,
        }
        : {}),
    // Voucher fields (if applicable)
    ...(voucherClaim
      ? {
        voucherId: voucherClaim.voucher._id,
        promotionId: voucherClaim.voucher._id,
        voucherCode: (rawVoucherCode || "").toUpperCase().trim(),
        promotionCode: (rawVoucherCode || "").toUpperCase().trim(),
        voucherDiscount: voucherClaim.voucherDiscount,
        discountAmount: voucherClaim.voucherDiscount,
        originalPrice: bookingPrice,
        finalPrice: voucherClaim.finalPrice,
        loyaltyDiscountApplied: false,
        loyaltyDiscountPercent: 0,
        loyaltyDiscountAmount: 0,
      }
      : {}),
    serviceOriginalPrice: pricing.originalPrice,
    serviceDiscountAmount: pricing.serviceDiscountAmount,
  };
};