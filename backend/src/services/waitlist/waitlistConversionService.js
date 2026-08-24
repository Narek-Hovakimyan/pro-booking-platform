import WaitlistEntry from "../../models/WaitlistEntry.js";
import Booking from "../../models/Booking.js";
import User from "../../models/User.js";
import { createNotification } from "../notification/notificationService.js";
import {
  createBookingSlotHolds,
  isBookingSlotConflictError,
  releaseBookingSlotHolds,
  runBookingSlotTransaction,
} from "../booking/bookingSlotHoldService.js";
import { barberHasBookingPaidAccessForSalon } from "../subscription/subscriptionPaidAccessQueries.js";
import {
  getActionableWaitlistEntry,
  getValidatedWaitlistConversionContext,
  populateWaitlistEntry,
} from "./waitlistQueries.js";
import { createWaitlistActionError } from "./waitlistValidation.js";
import { sendNotificationSafe } from "./waitlistNotificationService.js";
import { getDayKeyFromDate } from "../../utils/bookingDateTime.js";
import { getLogger } from "../../config/logger.js";

const WAITLIST_ROLLBACK_EVENT = "waitlist.rollback_cleanup_failed";

const getSafeWaitlistRollbackContext = (context = {}) =>
  Object.fromEntries(
    ["waitlistEntryId", "bookingId", "barberId", "salonId", "serviceId"]
      .map((key) => [key, context[key]])
      .filter(([, value]) => value !== undefined && value !== null)
  );

const logWaitlistRollbackCleanupFailure = (operation, context = {}) => {
  try {
    const logger = getLogger?.();
    logger?.warn?.(
      {
        err: { name: "Error" },
        event: WAITLIST_ROLLBACK_EVENT,
        operation,
        ...getSafeWaitlistRollbackContext(context),
      },
      WAITLIST_ROLLBACK_EVENT
    );
  } catch {
    // Rollback cleanup failures are best-effort and must not mask the original error.
  }
};

const cleanupFailedWaitlistBooking = async (bookingId, context = {}) => {
  if (!bookingId) return;
  try {
    await runBookingSlotTransaction(async ({ session }) => {
      try {
        await Booking.findByIdAndDelete?.(bookingId, { session });
      } catch {
        logWaitlistRollbackCleanupFailure("delete_booking", {
          ...context,
          bookingId,
        });
      }

      try {
        await releaseBookingSlotHolds({ bookingId, session });
      } catch {
        logWaitlistRollbackCleanupFailure("release_slot_holds", {
          ...context,
          bookingId,
        });
      }
    });
  } catch {
    // Cleanup remains best-effort and must not mask the original error.
  }
};

export const acceptWaitlistOffer = async ({ entryId, clientId }) => {
  const entry = await WaitlistEntry.findOne({
    _id: entryId,
    clientId,
    status: "offered",
  });

  if (!entry) {
    throw createWaitlistActionError(
      "Waitlist offer not found or already processed",
      "NOT_FOUND"
    );
  }

  if (!entry.offeredTime) {
    throw createWaitlistActionError("No offered time on this entry", "VALIDATION_ERROR");
  }

  const claimedEntry = await WaitlistEntry.findOneAndUpdate(
    { _id: entry._id, status: "offered" },
    { $set: { status: "converting" } },
    { returnDocument: "after" }
  );

  if (!claimedEntry) {
    throw createWaitlistActionError(
      "Waitlist offer is already being processed",
      "CONFLICT"
    );
  }

  const barberHasAccess = await barberHasBookingPaidAccessForSalon(
    claimedEntry.barberId,
    claimedEntry.salonId || null
  );
  if (!barberHasAccess) {
    await WaitlistEntry.findOneAndUpdate(
      { _id: claimedEntry._id, status: "converting" },
      { $set: { status: "offered" } }
    );
    throw createWaitlistActionError(
      "This specialist is not currently accepting bookings.",
      "FORBIDDEN"
    );
  }

  let booking;
  let convertedEntry;
  try {
    ({ booking, convertedEntry } = await runBookingSlotTransaction(async ({ session }) => {
      const context = await getValidatedWaitlistConversionContext(
        claimedEntry,
        claimedEntry.offeredTime
      );
      const bookingId = new Booking()._id;

      await createBookingSlotHolds({
        bookingId,
        barberId: claimedEntry.barberId,
        bookingDate: claimedEntry.date,
        time: claimedEntry.offeredTime,
        duration: context.duration,
        session,
      });

      const bookingPayload = {
        _id: bookingId,
        clientId: claimedEntry.clientId,
        barberId: claimedEntry.barberId,
        salonId: claimedEntry.salonId || null,
        serviceId: claimedEntry.serviceId,
        bookingDate: claimedEntry.date,
        dayKey: getDayKeyFromDate(claimedEntry.date),
        time: claimedEntry.offeredTime,
        duration: context.duration,
        price: context.price,
        serviceName: context.service.name || "",
        status: "accepted",
        createdBy: "barber",
      };
      booking = session
        ? await Booking.create([bookingPayload], { session })
        : await Booking.create(bookingPayload);
      booking = Array.isArray(booking) ? booking[0] : booking;

      convertedEntry = await WaitlistEntry.findOneAndUpdate(
        { _id: claimedEntry._id, status: "converting" },
        {
          $set: {
            status: "converted",
            convertedAt: new Date(),
            convertedBooking: booking._id,
          },
        },
        { returnDocument: "after", ...(session ? { session } : {}) }
      );

      if (!convertedEntry) {
        throw createWaitlistActionError(
          "Waitlist entry could not be converted",
          "CONFLICT"
        );
      }

      return { booking, convertedEntry };
    }));
  } catch (error) {
    if (!convertedEntry && booking?._id) {
      await cleanupFailedWaitlistBooking(booking._id, {
        waitlistEntryId: claimedEntry?._id,
        barberId: claimedEntry?.barberId,
        salonId: claimedEntry?.salonId || null,
        serviceId: claimedEntry?.serviceId,
      });
    }
    if (isBookingSlotConflictError(error)) {
      error = createWaitlistActionError(
        "This time is already booked",
        "VALIDATION_ERROR"
      );
    }
    if (error.message === "This time is no longer available" || error.message === "This time is already booked") {
      await WaitlistEntry.findOneAndUpdate(
        { _id: claimedEntry._id, status: "converting" },
        { $set: { status: "offered" } },
        { returnDocument: "after" }
      );
    } else {
      await WaitlistEntry.findOneAndUpdate(
        { _id: claimedEntry._id, status: "converting" },
        { $set: { status: "offered" } },
        { returnDocument: "after" }
      );
    }

    throw error;
  }

  const client = await User.findById(convertedEntry.clientId).select("name");
  const clientName = client?.name || "Client";

  await sendNotificationSafe({
    userId: convertedEntry.barberId,
    type: "waitlist_accepted",
    message: `${clientName} confirmed the appointment for ${convertedEntry.date} at ${convertedEntry.offeredTime}.`,
  });

  return { entry: await populateWaitlistEntry(convertedEntry), booking };
};

export const approveWaitlistEntry = async ({ entryId, barberId, time }) => {
  const entry = await getActionableWaitlistEntry(entryId, barberId);
  const previousStatus = entry.status;
  const context = await getValidatedWaitlistConversionContext(entry, time);
  const claimedEntry = await WaitlistEntry.findOneAndUpdate(
    {
      _id: entry._id,
      barberId,
      status: { $in: ["active", "notified"] },
    },
    { $set: { status: "converting" } },
    { returnDocument: "after" }
  );

  if (!claimedEntry) {
    throw createWaitlistActionError(
      "Waitlist entry is already being processed",
      "CONFLICT"
    );
  }

  const barberHasAccess = await barberHasBookingPaidAccessForSalon(
    claimedEntry.barberId,
    claimedEntry.salonId || null
  );
  if (!barberHasAccess) {
    await WaitlistEntry.findOneAndUpdate(
      { _id: claimedEntry._id, status: "converting" },
      { $set: { status: previousStatus } }
    );
    throw createWaitlistActionError(
      "This specialist is not currently accepting bookings.",
      "FORBIDDEN"
    );
  }

  let booking;
  let convertedEntry;
  try {
    ({ booking, convertedEntry } = await runBookingSlotTransaction(async ({ session }) => {
      const bookingId = new Booking()._id;

      await createBookingSlotHolds({
        bookingId,
        barberId: claimedEntry.barberId,
        bookingDate: claimedEntry.date,
        time,
        duration: context.duration,
        session,
      });

      const bookingPayload = {
        _id: bookingId,
        clientId: claimedEntry.clientId,
        barberId: claimedEntry.barberId,
        salonId: claimedEntry.salonId || null,
        serviceId: claimedEntry.serviceId,
        bookingDate: claimedEntry.date,
        dayKey: getDayKeyFromDate(claimedEntry.date),
        time,
        duration: context.duration,
        price: context.price,
        serviceName: context.service.name || "",
        status: "accepted",
        createdBy: "barber",
      };
      booking = session
        ? await Booking.create([bookingPayload], { session })
        : await Booking.create(bookingPayload);
      booking = Array.isArray(booking) ? booking[0] : booking;

      convertedEntry = await WaitlistEntry.findOneAndUpdate(
        { _id: claimedEntry._id, status: "converting" },
        {
          $set: {
            status: "converted",
            convertedAt: new Date(),
            convertedBooking: booking._id,
          },
        },
        { returnDocument: "after", ...(session ? { session } : {}) }
      );

      if (!convertedEntry) {
        throw createWaitlistActionError(
          "Waitlist entry could not be converted",
          "CONFLICT"
        );
      }

      return { booking, convertedEntry };
    }));
  } catch (error) {
    if (!convertedEntry && booking?._id) {
      await cleanupFailedWaitlistBooking(booking._id, {
        waitlistEntryId: claimedEntry?._id,
        barberId: claimedEntry?.barberId,
        salonId: claimedEntry?.salonId || null,
        serviceId: claimedEntry?.serviceId,
      });
    }
    if (isBookingSlotConflictError(error)) {
      error = createWaitlistActionError(
        "This time is already booked",
        "VALIDATION_ERROR"
      );
    }
    await WaitlistEntry.findOneAndUpdate(
      { _id: claimedEntry._id, status: "converting" },
      { $set: { status: previousStatus } },
      { returnDocument: "after" }
    );

    throw error;
  }

  await createNotification({
    userId: convertedEntry.clientId,
    type: "waitlist_approved",
    message: `Your appointment is confirmed for ${convertedEntry.date} at ${time}.`,
  });

  return { entry: await populateWaitlistEntry(convertedEntry), booking };
};
