import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import AccountDeletionRecord from "../../models/AccountDeletionRecord.js";
import { AccountDeletionFenceError, beginAccountDeletionFence } from "./accountDeletionFenceService.js";
import { guardBookingMutation, guardSubscriptionMutation } from "./accountDeletionGuardedMutations.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

test("real Mongo guard rejects an obligation after its account deletion fence wins", { skip: !enabled }, async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/account_deletion_guard_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await AccountDeletionRecord.deleteMany({});
  await beginAccountDeletionFence({ userId: "000000000000000000000001" });
  await assert.rejects(
    guardBookingMutation({ barberId: "000000000000000000000001", clientId: "000000000000000000000002", isManualBooking: false }),
    (error) => error instanceof AccountDeletionFenceError && error.statusCode === 409
  );
});

test("real Mongo fence rejects booking and payment obligations after deletion wins", { skip: !enabled }, async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/account_deletion_guard_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await AccountDeletionRecord.deleteMany({});
  const userId = "000000000000000000000003";
  await beginAccountDeletionFence({ userId });
  for (const guard of [
    () => guardBookingMutation({ barberId: userId, clientId: "000000000000000000000004", isManualBooking: false }),
    () => guardSubscriptionMutation({ payerId: userId, ownerType: "barber", ownerId: userId }),
  ]) await assert.rejects(guard(), (error) => error instanceof AccountDeletionFenceError && error.statusCode === 409);
});
