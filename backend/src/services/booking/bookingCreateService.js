import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import { calculateDeposit } from "../../controllers/depositSettingsController.js";
import { createNotification } from "../../controllers/notificationController.js";
import {
  barberHasPaidAccessForSalon,
  barberHasPaidSeatAccessForSalon,
} from "../subscriptionService.js";
import {
  buildBookingPricing,
  rollbackVoucherClaim,
  recordVoucherRedemption,
} from "./bookingPricingService.js";
import {
  parseConsultationAndConsent,
  buildBookingCreatePayload,
} from "./bookingCreatePayloadService.js";
import {
  buildSafePaymentMetadata,
  createBookingDepositPaymentAttempt,
} from "../payment/paymentAttemptService.js";
import { formatBookedMessage } from "../../utils/bookingUtils.js";
import { getBookingNotificationData } from "../../utils/bookingNotificationData.js";
import {
  getBookingCreationLockKey,
  validateBookingSlot,
  withBookingCreationLock,
} from "../../utils/bookingSlotValidation.js";
import { emitBookingUpdated } from "./bookingSideEffectsService.js";
import {
  getClientName,
} from "./bookingControllerHelpers.js";
import {
  normalizeScopedBookingReadinessIds,
  resolveScopedBookingReadiness,
} from "./bookingReadinessService.js";

export const createBookingService = async ({
  body,
  user,
  referenceImages,
  cleanupReferenceImagesOnError,
}) => {
  const cleanup = cleanupReferenceImagesOnError;
  const {
    barberId: requestedBarberId,
    clientId,
    serviceId: requestedServiceId,
    dayKey,
    bookingDate,
    time,
    createdBy = "client",
  } = body;
  const isManualBooking = createdBy === "barber";
  const clientName = (body.clientName || "").trim();
  const clientPhone = (body.clientPhone || body.phone || "").trim();
  const status = isManualBooking ? "accepted" : "pending";

  // ── Consultation / Consent ──
  // JSON-stringified values arrive from multipart/FormData (when referenceImages included)
  let consultation, consent;
  try {
    const parsed = parseConsultationAndConsent(body);
    consultation = parsed.consultation;
    consent = parsed.consent;
  } catch (parseError) {
    cleanup();
    return {
      status: parseError.statusCode || 400,
      body: { message: parseError.message },
    };
  }

  if (!requestedBarberId || !requestedServiceId || (!isManualBooking && !clientId)) {
    cleanup();
    return {
      status: 400,
      body: { message: "Select service first" },
    };
  }

  if (!requestedBarberId || !bookingDate || !time) {
    cleanup();
    return {
      status: 400,
      body: { message: "barberId, bookingDate, and time are required" },
    };
  }

  if (isManualBooking && !clientName) {
    cleanup();
    return { status: 400, body: { message: "Client name is required" } };
  }

  if (
    !isManualBooking &&
    (user?.role !== "client" || String(user._id) !== String(clientId))
  ) {
    cleanup();
    return {
      status: 403,
      body: { message: "You can create bookings only for yourself" },
    };
  }

  if (
    isManualBooking &&
    (user?.role !== "barber" || String(user.id) !== String(requestedBarberId))
  ) {
    cleanup();
    return {
      status: 403,
      body: { message: "You can create bookings only for your own barber calendar" },
    };
  }

  const normalizedIds = normalizeScopedBookingReadinessIds({
    barberId: requestedBarberId,
    serviceId: requestedServiceId,
    salonId: body.salonId,
  });
  if (normalizedIds.body) {
    cleanup();
    return normalizedIds;
  }
  const { barberId, serviceId, salonId } = normalizedIds;

  // Block booking creation for unpaid barbers in the selected salon context.
  const hasExplicitSalonContext = salonId !== null;
  const barberPaidAccess = hasExplicitSalonContext
    ? await barberHasPaidSeatAccessForSalon(barberId, salonId)
    : await barberHasPaidAccessForSalon(barberId, null);
  if (!barberPaidAccess) {
    cleanup();
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
    cleanup();
    return bookingReadiness;
  }

  const service = bookingReadiness.service;
  const bookingDuration = Number(service.duration);

  const slotValidation = await validateBookingSlot({
    barberId,
    salonId: bookingReadiness.salonId,
    barber: bookingReadiness.barber,
    schedule: bookingReadiness.schedule,
    requireResolvedSchedule: true,
    bookingDate,
    dayKey,
    time,
    duration: bookingDuration,
  });

  if (slotValidation.message) {
    cleanup();
    return {
      status: 400,
      body: { message: slotValidation.message },
    };
  }

  const lockKey = getBookingCreationLockKey({ barberId, bookingDate });
  const createResult = await withBookingCreationLock(lockKey, async () => {
    const latestSlotValidation = await validateBookingSlot({
      barberId,
      salonId: bookingReadiness.salonId,
      barber: bookingReadiness.barber,
      schedule: bookingReadiness.schedule,
      requireResolvedSchedule: true,
      bookingDate,
      dayKey,
      time,
      duration: bookingDuration,
    });

    if (latestSlotValidation.message) {
      return { message: latestSlotValidation.message };
    }

    // ── Voucher claim ──
    const rawVoucherCode =
      body.promotionCode || body.voucherCode || body.voucher_code;
    let pricing;
    try {
      pricing = await buildBookingPricing({
        barber: bookingReadiness.barber,
        barberId,
        clientId: isManualBooking ? null : clientId,
        service,
        serviceId,
        salonId: bookingReadiness.salonId,
        voucherCode: rawVoucherCode,
        claimVoucher: Boolean(rawVoucherCode),
      });
    } catch (pricingError) {
      return { message: pricingError.message, cleanup: true };
    }
    const voucherClaim = pricing.voucherClaim;
    const loyaltyDiscount = pricing.loyaltyDiscount;
    const bookingPrice = pricing.serviceDiscountedPrice;
    const effectivePrice = pricing.finalPrice;

    // ── Deposit calculation ──
    // Gracefully fall back to no deposit if BarberProfile query fails (e.g. test isolation)
    let depositSettings = { enabled: false };
    try {
      const barberProfile = await BarberProfile.findOne({ barberId }).lean();
      if (barberProfile?.depositSettings) {
        depositSettings = barberProfile.depositSettings;
      }
    } catch {
      // BarberProfile not available — deposit not required
    }
    const { depositRequired, depositAmount } = calculateDeposit(depositSettings, effectivePrice);
    const depositStatus = depositRequired ? "pending" : "not_required";

    let booking;
    try {
      const payload = buildBookingCreatePayload({
        barberId,
        serviceId,
        depositRequired,
        depositAmount,
        depositStatus,
        depositSettings,
        clientId,
        clientName: isManualBooking ? clientName : body.clientName,
        clientPhone,
        phone: body.phone,
        createdBy,
        isManualBooking,
        note: body.note,
        referenceImages,
        salonId: bookingReadiness.salonId,
        bookingDate,
        time,
        dayKey: latestSlotValidation.effectiveDayKey,
        serviceName: service.name,
        duration: bookingDuration,
        price: effectivePrice,
        status,
        consultation,
        consent,
        loyaltyDiscount,
        bookingPrice,
        voucherClaim,
        rawVoucherCode,
        pricing,
      });
      booking = await Booking.create(payload);
    } catch (createErr) {
      // If voucher was claimed but Booking.create failed, roll back the claim
      if (voucherClaim) {
        await rollbackVoucherClaim(voucherClaim.voucher._id).catch(() => {});
      }
      throw createErr; // rethrow so outer catch handles it
    }

    // Record redemption after successful booking creation
    if (voucherClaim) {
      await recordVoucherRedemption(voucherClaim.voucher._id, booking._id);
    }

    let payment = null;
    if (booking.depositRequired) {
      try {
        payment = await createBookingDepositPaymentAttempt({
          booking,
          createdBy: user?._id,
        });
      } catch (paymentError) {
        payment = buildSafePaymentMetadata({
          providerName: "manual",
          message:
            paymentError.message ||
            "Deposit is required, but online payment is not enabled yet.",
        });
      }
    }

    return { booking, payment };
  });

  if (createResult.message) {
    // Lock-level failure — cleanup uploaded files
    cleanup();
    return {
      status: 400,
      body: { message: createResult.message },
    };
  }

  const { booking, payment } = createResult;
  const notificationClientName = await getClientName(booking, user);

  if (!isManualBooking) {
    await createNotification({
      userId: barberId,
      type: "booking_created",
      message: formatBookedMessage(notificationClientName, booking),
      data: getBookingNotificationData(booking),
    });
  }

  emitBookingUpdated(booking, "created");

  return { status: 201, booking, payment };
};
