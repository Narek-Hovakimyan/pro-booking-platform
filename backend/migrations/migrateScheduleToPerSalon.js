import Schedule from "../src/models/Schedule.js";
import User from "../src/models/User.js";
import connectDB from "../src/config/db.js";

/**
 * Migrate schedules from barber-level to per-salon.
 *
 * Previously, each barber had ONE schedule document (no salonId).
 * Now, each barber has ONE schedule per approved salon (barberId + salonId unique).
 *
 * For barbers with 1 approved salon: assign that salon to the existing schedule.
 * For barbers with multiple approved salons: assign the first salon to the existing
 * schedule, then create new schedule documents for the remaining salons.
 */
export default async function migrateScheduleToPerSalon() {
  console.log("Running schedule per-salon migration...");

  try {
    const schedules = await Schedule.find({ salonId: { $exists: false } });

    if (schedules.length === 0) {
      console.log("No schedules to migrate.");
      return;
    }

    let count = 0;

    for (const schedule of schedules) {
      const barber = await User.findById(schedule.barberId);
      if (!barber || !barber.salons?.length) {
        // No salons found - skip this schedule (orphaned)
        console.log(`  Skipping schedule for barber ${schedule.barberId}: no salons`);
        continue;
      }

      const approvedSalons = barber.salons.filter((s) => s.status === "approved");

      if (approvedSalons.length === 0) {
        // Barber has salons but none approved - skip
        console.log(`  Skipping schedule for barber ${schedule.barberId}: no approved salons`);
        continue;
      }

      // Assign first approved salon to existing schedule
      schedule.salonId = approvedSalons[0].salon;
      await schedule.save();
      count++;

      // Create new schedule documents for remaining approved salons
      for (let i = 1; i < approvedSalons.length; i++) {
        await Schedule.create({
          barberId: schedule.barberId,
          salonId: approvedSalons[i].salon,
          weeklySchedule: schedule.weeklySchedule || {},
          dateSchedules: schedule.dateSchedules || {},
          scheduleOverrides: schedule.scheduleOverrides || {},
          nonWorkingDays: schedule.nonWorkingDays || [],
        });
        count++;
      }
    }

    console.log(`Schedule migration complete: ${count} schedules migrated to per-salon`);
  } catch (error) {
    console.error("Schedule migration error:", error.message);
  }
}

// Direct execution guard: run via `node migrations/migrateScheduleToPerSalon.js`
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("migrateScheduleToPerSalon.js");

if (isDirectRun) {
  connectDB()
    .then(() => migrateScheduleToPerSalon())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
