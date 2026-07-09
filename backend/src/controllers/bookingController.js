import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import {
  allowedBookingDelayMinutes,
  minutesToTime,
  attemptsDateTimeChange,
  sendControllerError,
  resolveBookingSalon,
  getClientName,
} from "../services/booking/bookingControllerHelpers.js";
import {
  collectReferenceImagePaths,
  cleanupReferenceImages,
} from "../services/booking/bookingReferenceImageHelpers.js";
import { updateBookingTreatmentRecord } from "../services/booking/bookingTreatmentRecordService.js";
import { executeBookingPriceQuote } from "../services/booking/bookingQuoteService.js";
import { resolveReferenceImageRequest } from "../services/booking/bookingReferenceImageService.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import LoyaltyProgram from "../models/LoyaltyProgram.js";
import LoyaltyProgress from "../models/LoyaltyProgress.js";
import Service from "../models/Service.js";
import { calculateDeposit } from "./depositSettingsController.js";

import {
  emitBookingUpdated,
  notifyUsersForBookingStatusChange,
  notifyWaitlistForReleasedBookingSlot,
} from "../services/bookingSideEffectsService.js";
import { createNotification } from "./notificationController.js";
import { createCrudController } from "./crudController.js";
import {
  barberHasPaidAccessForSalon,
  barberHasPaidSeatAccessForSalon,
} from "../services/subscriptionService.js";
import {
  claimVoucherForBooking,
  buildBookingPricing,
  rollbackVoucherClaim,
  recordVoucherRedemption,
  restoreVoucherOnCancel,
} from "../services/bookingPricingService.js";
import {
  parseConsultationAndConsent,
  buildBookingCreatePayload,
} from "../services/bookingCreatePayloadService.js";
import { buildBookingStatusUpdate } from "../services/bookingStatusService.js";
import {
  buildSafePaymentMetadata,
  createBookingDepositPaymentAttempt,
} from "../services/payment/paymentAttemptService.js";
import {
  getBookingDateTime,
  getDayKeyFromDate,
  isDateKey,
  timeToMinutes,
} from "../utils/bookingDateTime.js";
import {
  blockingBookingStatuses,
  defaultPersonalSchedule,
  defaultWeeklySchedule,
  defaultWorkingDaySchedule,
  formatBookedMessage,
  getDayScheduleFromDefaultSchedule,
  maxCancellationReasonLength,
  maxRejectionReasonLength,
  normalizeBookingStatus,
  serializeBookingForResponse,
  slotOverlaps,
} from "../utils/bookingUtils.js";
import { getBookingNotificationData } from "../utils/bookingNotificationData.js";
import {
  getBookingCreationLockKey,
  validateBookingSlot,
  withBookingCreationLock,
} from "../utils/bookingSlotValidation.js";

export const bookingController = createCrudController(Booking, "Booking");

export const __bookingTestHooks = {
  allowedBookingDelayMinutes,
  blockingBookingStatuses,
  normalizeBookingStatus,
  slotOverlaps,
  validateBookingSlot,
  withBookingCreationLock,
  claimVoucherForBooking,
  rollbackVoucherClaim,
  recordVoucherRedemption,
  restoreVoucherOnCancel,
};

export const createBooking = async (req, res) => {
  // Capture reference image paths before any validation returns
  const referenceImages = collectReferenceImagePaths(req);

  const cleanup = () => cleanupReferenceImages(referenceImages);

  try {
    const {
      barberId,
      clientId,
      serviceId,
      dayKey,
      bookingDate,
      time,
      createdBy = "client",
    } = req.body;
    const isManualBooking = createdBy === "barber";
    const clientName = (req.body.clientName || "").trim();
    const clientPhone = (req.body.clientPhone || req.body.phone || "").trim();
    const status = isManualBooking ? "accepted" : "pending";

    // ── Consultation / Consent ──
    // JSON-stringified values arrive from multipart/FormData (when referenceImages included)
    let consultation, consent;
    try {
      const parsed = parseConsultationAndConsent(req.body);
      consultation = parsed.consultation;
      consent = parsed.consent;
    } catch (parseError) {
      cleanup();
      return res.status(parseError.statusCode || 400).json({
        message: parseError.message,
      });
    }

    if (!barberId || !serviceId || (!isManualBooking && !clientId)) {
      cleanup();
      return res.status(400).json({
        message: "Select service first",
      });
    }

    if (!barberId || !bookingDate || !time) {
      cleanup();
      return res.status(400).json({
        message: "barberId, bookingDate, and time are required",
      });
    }

    if (isManualBooking && !clientName) {
      cleanup();
      return res.status(400).json({ message: "Client name is required" });
    }

    if (
      !isManualBooking &&
      (req.user?.role !== "client" || String(req.user._id) !== String(clientId))
    ) {
      cleanup();
      return res.status(403).json({
        message: "You can create bookings only for yourself",
      });
    }

    if (
      isManualBooking &&
      (req.user?.role !== "barber" || String(req.user.id) !== String(barberId))
    ) {
      cleanup();
      return res.status(403).json({
        message: "You can create bookings only for your own barber calendar",
      });
    }

    const salonResolution = await resolveBookingSalon({
      barberId,
      salonId: req.body.salonId,
    });

    if (salonResolution.message) {
      cleanup();
      return res.status(400).json({
        message: salonResolution.message,
      });
    }

    // Block booking creation for unpaid barbers in the selected salon context.
    const hasExplicitSalonContext = Boolean(req.body.salonId);
    const barberPaidAccess = hasExplicitSalonContext
      ? await barberHasPaidSeatAccessForSalon(barberId, salonResolution.salonId)
      : await barberHasPaidAccessForSalon(barberId, salonResolution.salonId);
    if (!barberPaidAccess) {
      cleanup();
      return res.status(403).json({
        code: "BARBER_UNAVAILABLE",
        message: "This specialist is not currently accepting bookings.",
      });
    }

    const service = await Service.findOne({ _id: serviceId, barberId, active: true });

    if (!service) {
      cleanup();
      return res.status(400).json({
        message: "Service is not available for this barber",
      });
    }

    const bookingDuration = Number(service.duration);

    const slotValidation = await validateBookingSlot({
      barberId,
      salonId: salonResolution.salonId,
      barber: salonResolution.barber,
      bookingDate,
      dayKey,
      time,
      duration: bookingDuration,
    });

    if (slotValidation.message) {
      cleanup();
      return res.status(400).json({
        message: slotValidation.message,
      });
    }

    const lockKey = getBookingCreationLockKey({ barberId, bookingDate });
    const createResult = await withBookingCreationLock(lockKey, async () => {
      const latestSlotValidation = await validateBookingSlot({
        barberId,
        salonId: salonResolution.salonId,
        barber: salonResolution.barber,
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
        req.body.promotionCode || req.body.voucherCode || req.body.voucher_code;
      let pricing;
      try {
        pricing = await buildBookingPricing({
          barber: salonResolution.barber,
          barberId,
          clientId: isManualBooking ? null : clientId,
          service,
          serviceId,
          salonId: salonResolution.salonId,
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
          clientName: isManualBooking ? clientName : req.body.clientName,
          clientPhone,
          phone: req.body.phone,
          createdBy,
          isManualBooking,
          note: req.body.note,
          referenceImages,
          salonId: salonResolution.salonId,
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
            createdBy: req.user?._id,
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
      return res.status(400).json({
        message: createResult.message,
      });
    }

    const { booking, payment } = createResult;
    const notificationClientName = await getClientName(booking, req.user);

    if (!isManualBooking) {
      await createNotification({
        userId: barberId,
        type: "booking_created",
        message: formatBookedMessage(notificationClientName, booking),
        data: getBookingNotificationData(booking),
      });
    }

    emitBookingUpdated(booking, "created");

    const responseBooking = serializeBookingForResponse(booking);
    if (payment) {
      responseBooking.payment = payment;
      responseBooking.depositPayment = payment;
    }

    return res.status(201).json(responseBooking);
  } catch (error) {
    // DB or unexpected failure — cleanup uploaded files
    cleanup();
    return sendControllerError(res, error, "Could not create booking");
  }
};

export const quoteBookingPrice = async (req, res) => {
  try {
    const result = await executeBookingPriceQuote({
      body: req.body,
      user: req.user,
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return sendControllerError(res, error, "Could not quote booking price");
  }
};

export const updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const previousStatus = booking.status;
    const requestedStatus = req.body.status;
    const isAccepting = requestedStatus === "accepted";
    const isCompleting = requestedStatus === "completed";
    const isRejecting = requestedStatus === "rejected";
    const isCancelling = requestedStatus === "cancelled";
    const isRescheduling =
      req.body.time !== undefined ||
      req.body.dayKey !== undefined ||
      req.body.bookingDate !== undefined;
    const hasStatusAction =
      isAccepting || isCompleting || isRejecting || isCancelling;
    const isAssignedBarber =
      req.user?.role === "barber" &&
      String(req.user._id) === String(booking.barberId);
    const isBookingClient =
      req.user?.role === "client" &&
      String(req.user._id) === String(booking.clientId);
    const isManualBookingCancellation = !booking.clientId && isAssignedBarber;
    const normalizedBookingStatus = normalizeBookingStatus(booking.status);
    const safeUpdates = {};
    let rescheduleSlotRequest = null;

    if (
      isBookingClient &&
      (normalizedBookingStatus === "pending" ||
        normalizedBookingStatus === "accepted") &&
      attemptsDateTimeChange(req.body, booking)
    ) {
      return res.status(400).json({
        message: "Bookings must be rescheduled by request.",
      });
    }

    if (requestedStatus && !hasStatusAction) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    if (isRescheduling && hasStatusAction) {
      return res.status(400).json({
        message: "Update booking status and time separately",
      });
    }

    if (isAccepting) {
      if (!isAssignedBarber) {
        return res.status(403).json({
          message: "Only barber can accept booking",
        });
      }

      if (booking.status !== "pending") {
        return res.status(400).json({
          message: "Only pending bookings can be accepted",
        });
      }

      const hasPaidAccess = await barberHasPaidAccessForSalon(
        booking.barberId,
        booking.salonId || null
      );

      if (!hasPaidAccess) {
        return res.status(403).json({
          code: "BARBER_UNAVAILABLE",
          message: "This specialist is not currently accepting bookings.",
        });
      }

      safeUpdates.status = "accepted";
    }

    if (isCompleting) {
      if (!isAssignedBarber) {
        return res.status(403).json({
          message: "Only barber can complete booking",
        });
      }

      if (booking.status !== "accepted") {
        return res.status(400).json({
          message: "Only accepted bookings can be completed",
        });
      }

      safeUpdates.status = "completed";
      safeUpdates.completedAt = new Date();
    }

    if (isRejecting) {
      const rejectionReason = (req.body.rejectionReason || "").trim();

      if (req.user?.role === "client") {
        return res.status(403).json({
          message: "Only barber can reject booking",
        });
      }

      if (!isAssignedBarber) {
        return res.status(403).json({
          message: "Only the assigned barber can reject this booking",
        });
      }

      if (booking.status !== "pending" && booking.status !== "accepted") {
        return res.status(400).json({
          message: "Only pending or accepted bookings can be rejected",
        });
      }

      if (!rejectionReason) {
        return res.status(400).json({
          message: "Please provide a rejection reason",
        });
      }

      if (rejectionReason.length > maxRejectionReasonLength) {
        return res.status(400).json({
          message: `Rejection reason must be ${maxRejectionReasonLength} characters or less`,
        });
      }

      Object.assign(
        safeUpdates,
        buildBookingStatusUpdate("rejected", { reason: rejectionReason, requester: req.user })
      );
    }

    if (isCancelling) {
      const cancelReason = (req.body.cancelReason || "").trim();

      if (!isBookingClient && !isManualBookingCancellation) {
        const message = booking.clientId
          ? "Only client can cancel booking"
          : "Only the assigned barber can cancel booking";
        return res.status(403).json({
          message,
        });
      }

      if (booking.status !== "pending" && booking.status !== "accepted") {
        return res.status(400).json({
          message: "Only pending or accepted bookings can be cancelled",
        });
      }

      if (!cancelReason) {
        return res.status(400).json({
          message: "Please provide a cancellation reason",
        });
      }

      if (cancelReason.length > maxCancellationReasonLength) {
        return res.status(400).json({
          message: `Cancellation reason must be ${maxCancellationReasonLength} characters or less`,
        });
      }

      Object.assign(
        safeUpdates,
        buildBookingStatusUpdate("cancelled", { reason: cancelReason, requester: req.user })
      );
    }

    if (isRescheduling) {
      const isReschedulingClient =
        req.user?.role === "client" &&
        String(req.user._id) === String(booking.clientId);

      if (!isReschedulingClient) {
        return res.status(403).json({
          message: "Only the booking owner can reschedule",
        });
      }

      if (booking.status !== "pending" && booking.status !== "accepted") {
        return res.status(400).json({
          message: "Cannot reschedule a booking that is not pending or accepted",
        });
      }

      const nextTime = req.body.time || booking.time;
      const nextBookingDate =
        req.body.bookingDate !== undefined
          ? req.body.bookingDate
          : booking.bookingDate;
      const nextDayKey =
        getDayKeyFromDate(nextBookingDate) || req.body.dayKey || booking.dayKey;
      const slotValidation = await validateBookingSlot({
        barberId: booking.barberId,
        salonId: booking?.salonId || null,
        bookingDate: nextBookingDate,
        dayKey: nextDayKey,
        time: nextTime,
        duration: booking.duration,
        ignoreBookingId: booking._id,
      });
      rescheduleSlotRequest = {
        barberId: booking.barberId,
        salonId: booking?.salonId || null,
        bookingDate: nextBookingDate,
        dayKey: nextDayKey,
        time: nextTime,
        duration: booking.duration,
        ignoreBookingId: booking._id,
      };

      if (slotValidation.message) {
        return res.status(400).json({
          message: slotValidation.message,
        });
      }

      safeUpdates.dayKey = slotValidation.effectiveDayKey;
      safeUpdates.bookingDate = nextBookingDate;
      safeUpdates.time = nextTime;
      safeUpdates.reminderSentAt = null;
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ message: "No allowed booking updates provided" });
    }

    const applyAndSaveUpdates = async () => {
      if (isRescheduling && rescheduleSlotRequest) {
        const latestSlotValidation = await validateBookingSlot(rescheduleSlotRequest);

        if (latestSlotValidation.message) {
          return { message: latestSlotValidation.message };
        }

        safeUpdates.dayKey = latestSlotValidation.effectiveDayKey;
      }

      Object.assign(booking, safeUpdates);
      if (booking.clientPhone && !booking.phone) {
        booking.phone = booking.clientPhone;
      }
      if (booking.bookingDate) {
        booking.dayKey = getDayKeyFromDate(booking.bookingDate) || booking.dayKey;
      }
      await booking.save();

      return { booking };
    };

    const saveResult =
      isRescheduling && rescheduleSlotRequest
        ? await withBookingCreationLock(
            getBookingCreationLockKey({
              barberId: booking.barberId,
              bookingDate: rescheduleSlotRequest.bookingDate,
            }),
            applyAndSaveUpdates
          )
        : await applyAndSaveUpdates();

    if (saveResult.message) {
      return res.status(400).json({ message: saveResult.message });
    }

    if (safeUpdates.status && safeUpdates.status !== previousStatus) {
      await notifyUsersForBookingStatusChange({
        booking,
        status: safeUpdates.status,
        requester: req.user,
        isBookingClient,
      });

      if (safeUpdates.status === "rejected" || safeUpdates.status === "cancelled") {
        notifyWaitlistForReleasedBookingSlot(booking);
        restoreVoucherOnCancel(booking, previousStatus);
      }

      // ── Review request automation ──
      if (safeUpdates.status === "completed") {
        if (booking.clientId && !booking.reviewed) {
          const existingReview = await Review.exists({ bookingId: booking._id });
          if (!existingReview) {
            const existingNotification = await Notification.findOne({
              userId: booking.clientId,
              type: "review_request",
              "data.bookingId": booking._id,
            });
            if (!existingNotification) {
              await createNotification({
                userId: booking.clientId,
                type: "review_request",
                message: "How was your visit? Leave a review for your specialist.",
                data: {
                  bookingId: booking._id,
                  barberId: booking.barberId,
                },
              });
            }
          }
        }

        // ── Book again retention automation ──
        if (booking.clientId) {
          const existingReminder = await Notification.findOne({
            userId: booking.clientId,
            type: "book_again_reminder",
            "data.bookingId": booking._id,
          });
          if (!existingReminder) {
            await createNotification({
              userId: booking.clientId,
              type: "book_again_reminder",
              message: "Book your next appointment with the same specialist.",
              data: {
                bookingId: booking._id,
                barberId: booking.barberId,
                salonId: booking.salonId || null,
              },
            });
          }
        }

        // ── Loyalty / punch-card automation ──
        if (booking.clientId) {
          const activeProgram = await LoyaltyProgram.findOne({
            ownerType: "barber",
            ownerId: booking.barberId,
            active: true,
          });

          if (activeProgram) {
            let progress = await LoyaltyProgress.findOne({
              programId: activeProgram._id,
              clientId: booking.clientId,
            });

            if (!progress) {
              progress = await LoyaltyProgress.create({
                programId: activeProgram._id,
                clientId: booking.clientId,
                punchBookingIds: [],
                punchCount: 0,
                rewardsEarned: 0,
              });
            }

            // Prevent duplicate punch for same booking
            const alreadyPunched = progress.punchBookingIds.some(
              (id) => String(id) === String(booking._id)
            );

            if (!alreadyPunched) {
              progress.punchBookingIds.push(booking._id);
              progress.punchCount += 1;
              progress.lastPunchAt = new Date();

              // Compute expected rewards (cumulative, never resets)
              const expectedRewards = Math.floor(
                progress.punchCount / activeProgram.requiredVisits
              );

              if (expectedRewards > progress.rewardsEarned) {
                progress.rewardsEarned = expectedRewards;
                await createNotification({
                  userId: booking.clientId,
                  type: "loyalty_reward_earned",
                  message: `You've earned a reward: ${activeProgram.rewardText}`,
                  data: {
                    programId: activeProgram._id,
                    bookingId: booking._id,
                    barberId: booking.barberId,
                    salonId: booking.salonId || null,
                  },
                });
              }

              await progress.save();
            }
          }
        }
      }
    }

    emitBookingUpdated(booking, "updated");

    return res.json(serializeBookingForResponse(booking));
  } catch (error) {
    return sendControllerError(res, error, "Could not update booking");
  }
};

export const delayBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isBookingClient =
      req.user?.role === "client" &&
      String(req.user._id) === String(booking.clientId);

    if (!isBookingClient) {
      return res.status(403).json({ message: "Only the booking owner can delay this booking" });
    }

    if (booking.status !== "accepted") {
      return res.status(400).json({ message: "Only accepted bookings can be delayed" });
    }

    // Policy: one delay per booking
    if (booking.delayMinutesTotal > 0 || booking.delayedAt) {
      return res.status(400).json({ message: "This booking has already been delayed." });
    }

    // Policy: max 20 minutes total delay
    const delayMinutes = req.body?.delayMinutes;

    if (!allowedBookingDelayMinutes.has(delayMinutes)) {
      return res.status(400).json({ message: "delayMinutes must be 10 or 20" });
    }

    // Policy: delay only until appointment start + 5 minute grace window (Armenia time)
    const bookingStart = getBookingDateTime(booking);
    if (!bookingStart) {
      const message = isDateKey(booking.bookingDate)
        ? "Booking time is invalid"
        : "bookingDate must be YYYY-MM-DD";
      return res.status(400).json({ message });
    }

    const graceEnd = new Date(bookingStart.getTime() + 5 * 60 * 1000);
    const now = new Date();
    if (now > graceEnd) {
      return res.status(400).json({ message: "This booking can no longer be delayed." });
    }

    const oldStartMinutes = timeToMinutes(booking.time);

    if (oldStartMinutes === null) {
      return res.status(400).json({ message: "Booking time is invalid" });
    }

    const newStartMinutes = oldStartMinutes + delayMinutes;

    if (newStartMinutes >= 24 * 60) {
      return res.status(400).json({ message: "Cannot delay booking past the end of the day" });
    }

    const newTime = minutesToTime(newStartMinutes);
    const nextDayKey = getDayKeyFromDate(booking.bookingDate) || booking.dayKey;
    const delayResult = await withBookingCreationLock(
      getBookingCreationLockKey({
        barberId: booking.barberId,
        bookingDate: booking.bookingDate,
      }),
      async () => {
        const slotValidation = await validateBookingSlot({
          barberId: booking.barberId,
          salonId: booking?.salonId || null,
          bookingDate: booking.bookingDate,
          dayKey: nextDayKey,
          time: newTime,
          duration: booking.duration,
          ignoreBookingId: booking._id,
        });

        if (slotValidation.message) {
          return { message: slotValidation.message };
        }

        const updatedBooking = await Booking.findOneAndUpdate(
          {
            _id: booking._id,
            clientId: booking.clientId,
            status: "accepted",
            bookingDate: booking.bookingDate,
            time: booking.time,
            // Concurrency guard: only succeed if delay hasn't been applied yet
            $or: [
              { delayMinutesTotal: { $lte: 0 } },
              { delayMinutesTotal: { $exists: false } },
            ],
            delayedAt: null,
          },
          {
            $set: {
              time: newTime,
              dayKey: slotValidation.effectiveDayKey,
              reminderSentAt: null,
              delayMinutesTotal: delayMinutes,
              delayedAt: new Date(),
            },
          },
          { returnDocument: "after" }
        );

        if (!updatedBooking) {
          return { message: "Booking could not be delayed" };
        }

        return { booking: updatedBooking };
      }
    );

    if (delayResult.message) {
      return res.status(400).json({ message: delayResult.message });
    }

    const updatedBooking = delayResult.booking;

    const notificationTasks = [
      createNotification({
        userId: updatedBooking.barberId,
        type: "booking_delayed",
        message: `Client is running late. Booking moved to ${newTime}.`,
        data: getBookingNotificationData(updatedBooking),
      }),
    ];

    if (updatedBooking.clientId) {
      notificationTasks.push(
        createNotification({
          userId: updatedBooking.clientId,
          type: "booking_delayed",
          message: `Your booking was delayed to ${newTime}.`,
          data: getBookingNotificationData(updatedBooking),
        })
      );
    }

    await Promise.allSettled(notificationTasks);

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(serializeBookingForResponse(updatedBooking));
  } catch (error) {
    return sendControllerError(res, error, "Could not delay booking");
  }
};

export const updateTreatmentRecord = async (req, res) => {
  try {
    const result = await updateBookingTreatmentRecord({
      bookingId: req.params.id,
      body: req.body,
      user: req.user,
    });

    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    return res.json(serializeBookingForResponse(result.booking));
  } catch (error) {
    return sendControllerError(res, error, "Could not update treatment record");
  }
};

export const getReferenceImage = async (req, res, next) => {
  try {
    const { bookingId, imageName } = req.params;
    const result = await resolveReferenceImageRequest({
      bookingId,
      imageName,
      user: req.user,
    });

    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    return res.sendFile(result.absolutePath, (error) => {
      if (!error) return;

      console.error("Could not serve reference image", error);

      if (res.headersSent) {
        if (typeof next === "function") return next(error);
        return;
      }

      if (error.code === "ENOENT") {
        return res.status(404).json({ message: "Image file not found" });
      }

      return res.status(500).json({ message: "Could not serve reference image" });
    });
  } catch (error) {
    console.error("Could not serve reference image", error);
    return res.status(500).json({ message: "Could not serve reference image" });
  }
};
