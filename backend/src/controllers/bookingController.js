import Booking from "../models/Booking.js";
import {
  allowedBookingDelayMinutes,
  attemptsDateTimeChange,
  sendControllerError,
} from "../services/booking/bookingControllerHelpers.js";
import {
  collectReferenceImagePaths,
  cleanupReferenceImages,
} from "../services/booking/bookingReferenceImageHelpers.js";
import { updateBookingTreatmentRecord } from "../services/booking/bookingTreatmentRecordService.js";
import { delayBookingService } from "../services/booking/bookingDelayService.js";
import { createBookingService } from "../services/booking/bookingCreateService.js";
import { executeBookingPriceQuote } from "../services/booking/bookingQuoteService.js";
import { resolveReferenceImageRequest } from "../services/booking/bookingReferenceImageService.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import LoyaltyProgram from "../models/LoyaltyProgram.js";
import LoyaltyProgress from "../models/LoyaltyProgress.js";

import {
  emitBookingUpdated,
  notifyUsersForBookingStatusChange,
  notifyWaitlistForReleasedBookingSlot,
} from "../services/bookingSideEffectsService.js";
import { createNotification } from "./notificationController.js";
import { createCrudController } from "./crudController.js";
import {
  barberHasPaidAccessForSalon,
} from "../services/subscriptionService.js";
import {
  claimVoucherForBooking,
  rollbackVoucherClaim,
  recordVoucherRedemption,
  restoreVoucherOnCancel,
} from "../services/bookingPricingService.js";
import { buildBookingStatusUpdate } from "../services/bookingStatusService.js";
import {
  getDayKeyFromDate,
} from "../utils/bookingDateTime.js";
import {
  blockingBookingStatuses,
  defaultPersonalSchedule,
  defaultWeeklySchedule,
  defaultWorkingDaySchedule,
  getDayScheduleFromDefaultSchedule,
  maxCancellationReasonLength,
  maxRejectionReasonLength,
  normalizeBookingStatus,
  serializeBookingForResponse,
  slotOverlaps,
} from "../utils/bookingUtils.js";
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
    const createResult = await createBookingService({
      body: req.body,
      user: req.user,
      referenceImages,
      cleanupReferenceImagesOnError: cleanup,
    });

    if (createResult.body) {
      return res.status(createResult.status).json(createResult.body);
    }

    const { booking, payment } = createResult;
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
    const { booking: updatedBooking, newTime } = await delayBookingService({
      bookingId: req.params.id,
      delayMinutes: req.body?.delayMinutes,
      user: req.user,
    });

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
