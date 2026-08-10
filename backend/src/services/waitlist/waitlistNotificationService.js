import WaitlistEntry from "../../models/WaitlistEntry.js";
import User from "../../models/User.js";
import { createNotification } from "../notification/notificationService.js";
import { exactWaitlistNotificationPredicate } from "./waitlistQueries.js";
import { getArmeniaDateKey, timeToMinutes } from "../../utils/bookingDateTime.js";
import { getLogger } from "../../config/logger.js";

let getLoggerForWaitlistNotifications = getLogger;

const getSafeLogContext = (context = {}) =>
  Object.fromEntries(
    ["waitlistEntryId", "barberId", "salonId", "serviceId", "bookingId"]
      .map((key) => [key, context[key]])
      .filter(([, value]) => value !== undefined && value !== null)
  );

const logWaitlistNotificationFailure = (err, context = {}) => {
  try {
    const logger = getLoggerForWaitlistNotifications?.();
    logger?.warn?.(
      {
        err,
        event: "waitlist.notification_failed",
        ...getSafeLogContext(context),
      },
      "waitlist.notification_failed"
    );
  } catch {
    // Waitlist notification failures are non-fatal.
  }
};

export const sendNotificationSafe = async (payload, context) => {
  try {
    await createNotification(payload);
  } catch (err) {
    logWaitlistNotificationFailure(err, context);
  }
};

export const notifyMatchingWaitlistEntries = async ({
  barberId,
  salonId,
  date,
  serviceId,
  time,
  session,
  afterCommit,
  now = new Date(),
}) => {
  if (!barberId || !date) {
    return 0;
  }

  if (date < getArmeniaDateKey(now)) {
    return 0;
  }

  const query = {
    barberId,
    date,
    status: "active",
  };

  const matchingEntries = await WaitlistEntry.find(
    query,
    null,
    session ? { session } : undefined
  );

  if (matchingEntries.length === 0) {
    return 0;
  }

  const slotMinutes = timeToMinutes(time || "");
  const matchingEligibleEntries = matchingEntries.filter((entry) => {
    if (entry.salonId && (!salonId || String(entry.salonId) !== String(salonId))) {
      return false;
    }

    if (serviceId && String(entry.serviceId) !== String(serviceId)) {
      return false;
    }

    const startMinutes = timeToMinutes(entry.preferredStartTime || "");
    const endMinutes = timeToMinutes(entry.preferredEndTime || "");

    if (startMinutes === null && endMinutes === null) {
      return true;
    }

    if (slotMinutes === null) {
      return false;
    }

    if (startMinutes !== null && slotMinutes < startMinutes) {
      return false;
    }

    if (endMinutes !== null && slotMinutes > endMinutes) {
      return false;
    }

    return true;
  });

  if (matchingEligibleEntries.length === 0) {
    return 0;
  }

  const barberQuery = User.findById(
    barberId,
    null,
    session ? { session } : undefined
  );
  const barber = typeof barberQuery?.select === "function"
    ? await barberQuery.select("name")
    : await barberQuery;
  const barberName = barber?.name || "Barber";

  let notificationsSent = 0;

  for (const entry of matchingEligibleEntries) {
    const notifiedAt = new Date(now);
    const claimedEntry = await WaitlistEntry.findOneAndUpdate(
      exactWaitlistNotificationPredicate(entry),
      {
        $set: {
          status: "notified",
          notifiedAt,
        },
      },
      { returnDocument: "after", session }
    );

    if (!claimedEntry) {
      continue;
    }

    await createNotification({
      userId: claimedEntry.clientId,
      type: "waitlist_slot_available",
      message: `A slot may be available with ${barberName} on ${date}.`,
      data: {
        waitlistId: claimedEntry._id,
        barberId: claimedEntry.barberId,
        salonId: claimedEntry.salonId || undefined,
        serviceId: claimedEntry.serviceId,
      },
      idempotencyKey: `waitlist-slot-available:${String(claimedEntry._id)}:${date}:${time || "any"}`,
      session,
      afterCommit,
    });

    notificationsSent += 1;
  }

  return notificationsSent;
};

export const __waitlistNotificationTestHooks = {
  setLogger(nextLogger) {
    getLoggerForWaitlistNotifications = () => nextLogger;
  },
  resetLogger() {
    getLoggerForWaitlistNotifications = getLogger;
  },
};
