/**
 * Migration: Convert single-salon barbers to multi-salon system.
 *
 * Reads the legacy `salon` and `salonStatus` fields from each barber
 * and populates the new `salons` array. Also adds a workHistory entry
 * if the barber has an approved salon and no matching entry exists.
 *
 * Safe to run multiple times – skips barbers that already have a
 * non-empty `salons` array.
 */

import User from "../src/models/User.js";
import connectDB from "../src/config/db.js";

async function migrateBarbers() {
  const barbers = await User.find({
    role: "barber",
    $or: [
      { salons: { $exists: false } },
      { salons: { $size: 0 } },
    ],
  });

  let count = 0;

  for (const barber of barbers) {
    if (barber.salon && barber.salonStatus) {
      const status =
        barber.salonStatus === "none" ? "pending" : barber.salonStatus;

      barber.salons = [
        {
          salon: barber.salon,
          status,
          joinedAt:
            barber.salonStatus === "approved"
              ? barber.createdAt || new Date()
              : null,
          isPrimary: barber.salonStatus === "approved",
        },
      ];

      // Add workHistory entry if approved and not already present
      if (barber.salonStatus === "approved") {
        const alreadyInHistory = (barber.workHistory || []).some((h) =>
          h.salon?.toString() === barber.salon?.toString()
        );

        if (!alreadyInHistory) {
          barber.workHistory = barber.workHistory || [];
          barber.workHistory.push({
            salon: barber.salon,
            salonName: barber.salon?.name || "Salon",
            startDate: barber.createdAt || new Date(),
            endDate: null,
            isCurrent: true,
          });
        }
      }

      await barber.save();
      count++;
    }
  }

  console.log(
    `Migration complete: ${count} barber(s) migrated to multi-salon system`
  );
}

export default migrateBarbers;

// Direct execution guard: run via `node migrations/migrateToMultipleSalons.js`
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("migrateToMultipleSalons.js");

if (isDirectRun) {
  connectDB()
    .then(() => migrateBarbers())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
