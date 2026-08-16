import { disconnectDB } from "../src/config/db.js";
import connectDB from "../src/config/db.js";
import Salon from "../src/models/Salon.js";
import User from "../src/models/User.js";

const createCounters = () => ({
  inspected: 0, migrated: 0, skippedAlreadyMigrated: 0, conflicts: 0, malformed: 0, failed: 0,
});
const idOf = (value) => (value == null ? "" : String(value));
const migrationError = (message, counters, kind = "conflict") => {
  const error = new Error(message);
  error.code = `WORK_HISTORY_${kind.toUpperCase()}`;
  error.migrationCounters = counters;
  return error;
};

const approvedSalonsFor = (barber, counters) => {
  const approved = (barber.salons || []).filter((entry) => entry?.status === "approved");
  const ids = approved.map((entry) => idOf(entry.salon));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    counters.malformed += 1;
    throw migrationError(`Barber ${barber._id} has malformed approved salon membership`, counters, "malformed");
  }
  return approved;
};

const classifyHistory = ({ barber, approvedSalons, salonsById, counters }) => {
  const history = Array.isArray(barber.workHistory) ? barber.workHistory : [];
  const bySalon = new Map();
  for (const entry of history) {
    const salonId = idOf(entry?.salon);
    if (!salonId || !salonsById.has(salonId)) {
      counters.malformed += 1;
      throw migrationError(`Barber ${barber._id} has unresolved work history`, counters, "malformed");
    }
    if (bySalon.has(salonId)) {
      counters.conflicts += 1;
      throw migrationError(`Barber ${barber._id} has duplicate work history for salon ${salonId}`, counters);
    }
    bySalon.set(salonId, entry);
  }
  const approvedIds = new Set(approvedSalons.map((entry) => idOf(entry.salon)));
  const next = history.map((entry) => ({ ...(entry.toObject?.() || entry) }));
  let changed = false;
  for (const membership of approvedSalons) {
    const salonId = idOf(membership.salon);
    const existing = bySalon.get(salonId);
    if (existing) {
      if (!existing.isCurrent || existing.endDate) {
        const target = next.find((entry) => idOf(entry.salon) === salonId);
        target.isCurrent = true;
        target.endDate = null;
        changed = true;
      }
      continue;
    }
    const startDate = membership.joinedAt || barber.createdAt;
    if (!startDate) {
      counters.malformed += 1;
      throw migrationError(`Barber ${barber._id} has no deterministic work-history start date`, counters, "malformed");
    }
    next.push({ salon: membership.salon, salonName: salonsById.get(salonId).name || "Salon", startDate, endDate: null, isCurrent: true });
    changed = true;
  }
  for (const entry of next) {
    if (entry.isCurrent && !approvedIds.has(idOf(entry.salon))) {
      entry.isCurrent = false;
      if (!entry.endDate) entry.endDate = barber.updatedAt || barber.createdAt;
      if (!entry.endDate) {
        counters.malformed += 1;
        throw migrationError(`Barber ${barber._id} has no deterministic work-history end date`, counters, "malformed");
      }
      changed = true;
    }
  }
  return { changed, next };
};

export default async function fixWorkHistory({ UserModel = User, SalonModel = Salon, dryRun = false } = {}) {
  const counters = createCounters();
  const barbers = await UserModel.find({ role: "barber" });
  for (const barber of barbers) {
    counters.inspected += 1;
    try {
      const approvedSalons = approvedSalonsFor(barber, counters);
      const ids = [...new Set([
        ...approvedSalons.map((entry) => idOf(entry.salon)),
        ...(Array.isArray(barber.workHistory) ? barber.workHistory.map((entry) => idOf(entry?.salon)) : []),
      ])];
      if (ids.some((id) => !id)) {
        counters.malformed += 1;
        throw migrationError(`Barber ${barber._id} has unresolved work history`, counters, "malformed");
      }
      const salons = ids.length ? await SalonModel.find({ _id: { $in: ids } }).select("name") : [];
      const salonsById = new Map(salons.map((salon) => [idOf(salon._id), salon]));
      if (salonsById.size !== ids.length) {
        counters.malformed += 1;
        throw migrationError(`Barber ${barber._id} has missing salon references`, counters, "malformed");
      }
      const { changed, next } = classifyHistory({ barber, approvedSalons, salonsById, counters });
      if (!changed) {
        counters.skippedAlreadyMigrated += 1;
        continue;
      }
      if (!dryRun) {
        barber.workHistory = next;
        await barber.save();
      }
      counters.migrated += 1;
    } catch (error) {
      counters.failed += 1;
      if (!error.migrationCounters) error.migrationCounters = counters;
      throw error;
    }
  }
  return counters;
}

export const runFixWorkHistoryMigration = async ({
  connect = () => connectDB({ terminateOnFailure: false }), disconnect = disconnectDB, execute = fixWorkHistory,
  setExitCode = (code) => { process.exitCode = code; }, logError = console.error,
} = {}) => {
  let failure;
  let result;
  try {
    await connect();
    result = await execute();
  } catch (error) {
    failure = error;
    setExitCode(1);
    logError("Work history migration failed:", error);
  } finally {
    try {
      await disconnect();
    } catch (disconnectError) {
      if (!failure) {
        failure = disconnectError;
        setExitCode(1);
        logError("Work history migration disconnect failed:", disconnectError);
      }
    }
  }
  if (failure) throw failure;
  return result;
};

const isDirectRun = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fixWorkHistory.js");
if (isDirectRun) void runFixWorkHistoryMigration().catch(() => {});
