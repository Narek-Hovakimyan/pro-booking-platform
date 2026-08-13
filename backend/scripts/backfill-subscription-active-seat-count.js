import "dotenv/config";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";

import Subscription from "../src/models/Subscription.js";
import SubscriptionSeat from "../src/models/SubscriptionSeat.js";
import User from "../src/models/User.js";
import Salon from "../src/models/Salon.js";

/*
 * Deployment order: quiesce every legacy seat writer, repeat the read-only
 * preflight, run this script without --write, then rerun with --write
 * --maintenance-quiesced only when the dry run is clean. Snapshot reads do
 * not serialize legacy seat writers, so write mode is unsafe without that
 * maintenance boundary. Verify counters before enabling capacity claims, then
 * resume seat writes only after counter-backed code is deployed.
 */
const activeSeatMatch = { status: "active" };

export const buildActiveSeatBackfillPlan = ({ subscriptions, seats, users, salons }) => {
  const subscriptionsById = new Map(subscriptions.map((subscription) => [String(subscription._id), subscription]));
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const salonsById = new Map(salons.map((salon) => [String(salon._id), salon]));
  const anomalies = [];
  const seenSeats = new Set();
  const counts = new Map(subscriptions.map((subscription) => [String(subscription._id), 0]));

  for (const subscription of subscriptions) {
    if (
      subscription.ownerType === "salon" &&
      (!subscription.ownerId || !salonsById.has(String(subscription.ownerId)))
    ) {
      anomalies.push({ subscriptionId: String(subscription._id), reason: "missing salon owner" });
    }
  }

  for (const seat of seats) {
    const subscriptionId = seat.subscriptionId && String(seat.subscriptionId);
    const barberId = seat.barberId && String(seat.barberId);
    const assignedBy = seat.assignedBy && String(seat.assignedBy);
    const subscription = subscriptionId && subscriptionsById.get(subscriptionId);
    const barber = barberId && usersById.get(barberId);
    const assigner = assignedBy && usersById.get(assignedBy);
    const salon = subscription?.ownerId && salonsById.get(String(subscription.ownerId));
    const isActive = seat.status === activeSeatMatch.status;
    if (
      !["active", "revoked"].includes(seat.status) ||
      !subscriptionId ||
      !barberId ||
      !assignedBy ||
      !subscription ||
      !salon ||
      !barber ||
      !assigner ||
      barber.role !== "barber" ||
      subscription.ownerType !== "salon" ||
      !Number.isInteger(subscription.seatCount) ||
      subscription.seatCount < 1 ||
      !seat.salonId ||
      !salonsById.has(String(seat.salonId)) ||
      String(seat.salonId) !== String(subscription.ownerId)
    ) {
      anomalies.push({ seatId: String(seat._id), reason: "invalid seat reference or status" });
      continue;
    }
    if (!isActive) continue;
    const seatKey = `${subscriptionId}|${barberId}`;
    if (seenSeats.has(seatKey)) {
      anomalies.push({ seatId: String(seat._id), reason: "duplicate active seat" });
      continue;
    }
    seenSeats.add(seatKey);
    counts.set(subscriptionId, counts.get(subscriptionId) + 1);
  }

  const updates = subscriptions.map((subscription) => ({
    subscriptionId: subscription._id,
    activeSeatCount: counts.get(String(subscription._id)) || 0,
  }));
  for (const update of updates) {
    const subscription = subscriptionsById.get(String(update.subscriptionId));
    if (update.activeSeatCount > subscription.seatCount) {
      anomalies.push({ subscriptionId: String(subscription._id), reason: "active seats exceed seat count" });
    }
  }
  return { updates, anomalies };
};

const readBackfillPlan = async (session = null) => {
  const options = session ? { session } : undefined;
  const [subscriptions, seats, users, salons] = await Promise.all([
    Subscription.find({}, null, options).lean(),
    SubscriptionSeat.find({}, null, options).lean(),
    User.find({}, null, options).select("_id role").lean(),
    Salon.find({}, null, options).select("_id").lean(),
  ]);
  const plan = buildActiveSeatBackfillPlan({ subscriptions, seats, users, salons });
  if (plan.anomalies.length) {
    const error = new Error("Active-seat backfill preflight found anomalies");
    error.code = "ACTIVE_SEAT_BACKFILL_ANOMALIES";
    error.anomalies = plan.anomalies;
    throw error;
  }
  return plan;
};

const verifyCounters = async (updates, session) => {
  const expectedById = new Map(
    updates.map(({ subscriptionId, activeSeatCount }) => [String(subscriptionId), activeSeatCount])
  );
  const current = await Subscription.find(
    { _id: { $in: updates.map(({ subscriptionId }) => subscriptionId) } },
    null,
    { session }
  ).lean();
  if (
    current.length !== updates.length ||
    current.some((subscription) => expectedById.get(String(subscription._id)) !== subscription.activeSeatCount)
  ) {
    const error = new Error("Active-seat backfill verification failed");
    error.code = "ACTIVE_SEAT_BACKFILL_VERIFICATION_FAILED";
    throw error;
  }
};

export const runActiveSeatCountBackfill = async ({
  write = false,
  maintenanceQuiesced = false,
} = {}) => {
  if (!write) return { ...(await readBackfillPlan()), modifiedCount: 0 };
  if (!maintenanceQuiesced) {
    const error = new Error("Write mode requires quiesced seat mutations");
    error.code = "ACTIVE_SEAT_BACKFILL_MAINTENANCE_REQUIRED";
    throw error;
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const plan = await readBackfillPlan(session);
      let modifiedCount = 0;
      if (plan.updates.length) {
        const writeResult = await Subscription.bulkWrite(
          plan.updates.map(({ subscriptionId, activeSeatCount }) => ({
            updateOne: {
              filter: { _id: subscriptionId },
              update: { $set: { activeSeatCount } },
            },
          })),
          { ordered: true, session }
        );
        modifiedCount = writeResult.modifiedCount || 0;
        await verifyCounters(plan.updates, session);
      }
      result = { ...plan, modifiedCount };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const main = async () => {
  const write = process.argv.includes("--write");
  const maintenanceQuiesced = process.argv.includes("--maintenance-quiesced");
  if (process.argv.includes("--help")) {
    console.log("Usage: node scripts/backfill-subscription-active-seat-count.js [--write --maintenance-quiesced]");
    console.log("Write mode requires quiesced legacy seat mutations; snapshot reads do not serialize legacy writers.");
    return;
  }
  const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!mongoUri) throw new Error("Database configuration is required");
  await mongoose.connect(mongoUri);
  try {
    const result = await runActiveSeatCountBackfill({ write, maintenanceQuiesced });
    console.log(`${write ? "Backfilled" : "Dry run"}: ${result.updates.length} subscriptions, ${result.modifiedCount} updates.`);
  } finally {
    await mongoose.disconnect();
  }
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.code === "ACTIVE_SEAT_BACKFILL_ANOMALIES" ? "Preflight anomalies found." : "Backfill failed.");
    process.exitCode = 1;
  });
}
