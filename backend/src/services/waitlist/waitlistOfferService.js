import WaitlistEntry from "../../models/WaitlistEntry.js";
import User from "../../models/User.js";
import { sendNotificationSafe } from "./waitlistNotificationService.js";
import {
  convertibleWaitlistStatuses,
  getActionableWaitlistEntry,
  populateWaitlistEntry,
} from "./waitlistQueries.js";
import { createWaitlistActionError } from "./waitlistValidation.js";
import { isTimeKey } from "../../utils/bookingDateTime.js";

export const offerWaitlistEntry = async ({ entryId, barberId, time }) => {
  if (!isTimeKey(time)) {
    throw createWaitlistActionError("time must be HH:mm", "VALIDATION_ERROR");
  }

  const entry = await getActionableWaitlistEntry(entryId, barberId);

  const offeredEntry = await WaitlistEntry.findOneAndUpdate(
    {
      _id: entry._id,
      barberId,
      status: { $in: convertibleWaitlistStatuses },
    },
    {
      $set: {
        status: "offered",
        offeredTime: time,
        offeredAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!offeredEntry) {
    throw createWaitlistActionError(
      "Waitlist entry is already being processed",
      "CONFLICT"
    );
  }

  await sendNotificationSafe({
    userId: offeredEntry.clientId,
    type: "waitlist_offered",
    message: `${offeredEntry.date} at ${time} proposed by barber. Please confirm or decline in the app.`,
  });

  return populateWaitlistEntry(offeredEntry);
};

export const declineWaitlistOffer = async ({ entryId, clientId }) => {
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

  const declinedEntry = await WaitlistEntry.findOneAndUpdate(
    { _id: entry._id, clientId, status: "offered" },
    {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!declinedEntry) {
    throw createWaitlistActionError(
      "Waitlist offer is already being processed",
      "CONFLICT"
    );
  }

  const client = await User.findById(declinedEntry.clientId).select("name");
  const clientName = client?.name || "Client";

  await sendNotificationSafe({
    userId: declinedEntry.barberId,
    type: "waitlist_declined",
    message: `${clientName} declined the proposed appointment time.`,
  });

  return populateWaitlistEntry(declinedEntry);
};

export const rejectWaitlistEntry = async ({ entryId, barberId }) => {
  const entry = await getActionableWaitlistEntry(entryId, barberId);
  const rejectedEntry = await WaitlistEntry.findOneAndUpdate(
    {
      _id: entry._id,
      barberId,
      status: { $in: convertibleWaitlistStatuses },
    },
    {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!rejectedEntry) {
    throw createWaitlistActionError(
      "Waitlist entry is already being processed",
      "CONFLICT"
    );
  }

  await sendNotificationSafe({
    userId: rejectedEntry.clientId,
    type: "waitlist_rejected",
    message: "No suitable time is available for your waitlist request.",
  });

  return populateWaitlistEntry(rejectedEntry);
};
