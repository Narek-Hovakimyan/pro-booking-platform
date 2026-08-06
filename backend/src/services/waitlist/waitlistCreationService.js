import WaitlistEntry from "../../models/WaitlistEntry.js";
import {
  CANCELLABLE_WAITLIST_STATUSES,
  OPEN_WAITLIST_STATUSES,
  getWaitlistCreationLockKey,
  throwDuplicateWaitlistEntryError,
  validatePreferredWindow,
  validateWaitlistDate,
} from "./waitlistValidation.js";
import { validateWaitlistRelationships } from "./waitlistQueries.js";

const waitlistCreationLocks = new Map();

const withWaitlistCreationLock = async (lockKey, task) => {
  const previousLock = waitlistCreationLocks.get(lockKey) || Promise.resolve();
  let releaseCurrentLock;
  const currentLock = new Promise((resolve) => {
    releaseCurrentLock = resolve;
  });

  const queuedLock = previousLock.then(() => currentLock, () => currentLock);
  waitlistCreationLocks.set(lockKey, queuedLock);

  await previousLock.catch(() => {});

  try {
    return await task();
  } finally {
    releaseCurrentLock();

    if (waitlistCreationLocks.get(lockKey) === queuedLock) {
      waitlistCreationLocks.delete(lockKey);
    }
  }
};

export const createWaitlistEntry = async ({
  clientId,
  barberId,
  salonId = null,
  serviceId,
  date,
  preferredStartTime = "",
  preferredEndTime = "",
  note = "",
}) => {
  const dateError = validateWaitlistDate(date);

  if (dateError) {
    throw new Error(dateError);
  }

  const normalizedPreferredStartTime = preferredStartTime || "";
  const normalizedPreferredEndTime = preferredEndTime || "";
  const preferredWindowError = validatePreferredWindow({
    preferredStartTime: normalizedPreferredStartTime,
    preferredEndTime: normalizedPreferredEndTime,
  });

  if (preferredWindowError) {
    throw new Error(preferredWindowError);
  }

  const relationshipError = await validateWaitlistRelationships({
    barberId,
    salonId,
    serviceId,
  });

  if (relationshipError) {
    throw new Error(relationshipError);
  }

  const existingQuery = {
    clientId,
    barberId,
    salonId: salonId || null,
    serviceId,
    date,
    preferredStartTime: normalizedPreferredStartTime,
    preferredEndTime: normalizedPreferredEndTime,
    status: { $in: OPEN_WAITLIST_STATUSES },
  };
  const lockKey = getWaitlistCreationLockKey(existingQuery);

  return withWaitlistCreationLock(lockKey, async () => {
    const existing = await WaitlistEntry.findOne(existingQuery);

    if (existing) {
      throwDuplicateWaitlistEntryError();
    }

    return WaitlistEntry.create({
      clientId,
      barberId,
      salonId: salonId || null,
      serviceId,
      date,
      preferredStartTime: normalizedPreferredStartTime,
      preferredEndTime: normalizedPreferredEndTime,
      note: note || "",
      status: "active",
    });
  });
};

export const cancelWaitlistEntry = async (entryId, clientId) => {
  const entry = await WaitlistEntry.findOne({
    _id: entryId,
    clientId,
    status: { $in: CANCELLABLE_WAITLIST_STATUSES },
  });

  if (!entry) {
    const error = new Error("Waitlist entry not found or already cancelled");
    error.code = "NOT_FOUND";
    throw error;
  }

  entry.status = "cancelled";
  entry.cancelledAt = new Date();
  await entry.save();

  return entry;
};

