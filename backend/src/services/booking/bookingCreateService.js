import mongoose from "mongoose";

import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import { calculateDeposit } from "../../controllers/bookings/depositSettingsController.js";
import { createNotification } from "../../controllers/notifications/notificationController.js";
import {
  barberHasPaidAccessForSalon,
  barberHasPaidSeatAccessForSalon,
} from "../subscriptionService.js";
import {
  buildBookingPricing,
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
import {
  activateBookingReferenceMedia,
  compensateBookingReferenceMediaFailure,
  promoteBookingReferenceMedia,
  stageBookingReferenceMedia,
} from "./bookingReferenceMediaService.js";
import { isMediaStoreError } from "../media/mediaStore.js";
import {
  assertBookingSlotProtectionReady,
  BookingSlotProtectionUnavailableError,
  createBookingSlotHolds,
  isBookingSlotConflictError,
  isBookingSlotProtectionUnavailableError,
} from "./bookingSlotHoldService.js";

const TRANSACTION_CAPABLE_TOPOLOGIES = new Set([
  "ReplicaSetWithPrimary",
  "Sharded",
  "LoadBalanced",
]);

const getLogicalSessionTimeoutMinutes = (description) => {
  if (Number.isInteger(description?.logicalSessionTimeoutMinutes)) {
    return description.logicalSessionTimeoutMinutes;
  }

  if (!description?.servers?.values) return null;

  let timeout = null;
  for (const server of description.servers.values()) {
    if (!Number.isInteger(server?.logicalSessionTimeoutMinutes)) continue;
    timeout =
      timeout == null
        ? server.logicalSessionTimeoutMinutes
        : Math.min(timeout, server.logicalSessionTimeoutMinutes);
  }
  return timeout;
};

const connectionSupportsTransactions = (connection = mongoose.connection) => {
  if (
    connection?.readyState !== 1 ||
    typeof connection?.startSession !== "function"
  ) {
    return false;
  }

  const description = connection?.client?.topology?.description;
  if (!description?.type) return false;
  if (!TRANSACTION_CAPABLE_TOPOLOGIES.has(description.type)) return false;

  return Number.isInteger(getLogicalSessionTimeoutMinutes(description));
};

const bookingCreateHooks = {
  activateBookingReferenceMedia,
  compensateBookingReferenceMediaFailure,
  promoteBookingReferenceMedia,
  stageBookingReferenceMedia,
  supportsTransactions() {
    return connectionSupportsTransactions();
  },
  async startSession() {
    if (!connectionSupportsTransactions()) {
      return null;
    }
    const session = await mongoose.connection.startSession();
    return typeof session?.withTransaction === "function" ? session : null;
  },
};

export const __bookingCreateServiceTestHooks = bookingCreateHooks;

const createBookingTransactionRequiredResponse = () => ({
  status: 503,
  body: {
    message: "Booking slot protection is temporarily unavailable",
  },
});

const createBookingRecord = async ({ payload, session }) => {
  if (!session) {
    return Booking.create(payload);
  }

  if (typeof Booking.findOneAndUpdate === "function" && payload?._id) {
    return Booking.findOneAndUpdate(
      { _id: payload._id },
      { $setOnInsert: payload },
      {
        new: true,
        upsert: true,
        session,
        setDefaultsOnInsert: true,
      }
    );
  }

  const created = await Booking.create([payload], { session });
  return Array.isArray(created) ? created[0] : created;
};

export const createBookingService = async ({
  body,
  user,
  referenceImages,
  referenceUploads = [],
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

  const stageableReferenceUploads = referenceUploads.filter(
    (file) => Boolean(file?.filename || Buffer.isBuffer(file?.buffer))
  );
  const hasNewReferenceMedia = stageableReferenceUploads.length > 0;
  if (hasNewReferenceMedia && !(await bookingCreateHooks.supportsTransactions())) {
    cleanup();
    return createBookingTransactionRequiredResponse();
  }
  let stagedReferenceMedia = [];
  try {
    stagedReferenceMedia = await bookingCreateHooks.stageBookingReferenceMedia({
      files: stageableReferenceUploads,
    });
    cleanup();
  } catch (error) {
    cleanup();
    if (isMediaStoreError(error)) {
      return {
        status: error.status || 503,
        body: { message: error.message || "Could not stage booking reference media" },
      };
    }
    throw error;
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
      await bookingCreateHooks.compensateBookingReferenceMediaFailure({
        media: stagedReferenceMedia,
      }).catch(() => {});
      return {
        status: 400,
        body: { message: latestSlotValidation.message },
      };
    }

    try {
      await assertBookingSlotProtectionReady();
    } catch (error) {
      if (isBookingSlotProtectionUnavailableError(error)) {
        await bookingCreateHooks.compensateBookingReferenceMediaFailure({
          media: stagedReferenceMedia,
        }).catch(() => {});
        return createBookingTransactionRequiredResponse();
      }
      throw error;
    }

    let booking;
    let session = null;
    let transactionEntered = false;
    let voucherClaim = null;
    let promotedReferenceMedia = [];
    const bookingId = new mongoose.Types.ObjectId();
    try {
      session = await bookingCreateHooks.startSession();
      if (!session || typeof session.withTransaction !== "function") {
        throw new BookingSlotProtectionUnavailableError();
      }

      const createInsideMutation = async () => {
        transactionEntered = true;
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
            bookingId,
            session,
          });
        } catch (pricingError) {
          pricingError.bookingPricingError = true;
          throw pricingError;
        }
        voucherClaim = pricing.voucherClaim;
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
        const { depositRequired, depositAmount } = calculateDeposit(
          depositSettings,
          effectivePrice
        );
        const depositStatus = depositRequired ? "pending" : "not_required";

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
        payload._id = bookingId;

        if (hasNewReferenceMedia) {
          promotedReferenceMedia = await bookingCreateHooks.promoteBookingReferenceMedia({
            media: stagedReferenceMedia,
          });
        }

        await createBookingSlotHolds({
          bookingId: payload._id,
          barberId,
          bookingDate,
          time,
          duration: bookingDuration,
          session,
        });
        booking = await createBookingRecord({ payload, session });
        if (hasNewReferenceMedia) {
          await bookingCreateHooks.activateBookingReferenceMedia({
            media: stagedReferenceMedia,
            bookingId: booking._id,
            session,
          });
        }
      };

      await session.withTransaction(createInsideMutation);
    } catch (createErr) {
      await bookingCreateHooks.compensateBookingReferenceMediaFailure({
        media: stagedReferenceMedia,
        promotedMedia: promotedReferenceMedia.length
          ? promotedReferenceMedia
          : createErr?.promotedMedia || [],
        bookingId: booking?._id || bookingId || null,
        error: createErr,
      }).catch(() => {});
      if (isMediaStoreError(createErr)) {
        return {
          status: createErr.status || 503,
          body: { message: createErr.message || "Could not promote booking reference media" },
        };
      }
      if (createErr?.bookingPricingError) {
        return {
          status: 400,
          body: { message: createErr.message },
        };
      }
      if (
        !transactionEntered ||
        createErr?.transactionRequired ||
        isBookingSlotProtectionUnavailableError(createErr)
      ) {
        return createBookingTransactionRequiredResponse();
      }
      if (isBookingSlotConflictError(createErr)) {
        return {
          status: 400,
          body: { message: "This time is already booked" },
        };
      }
      throw createErr;
    } finally {
      await session?.endSession?.().catch(() => {});
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

    return { booking, payment, status: 201 };
  });

  if (createResult?.body) {
    return createResult;
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
