import Booking from "../../models/Booking.js";
import BookingReminderDispatch from "../../models/BookingReminderDispatch.js";
import { getBookingDateTime } from "../../utils/bookingDateTime.js";
import { createNotification } from "../notification/notificationService.js";
import { bookingReminderDispatchService } from "./bookingReminderDispatchService.js";

const VALID_BOOKING_STATUSES = new Set(["accepted", "confirmed"]);
const REMINDER_2H = "booking_reminder_2h";
const REMINDER_24H = "booking_reminder_24h";
const LEASE_LOST_ERROR_CODE = "scheduler_lease_lost";
const FENCED_INFRA_ERROR_NAMES = new Set([
  "MongoExpiredSessionError", "MongoNetworkError", "MongoNotConnectedError",
  "MongoRuntimeError", "MongoServerClosedError", "MongoSystemError",
  "MongoTopologyClosedError", "MongoTransactionError", "MongooseServerSelectionError",
]);
const FENCED_INFRA_ERROR_CODES = new Set([91, 112, 189, 251, 10107, 11600, 11602, 13435, 13436]);
const FENCED_INFRA_ERROR_CODE_NAMES = new Set([
  "InterruptedAtShutdown", "InterruptedDueToReplStateChange", "LockTimeout",
  "NoSuchTransaction", "NotWritablePrimary", "PrimarySteppedDown",
  "ShutdownInProgress", "WriteConflict",
]);
const FENCED_INFRA_LABELS = new Set([
  "RetryableWriteError", "TransientTransactionError", "UnknownTransactionCommitResult",
]);

const getStructuredErrorCandidates = (error) => {
  const seen = new Set();
  const queue = [error];
  const candidates = [];
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
    for (const key of ["cause", "error", "originalError", "reason"]) {
      if (candidate[key] && typeof candidate[key] === "object") queue.push(candidate[key]);
    }
  }
  return candidates;
};

const isFencedInfrastructureError = (error) =>
  getStructuredErrorCandidates(error).some((candidate) => {
    if (candidate.code === LEASE_LOST_ERROR_CODE) return true;
    if (typeof candidate.code === "number" && FENCED_INFRA_ERROR_CODES.has(candidate.code)) return true;
    if (typeof candidate.codeName === "string" && FENCED_INFRA_ERROR_CODE_NAMES.has(candidate.codeName)) return true;
    if (typeof candidate.hasErrorLabel === "function") {
      for (const label of FENCED_INFRA_LABELS) if (candidate.hasErrorLabel(label)) return true;
    }
    if (Array.isArray(candidate.errorLabels) && candidate.errorLabels.some((label) => FENCED_INFRA_LABELS.has(label))) return true;
    return typeof candidate.name === "string" && FENCED_INFRA_ERROR_NAMES.has(candidate.name);
  });
const REMINDER_FIELDS = {
  [REMINDER_2H]: "reminder2hSentAt",
  [REMINDER_24H]: "reminder24hSentAt",
};

const isValidReminderType = (value) => value === REMINDER_2H || value === REMINDER_24H;

const getBookingNotificationData = (booking) =>
  booking?._id ? { bookingId: booking._id } : undefined;

const isDeliverableBooking = (booking) =>
  booking && VALID_BOOKING_STATUSES.has(booking.status);

const getReminderWindowEnd = (now, reminderType) =>
  new Date(
    now.getTime() + (reminderType === REMINDER_2H ? 2 : 24) * 60 * 60 * 1000
  );

const getReminderPlan = (booking, now) => {
  if (!isDeliverableBooking(booking)) return null;

  const startsAt = getBookingDateTime(booking);
  if (!startsAt || startsAt <= now) return null;

  const reminder2hWindowEnd = getReminderWindowEnd(now, REMINDER_2H);
  if (
    !booking.reminder2hSentAt &&
    startsAt > now &&
    startsAt <= reminder2hWindowEnd
  ) {
    return {
      reminderType: REMINDER_2H,
      field: REMINDER_FIELDS[REMINDER_2H],
      recipients: [
        {
          userId: booking.clientId,
          message: "Your appointment starts in 2 hours.",
        },
        {
          userId: booking.barberId,
          message: "Your appointment starts in 2 hours.",
        },
      ],
    };
  }

  const reminder24hWindowEnd = getReminderWindowEnd(now, REMINDER_24H);
  if (
    !booking.reminder24hSentAt &&
    !booking.reminder2hSentAt &&
    startsAt > now &&
    startsAt <= reminder24hWindowEnd
  ) {
    const barberName = booking.barberName || "your barber";
    const clientName = booking.clientName || "your client";
    const time = booking.time || "";

    return {
      reminderType: REMINDER_24H,
      field: REMINDER_FIELDS[REMINDER_24H],
      recipients: [
        {
          userId: booking.clientId,
          message: `Reminder: your appointment with ${barberName} is tomorrow at ${time}.`,
        },
        {
          userId: booking.barberId,
          message: `Reminder: you have an appointment with ${clientName} tomorrow at ${time}.`,
        },
      ],
    };
  }

  return null;
};

const getValidRecipients = (plan) =>
  plan.recipients.filter((recipient) => recipient.userId);

const getFailureCode = (error) => {
  if (typeof error?.code === "string" && /^[a-z0-9_]+$/.test(error.code)) {
    return error.code;
  }

  return "notification_error";
};

const throwIfLeaseFenceError = (error) => {
  if (isFencedInfrastructureError(error)) throw error;
};

const createAssertOwned = (leaseContext) =>
  typeof leaseContext?.assertOwned === "function"
    ? async () => leaseContext.assertOwned()
    : async () => {};

const createWithFencedWrite = (leaseContext) =>
  typeof leaseContext?.withFencedWrite === "function"
    ? async (write) => leaseContext.withFencedWrite(write)
    : async (write) => write({});

const claimLegacyReminderField = async ({
  bookingModel,
  booking,
  reminderType,
  validRecipientIds,
  dispatchModel,
  now,
  withFencedWrite,
}) => {
  const field = REMINDER_FIELDS[reminderType];
  if (!field || validRecipientIds.length === 0) {
    return false;
  }

  return withFencedWrite(async ({ session }) => {
    const currentBooking = await bookingModel.findOne(
      { _id: booking._id },
      null,
      session ? { session } : undefined
    );
    const currentPlan = getReminderPlan(currentBooking, now);

    if (!currentPlan || currentPlan.reminderType !== reminderType) {
      return false;
    }

    const currentValidRecipients = getValidRecipients(currentPlan).map((recipient) =>
      String(recipient.userId)
    );

    if (currentValidRecipients.length !== validRecipientIds.length) {
      return false;
    }

    const dispatches = await dispatchModel.find(
      {
        bookingId: booking._id,
        reminderType,
        userId: { $in: validRecipientIds },
      },
      null,
      session ? { session } : undefined
    );

    const sentRecipientIds = new Set(
      dispatches
        .filter((dispatch) => dispatch.status === "sent")
        .map((dispatch) => String(dispatch.userId))
    );

    const allRecipientsSent = validRecipientIds.every((userId) =>
      sentRecipientIds.has(String(userId))
    );

    if (!allRecipientsSent) {
      return false;
    }

    const updatedBooking = await bookingModel.findOneAndUpdate(
      {
        _id: booking._id,
        bookingDate: currentBooking.bookingDate,
        time: currentBooking.time,
        status: { $in: ["accepted", "confirmed"] },
        [field]: null,
        ...(reminderType === REMINDER_24H ? { reminder2hSentAt: null } : {}),
      },
      { $set: { [field]: new Date(now) } },
      { returnDocument: "after", session }
    );

    return Boolean(updatedBooking);
  });
};

const createReminderIdempotencyKey = ({ bookingId, reminderType, userId }) =>
  `booking-reminder:${String(bookingId)}:${reminderType}:${String(userId)}`;

export const runBookingReminders = async (now = new Date(), deps = {}) => {
  const bookingModel = deps.bookingModel || Booking;
  const dispatchModel = deps.dispatchModel || BookingReminderDispatch;
  const dispatchService = deps.dispatchService || bookingReminderDispatchService;
  const createNotificationFn = deps.createNotification || createNotification;
  const assertOwned = createAssertOwned(deps.leaseContext);
  const withFencedWrite = createWithFencedWrite(deps.leaseContext);

  const startOfWindow = now;
  const maxFetchDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const maxDateStr = maxFetchDate.toISOString().slice(0, 10);

  const acceptedBookings = await bookingModel.find({
    bookingDate: { $ne: "", $lte: maxDateStr },
    time: { $ne: "" },
    status: { $in: ["accepted", "confirmed"] },
  });

  let remindersSent = 0;

  bookingLoop: for (const booking of acceptedBookings) {
    const plan = getReminderPlan(booking, startOfWindow);
    if (!plan || !isValidReminderType(plan.reminderType)) continue;

    const validRecipients = getValidRecipients(plan);
    let deliveredAnyRecipient = false;

    for (const recipient of validRecipients) {
      let claimedDispatch = null;

      try {
        const claimResult = await withFencedWrite(({ session }) =>
          dispatchService.claim({
            bookingId: booking._id,
            reminderType: plan.reminderType,
            userId: recipient.userId,
            session,
          })
        );

        if (!claimResult.claimed || !claimResult.dispatch?.claimToken) {
          continue;
        }

        claimedDispatch = claimResult.dispatch;
        const currentBooking = await bookingModel.findOne({ _id: booking._id });
        const currentPlan = getReminderPlan(currentBooking, startOfWindow);
        const currentRecipient = currentPlan?.recipients.find(
          (entry) => String(entry.userId) === String(recipient.userId)
        );

        if (!currentPlan || currentPlan.reminderType !== plan.reminderType || !currentRecipient) {
          await withFencedWrite(({ session }) =>
            dispatchService.markFailed({
              bookingId: booking._id,
              reminderType: plan.reminderType,
              userId: recipient.userId,
              claimToken: claimedDispatch.claimToken,
              failureCode: "booking_invalid",
              session,
            })
          );
          continue;
        }

        await withFencedWrite(({ session, afterCommit }) =>
          createNotificationFn({
            userId: recipient.userId,
            type: plan.reminderType,
            message: currentRecipient.message,
            data: getBookingNotificationData(currentBooking),
            idempotencyKey: createReminderIdempotencyKey({
              bookingId: booking._id,
              reminderType: plan.reminderType,
              userId: recipient.userId,
            }),
            session,
            afterCommit,
          })
        );

        const markSentResult = await withFencedWrite(({ session }) =>
          dispatchService.markSent({
            bookingId: booking._id,
            reminderType: plan.reminderType,
            userId: recipient.userId,
            claimToken: claimedDispatch.claimToken,
            session,
          })
        );

        if (markSentResult.markedSent) {
          deliveredAnyRecipient = true;
        }
      } catch (error) {
        throwIfLeaseFenceError(error);

        if (!claimedDispatch?.claimToken) {
          throw error;
        }

        try {
          await assertOwned();
        } catch (assertError) {
          throwIfLeaseFenceError(assertError);
          throw assertError;
        }

        if (claimedDispatch?.claimToken) {
          try {
            await withFencedWrite(({ session }) =>
              dispatchService.markFailed({
                bookingId: booking._id,
                reminderType: plan.reminderType,
                userId: recipient.userId,
                claimToken: claimedDispatch.claimToken,
                failureCode: getFailureCode(error),
                session,
              })
            );
          } catch (markFailedError) {
            throwIfLeaseFenceError(markFailedError);
            throw markFailedError;
          }
        }
      }
    }

    if (!deliveredAnyRecipient && validRecipients.length > 0) {
      continue;
    }

    try {
      const finalized = await claimLegacyReminderField({
        bookingModel,
        booking,
        reminderType: plan.reminderType,
        validRecipientIds: validRecipients.map((recipient) => recipient.userId),
        dispatchModel,
        now: startOfWindow,
        withFencedWrite,
      });

      if (finalized) remindersSent++;
    } catch (error) {
      throwIfLeaseFenceError(error);
      throw error;
    }
  }

  return { remindersSent };
};
