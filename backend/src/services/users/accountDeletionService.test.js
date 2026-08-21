import assert from "node:assert/strict";
import test from "node:test";

import { AccountDeletionError, deleteAccountAtomically } from "./accountDeletionService.js";

test("account deletion fails closed when the authoritative user cannot be loaded", async () => {
  const session = { async withTransaction(task) { await task(); }, async endSession() {} };
  const models = { User: { findById: () => ({ select: () => ({ session: () => ({ lean: async () => null }) }) }) } };
  await assert.rejects(
    deleteAccountAtomically({ userId: "missing", models, startSession: async () => session }),
    (error) => error instanceof AccountDeletionError && error.statusCode === 403
  );
});

const unknownCommitError = Object.assign(new Error("unknown"), { errorLabels: ["UnknownTransactionCommitResult"] });
const absentUserModels = { User: { findById: () => ({ lean: async () => null }) }, AccountDeletionRecord: {} };
const unknownSession = { async withTransaction() { throw unknownCommitError; }, async endSession() {} };

test("unknown commit returns success only when the exact completed tombstone proves it", async () => {
  const result = await deleteAccountAtomically({
    userId: "user", models: absentUserModels, startSession: async () => unknownSession,
    beginFence: async () => ({ deletionId: "exact" }), isCommitProven: async ({ deletionId }) => deletionId === "exact",
  });
  assert.deepEqual(result, { deleted: true, recovered: true });
});

test("unknown commit accepts only a final deleted tombstone from the authoritative record", async () => {
  const result = await deleteAccountAtomically({
    userId: "user", startSession: async () => unknownSession,
    models: { ...absentUserModels, AccountDeletionRecord: { exists: async (filter) => filter.state === "deleted" && filter.deletionId === "exact" ? { _id: "record" } : null } },
    beginFence: async () => ({ deletionId: "exact" }),
  });
  assert.deepEqual(result, { deleted: true, recovered: true });
});

test("unknown commit without an exact completed tombstone is fail-closed and never compensates", async () => {
  let released = false;
  await assert.rejects(
    deleteAccountAtomically({
      userId: "user", models: absentUserModels, startSession: async () => unknownSession,
      beginFence: async () => ({ deletionId: "exact" }), isCommitProven: async () => false,
      releaseFence: async () => { released = true; },
    }),
    (error) => error instanceof AccountDeletionError && error.statusCode === 503
  );
  assert.equal(released, false);
});

for (const [name, tombstone] of [
  ["deleting tombstone", { state: "deleting", deletionId: "exact" }],
  ["missing tombstone", null],
  ["mismatched tombstone", { state: "deleted", deletionId: "other" }],
  ["malformed tombstone", { state: "deleted" }],
]) test(`unknown commit with ${name} returns 503`, async () => {
  await assert.rejects(
    deleteAccountAtomically({
      userId: "user", startSession: async () => unknownSession,
      models: { ...absentUserModels, AccountDeletionRecord: { exists: async (filter) => tombstone?.state === "deleted" && tombstone.deletionId === filter.deletionId ? tombstone : null } },
      beginFence: async () => ({ deletionId: "exact" }),
    }),
    (error) => error instanceof AccountDeletionError && error.statusCode === 503
  );
});
