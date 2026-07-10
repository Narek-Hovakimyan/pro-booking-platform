import dotenv from "dotenv";
import mongoose from "mongoose";

import connectDB from "../src/config/db.js";
import User from "../src/models/User.js";

dotenv.config();

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const summarizeSalonEntry = (entry) => ({
  salon: getIdString(entry?.salon),
  status: entry?.status || "",
  relationshipStatus: entry?.relationshipStatus || "",
  relationshipType: entry?.relationshipType || "",
  worksAsSpecialist: entry?.worksAsSpecialist,
});

const hasMatchingApprovedSalonEntry = (user) => {
  const legacySalonId = getIdString(user?.salon);

  if (!legacySalonId || user?.salonStatus !== "approved") return false;

  return (user.salons || []).some(
    (entry) =>
      entry?.status === "approved" && getIdString(entry?.salon) === legacySalonId
  );
};

const auditLegacySalonFields = async () => {
  const users = await User.find({
    $or: [
      { salon: { $exists: true, $ne: null } },
      { salonStatus: { $exists: true, $ne: null } },
    ],
  })
    .select("_id role salon salonStatus salons")
    .lean();

  const summary = {
    totalUsersScanned: users.length,
    usersWithLegacySalon: 0,
    usersWithLegacySalonStatus: 0,
    usersWithLegacyApprovedSalonStatus: 0,
    usersWithSalonsArrayEntries: 0,
    legacyApprovedMissingMatchingEntry: 0,
    legacyApprovedWithMatchingEntry: 0,
  };
  const mismatches = [];

  for (const user of users) {
    const hasLegacySalon = Boolean(user.salon);
    const hasLegacySalonStatus = Boolean(user.salonStatus);
    const hasSalonEntries = Array.isArray(user.salons) && user.salons.length > 0;
    const isLegacyApproved = user.salonStatus === "approved";
    const hasMatchingEntry = hasMatchingApprovedSalonEntry(user);

    if (hasLegacySalon) summary.usersWithLegacySalon += 1;
    if (hasLegacySalonStatus) summary.usersWithLegacySalonStatus += 1;
    if (isLegacyApproved) summary.usersWithLegacyApprovedSalonStatus += 1;
    if (hasSalonEntries) summary.usersWithSalonsArrayEntries += 1;

    if (isLegacyApproved && hasMatchingEntry) {
      summary.legacyApprovedWithMatchingEntry += 1;
    }

    if (isLegacyApproved && !hasMatchingEntry) {
      summary.legacyApprovedMissingMatchingEntry += 1;
      mismatches.push({
        userId: getIdString(user._id),
        role: user.role || "",
        legacySalon: getIdString(user.salon),
        legacySalonStatus: user.salonStatus || "",
        salons: (user.salons || []).map(summarizeSalonEntry),
      });
    }
  }

  console.log("Legacy salon field audit");
  console.log(`Total users scanned: ${summary.totalUsersScanned}`);
  console.log(`Users with legacy salon: ${summary.usersWithLegacySalon}`);
  console.log(
    `Users with legacy salonStatus: ${summary.usersWithLegacySalonStatus}`
  );
  console.log(
    `Users with legacy salonStatus approved: ${summary.usersWithLegacyApprovedSalonStatus}`
  );
  console.log(
    `Users with User.salons entries: ${summary.usersWithSalonsArrayEntries}`
  );
  console.log(
    `Legacy approved with matching User.salons entry: ${summary.legacyApprovedWithMatchingEntry}`
  );
  console.log(
    `Legacy approved missing matching User.salons entry: ${summary.legacyApprovedMissingMatchingEntry}`
  );

  if (mismatches.length > 0) {
    console.error("FAIL: legacy approved salon mismatches found");
    for (const mismatch of mismatches) {
      console.error(JSON.stringify(mismatch));
    }
    process.exitCode = 1;
    return;
  }

  console.log("PASS: no legacy approved salon mismatches found");
};

const run = async () => {
  await connectDB();
  await auditLegacySalonFields();
};

run()
  .catch((error) => {
    console.error("Legacy salon field audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
