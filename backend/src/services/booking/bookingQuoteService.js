import {
  barberHasPaidAccessForSalon,
  barberHasPaidSeatAccessForSalon,
} from "../subscriptionService.js";
import { buildBookingPricing } from "./bookingPricingService.js";
import {
  normalizeScopedBookingReadinessIds,
  resolveScopedBookingReadiness,
} from "./bookingReadinessService.js";

export const executeBookingPriceQuote = async ({ body, user }) => {
  const { barberId: requestedBarberId, serviceId: requestedServiceId } = body || {};
  const clientId = user?._id || user?.id;
  const rawVoucherCode =
    body?.promotionCode || body?.voucherCode || body?.voucher_code;

  if (user?.role !== "client" || !clientId) {
    return {
      status: 403,
      body: { message: "Only clients can request booking price quotes" },
    };
  }

  if (!requestedBarberId || !requestedServiceId) {
    return {
      status: 400,
      body: { message: "barberId and serviceId are required" },
    };
  }

  const normalizedIds = normalizeScopedBookingReadinessIds({
    barberId: requestedBarberId,
    serviceId: requestedServiceId,
    salonId: body.salonId,
  });
  if (normalizedIds.body) return normalizedIds;

  const { barberId, serviceId, salonId } = normalizedIds;
  const hasExplicitSalonContext = salonId !== null;
  const barberPaidAccess = hasExplicitSalonContext
    ? await barberHasPaidSeatAccessForSalon(barberId, salonId)
    : await barberHasPaidAccessForSalon(barberId, null);
  if (!barberPaidAccess) {
    return {
      status: 403,
      body: {
        code: "BARBER_UNAVAILABLE",
        message: "This specialist is not currently accepting bookings.",
      },
    };
  }

  const bookingReadiness = await resolveScopedBookingReadiness({
    barberId,
    salonId,
    serviceId,
  });

  if (bookingReadiness.body) {
    return bookingReadiness;
  }

  const service = bookingReadiness.service;

  const pricing = await buildBookingPricing({
    barber: bookingReadiness.barber,
    barberId,
    clientId,
    service,
    serviceId,
    salonId: bookingReadiness.salonId,
    voucherCode: rawVoucherCode,
    claimVoucher: false,
  });
  const loyaltyDiscount = pricing.loyaltyDiscount;

  return {
    status: 200,
    body: {
      originalPrice: pricing.originalPrice,
      serviceDiscountAmount: pricing.serviceDiscountAmount,
      serviceDiscountedPrice: pricing.serviceDiscountedPrice,
      voucherDiscountAmount: pricing.voucherDiscountAmount,
      loyaltyDiscountApplied: loyaltyDiscount.applied,
      loyaltyDiscountPercent: loyaltyDiscount.percent,
      loyaltyDiscountAmount: loyaltyDiscount.amount,
      loyaltyEligibleCompletedBookings:
        loyaltyDiscount.eligibleCompletedBookings,
      loyaltyTierIndex: loyaltyDiscount.tierIndex,
      loyaltyRuleSnapshot: loyaltyDiscount.ruleSnapshot,
      finalPrice: pricing.finalPrice,
    },
  };
};
