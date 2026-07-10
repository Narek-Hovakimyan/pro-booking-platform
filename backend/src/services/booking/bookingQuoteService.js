import Service from "../../models/Service.js";
import {
  barberHasPaidAccessForSalon,
  barberHasPaidSeatAccessForSalon,
} from "../subscriptionService.js";
import { buildBookingPricing } from "./bookingPricingService.js";
import { resolveBookingSalon } from "./bookingControllerHelpers.js";

export const executeBookingPriceQuote = async ({ body, user }) => {
  const { barberId, serviceId } = body || {};
  const clientId = user?._id || user?.id;
  const rawVoucherCode =
    body?.promotionCode || body?.voucherCode || body?.voucher_code;

  if (user?.role !== "client" || !clientId) {
    return {
      status: 403,
      body: { message: "Only clients can request booking price quotes" },
    };
  }

  if (!barberId || !serviceId) {
    return {
      status: 400,
      body: { message: "barberId and serviceId are required" },
    };
  }

  const salonResolution = await resolveBookingSalon({
    barberId,
    salonId: body.salonId,
  });

  if (salonResolution.message) {
    return { status: 400, body: { message: salonResolution.message } };
  }

  const hasExplicitSalonContext = Boolean(body.salonId);
  const barberPaidAccess = hasExplicitSalonContext
    ? await barberHasPaidSeatAccessForSalon(barberId, salonResolution.salonId)
    : await barberHasPaidAccessForSalon(barberId, salonResolution.salonId);
  if (!barberPaidAccess) {
    return {
      status: 403,
      body: {
        code: "BARBER_UNAVAILABLE",
        message: "This specialist is not currently accepting bookings.",
      },
    };
  }

  const service = await Service.findOne({ _id: serviceId, barberId, active: true });

  if (!service) {
    return {
      status: 400,
      body: { message: "Service is not available for this barber" },
    };
  }

  const pricing = await buildBookingPricing({
    barber: salonResolution.barber,
    barberId,
    clientId,
    service,
    serviceId,
    salonId: salonResolution.salonId,
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
