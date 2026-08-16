import { disconnectDB } from "../src/config/db.js";
import connectDB from "../src/config/db.js";
import Salon from "../src/models/Salon.js";
import Schedule from "../src/models/Schedule.js";
import User from "../src/models/User.js";

const scheduleFields = ["weeklySchedule", "dateSchedules", "scheduleOverrides", "nonWorkingDays", "defaultSchedule"];
const createCounters = () => ({ inspected: 0, migrated: 0, skippedAlreadyMigrated: 0, conflicts: 0, malformed: 0, failed: 0 });
const idOf = (value) => (value == null ? "" : String(value));
const canonical = (value) => {
  if (value == null || typeof value !== "object" || value instanceof Date) return value instanceof Date ? value.toISOString() : value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const payloadOf = (schedule) => Object.fromEntries(scheduleFields.map((field) => [field, schedule[field]]));
const migrationError = (message, counters, kind = "conflict") => {
  const error = new Error(message);
  error.code = `SCHEDULE_MIGRATION_${kind.toUpperCase()}`;
  error.migrationCounters = counters;
  return error;
};

const approvedSalonsFor = (barber, counters) => {
  const approved = (barber.salons || []).filter((entry) => entry?.status === "approved");
  const ids = approved.map((entry) => idOf(entry.salon));
  if (!ids.length || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    counters.malformed += 1;
    throw migrationError(`Barber ${barber._id} has invalid approved salon membership`, counters, "malformed");
  }
  const primaries = approved.filter((entry) => entry.isPrimary);
  if (primaries.length > 1) {
    counters.conflicts += 1;
    throw migrationError(`Barber ${barber._id} has multiple primary salons`, counters);
  }
  return { approved, primary: primaries[0] || approved[0] };
};

export default async function migrateScheduleToPerSalon({
  ScheduleModel = Schedule, UserModel = User, SalonModel = Salon, dryRun = false,
} = {}) {
  const counters = createCounters();
  const legacySchedules = await ScheduleModel.find({ salonId: { $exists: false } });
  for (const legacy of legacySchedules) {
    counters.inspected += 1;
    try {
      const barber = await UserModel.findById(legacy.barberId);
      if (!barber || barber.role !== "barber") {
        counters.malformed += 1;
        throw migrationError(`Schedule ${legacy._id} has no valid barber`, counters, "malformed");
      }
      const { approved, primary } = approvedSalonsFor(barber, counters);
      const salonIds = approved.map((entry) => entry.salon);
      const salons = await SalonModel.find({ _id: { $in: salonIds } }).select("_id");
      if (salons.length !== salonIds.length) {
        counters.malformed += 1;
        throw migrationError(`Schedule ${legacy._id} has missing salon references`, counters, "malformed");
      }
      const targets = await ScheduleModel.find({ barberId: legacy.barberId, salonId: { $in: salonIds } });
      const bySalon = new Map();
      for (const target of targets) {
        const salonId = idOf(target.salonId);
        if (bySalon.has(salonId)) {
          counters.conflicts += 1;
          throw migrationError(`Schedule ${legacy._id} has duplicate target for salon ${salonId}`, counters);
        }
        bySalon.set(salonId, target);
      }
      const payload = payloadOf(legacy);
      for (const [salonId, target] of bySalon) {
        if (!same(payload, payloadOf(target))) {
          counters.conflicts += 1;
          throw migrationError(`Schedule ${legacy._id} conflicts with target ${salonId}`, counters);
        }
      }
      const primaryId = idOf(primary.salon);
      const missingSecondary = approved.filter((entry) => idOf(entry.salon) !== primaryId && !bySalon.has(idOf(entry.salon)));
      if (!dryRun) {
        for (const membership of missingSecondary) {
          await ScheduleModel.create({ barberId: legacy.barberId, salonId: membership.salon, ...payload });
        }
        if (bySalon.has(primaryId)) await legacy.deleteOne();
        else {
          legacy.salonId = primary.salon;
          await legacy.save();
        }
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

export const runScheduleMigration = async ({
  connect = () => connectDB({ terminateOnFailure: false }), disconnect = disconnectDB, execute = migrateScheduleToPerSalon,
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
    logError("Schedule migration failed:", error);
  } finally {
    try {
      await disconnect();
    } catch (disconnectError) {
      if (!failure) {
        failure = disconnectError;
        setExitCode(1);
        logError("Schedule migration disconnect failed:", disconnectError);
      }
    }
  }
  if (failure) throw failure;
  return result;
};

const isDirectRun = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrateScheduleToPerSalon.js");
if (isDirectRun) void runScheduleMigration().catch(() => {});
