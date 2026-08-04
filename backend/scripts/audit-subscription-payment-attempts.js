import mongoose from "mongoose";
import SubscriptionPaymentAttempt from "../src/models/SubscriptionPaymentAttempt.js";

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
const applyIndexes = process.argv.includes("--apply-indexes");

if (!uri) {
  console.error("MONGO_URI or MONGODB_URI is required");
  process.exitCode = 1;
} else {
  await mongoose.connect(uri);
  const invalid = [];
  const cursor = SubscriptionPaymentAttempt.find().lean().cursor();
  for await (const attempt of cursor) {
    const document = new SubscriptionPaymentAttempt(attempt);
    const validationError = document.validateSync();
    if (validationError) {
      invalid.push({
        id: String(attempt._id),
        errors: Object.values(validationError.errors).map((error) => error.message),
      });
    }
  }

  const duplicateGroups = await SubscriptionPaymentAttempt.aggregate([
    { $match: { providerIntentId: { $type: "string", $gt: "" } } },
    { $group: { _id: { provider: "$provider", value: "$providerIntentId" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  duplicateGroups.push(...await SubscriptionPaymentAttempt.aggregate([
    { $match: { providerPaymentId: { $type: "string", $gt: "" } } },
    { $group: { _id: { provider: "$provider", value: "$providerPaymentId" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]));

  console.log(
    JSON.stringify(
      {
        invalidCount: invalid.length,
        invalidRows: invalid,
        duplicateGroups,
      },
      null,
      2
    )
  );
  if (invalid.length || duplicateGroups.length) {
    console.error("Unsafe data detected; indexes were not created.");
    process.exitCode = 2;
  } else if (applyIndexes) {
    const desiredKeys = [
      { provider: 1, providerIntentId: 1 },
      { provider: 1, providerPaymentId: 1 },
    ];
    const indexes = await SubscriptionPaymentAttempt.collection.indexes();
    for (const index of indexes) {
      if (
        desiredKeys.some((key) => JSON.stringify(index.key) === JSON.stringify(key)) &&
        !index.unique
      ) {
        await SubscriptionPaymentAttempt.collection.dropIndex(index.name);
      }
    }
    await SubscriptionPaymentAttempt.createIndexes();
    console.log("Payment-attempt indexes created.");
  } else {
    console.log("Dry run complete. Re-run with --apply-indexes after review.");
  }
  await mongoose.disconnect();
}
