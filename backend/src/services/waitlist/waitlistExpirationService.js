import WaitlistEntry from "../../models/WaitlistEntry.js";
import { getArmeniaDateKey } from "../../utils/bookingDateTime.js";
import { OPEN_WAITLIST_STATUSES } from "./waitlistValidation.js";

export const expirePastWaitlistEntries = async (nowOrOptions = new Date()) => {
  const hasOptions =
    nowOrOptions &&
    typeof nowOrOptions === "object" &&
    !(nowOrOptions instanceof Date) &&
    ("now" in nowOrOptions || "leaseContext" in nowOrOptions);
  const now = hasOptions ? nowOrOptions.now || new Date() : nowOrOptions;
  const leaseContext = hasOptions ? nowOrOptions.leaseContext : undefined;
  const withFencedWrite =
    typeof leaseContext?.withFencedWrite === "function"
      ? (write) => leaseContext.withFencedWrite(write)
      : (write) => write({});
  const todayKey = getArmeniaDateKey(now);

  const expiredEntries = await WaitlistEntry.find({
    status: { $in: OPEN_WAITLIST_STATUSES },
    date: { $lt: todayKey },
  });
  const expiredAt = new Date(now);
  const updatedEntries = [];

  for (const entry of expiredEntries) {
    const updatedEntry = await withFencedWrite(({ session } = {}) =>
      WaitlistEntry.findOneAndUpdate(
        {
          _id: entry._id,
          status: { $in: OPEN_WAITLIST_STATUSES },
          date: { $lt: todayKey },
        },
        {
          $set: {
            status: "expired",
            expiredAt,
          },
        },
        { returnDocument: "after", session }
      )
    );

    if (updatedEntry) {
      updatedEntries.push(updatedEntry);
    }
  }

  return updatedEntries;
};

