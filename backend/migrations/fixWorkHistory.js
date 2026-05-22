import User from "../src/models/User.js";
import Salon from "../src/models/Salon.js";
import connectDB from "../src/config/db.js";

/**
 * Fix work history for barbers with multiple salons.
 *
 * The bug was: when a barber joined a second salon, closeCurrentWorkHistory(barber, null, ...)
 * was called, which closed ALL current work history entries (including the first salon's).
 *
 * This migration:
 * 1. Finds barbers who have approved salons but their workHistory says "not current"
 * 2. Re-opens those entries (isCurrent = true, endDate = null)
 * 3. Creates missing workHistory entries for approved salons that have none
 * 4. Closes workHistory entries for salons the barber no longer belongs to
 */
export default async function fixWorkHistory() {
  console.log("Running work history fix...");

  try {
    const barbers = await User.find({ role: "barber" });

    let fixedCount = 0;

    for (const barber of barbers) {
      const approvedSalons = (barber.salons || []).filter(
        (s) => s.status === "approved"
      );

      // Build set of approved salon IDs for quick lookup
      const approvedSalonIds = new Set(
        approvedSalons.map((s) => s.salon?.toString()).filter(Boolean)
      );

      if (approvedSalons.length === 0 && (!barber.workHistory || barber.workHistory.length === 0)) continue;

      let changed = false;

      // Step 1: Fix/create entries for approved salons
      for (const salonEntry of approvedSalons) {
        const salonId = salonEntry.salon?.toString();
        if (!salonId) continue;

        // Try matching by salon ObjectId (as string) or by salonName
        const historyEntry = barber.workHistory.find(
          (h) => {
            // Match by ObjectId
            if (h.salon && h.salon.toString() === salonId) return true;
            // Match by salonName if no ObjectId
            if (!h.salon && h.salonName) {
              return salonEntry.salonName === h.salonName;
            }
            return false;
          }
        );

        if (historyEntry) {
          // Entry exists - if it's not current, fix it
          if (!historyEntry.isCurrent) {
            historyEntry.isCurrent = true;
            historyEntry.endDate = null;
            changed = true;
          }
          // Ensure salon ObjectId is set
          if (!historyEntry.salon) {
            historyEntry.salon = salonId;
            changed = true;
          }
        } else {
          // No workHistory entry at all for an approved salon - create one
          const salon = await Salon.findById(salonId).select("name");
          barber.workHistory.push({
            salon: salonId,
            salonName: salon?.name || "Salon",
            startDate: salonEntry.joinedAt || new Date(),
            endDate: null,
            isCurrent: true,
          });
          changed = true;
        }
      }

      // Step 2: Close workHistory entries for salons the barber no longer belongs to
      for (const history of (barber.workHistory || [])) {
        const historySalonId = history.salon?.toString();
        if (!historySalonId) continue;

        if (history.isCurrent && !approvedSalonIds.has(historySalonId)) {
          history.isCurrent = false;
          if (!history.endDate) {
            history.endDate = new Date();
          }
          changed = true;
        }
      }

      if (changed) {
        await barber.save();
        fixedCount++;
      }
    }

    console.log(`Work history fix complete. Fixed ${fixedCount} barbers.`);
  } catch (error) {
    console.error("Work history fix error:", error.message);
  }
}

// Direct execution guard: run via `node migrations/fixWorkHistory.js`
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("fixWorkHistory.js");

if (isDirectRun) {
  connectDB()
    .then(() => fixWorkHistory())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
