import dotenv from "dotenv";
import mongoose from "mongoose";

import connectDB from "../src/config/db.js";
import { grantSubscriptionGraceToExistingBarbers } from "../src/services/subscriptionService.js";

dotenv.config();

const run = async () => {
  await connectDB();

  const summary = await grantSubscriptionGraceToExistingBarbers();

  console.log("Subscription grace grant complete");
  console.log(`Total barbers found: ${summary.totalBarbersFound}`);
  console.log(`Granted: ${summary.grantedCount}`);
  console.log(`Skipped: ${summary.skippedCount}`);
  console.log(`Errors: ${summary.errorsCount}`);

  if (summary.errorsCount > 0) {
    for (const error of summary.errors) {
      console.error(`- ${error.barberId}: ${error.message}`);
    }
  }

  await mongoose.connection.close();

  if (summary.errorsCount > 0) {
    process.exit(1);
  }
};

run().catch(async (error) => {
  console.error("Subscription grace grant failed:", error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
