import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import AccountDeletionRecord from "../../models/AccountDeletionRecord.js";
import { beginAccountDeletionFence, completeAccountDeletionFence, deletionCommitProven } from "./accountDeletionFenceService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

test("real Mongo tombstone proof requires the exact deletion id", { skip: !enabled }, async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/account_deletion_fence_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await AccountDeletionRecord.deleteMany({});
  const userId = "000000000000000000000011";
  const fence = await beginAccountDeletionFence({ userId });
  assert.equal(await deletionCommitProven({ userId, deletionId: "wrong" }), false);
  assert.equal(await deletionCommitProven({ userId, deletionId: fence.deletionId }), true);
  await completeAccountDeletionFence({ userId, deletionId: fence.deletionId });
  assert.equal(await deletionCommitProven({ userId, deletionId: fence.deletionId }), true);
});
