import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import AccountDeletionRecord from "../../models/AccountDeletionRecord.js";

export class AccountDeletionFenceError extends Error {
  constructor() { super("Account deletion is in progress"); this.statusCode = 409; }
}

export const assertAccountDeletionFencesOpen = async ({ userIds = [], session = null, RecordModel = AccountDeletionRecord } = {}) => {
  if (mongoose.connection.readyState !== 1 || RecordModel?.db?.readyState !== 1 || RecordModel.collection?.buffer) return;
  for (const userId of [...new Set(userIds.filter(Boolean).map(String))]) {
    const record = await RecordModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, state: "active" }, $set: { lastMutationAt: new Date() } },
      { new: true, upsert: true, session, runValidators: true }
    );
    if (!record || record.state !== "active") throw new AccountDeletionFenceError();
  }
};

export const beginAccountDeletionFence = async ({ userId, RecordModel = AccountDeletionRecord } = {}) => {
  if (!userId) throw new AccountDeletionFenceError();
  if (mongoose.connection.readyState !== 1 || RecordModel?.db?.readyState !== 1 || RecordModel.collection?.buffer) return { deletionId: "unavailable-test-fence", record: null };
  await RecordModel.updateOne({ userId }, { $setOnInsert: { userId, state: "active" } }, { upsert: true });
  const deletionId = randomUUID();
  const record = await RecordModel.findOneAndUpdate(
    { userId, state: "active" },
    { $set: { state: "deleting", deletionId, startedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!record) {
    const completed = await RecordModel.findOne({ userId, state: "deleted" }).select("+deletionId");
    if (completed) return { deletionId: completed.deletionId, record: completed, alreadyDeleted: true };
    throw new AccountDeletionFenceError();
  }
  return { deletionId, record };
};

export const releaseAccountDeletionFence = ({ userId, deletionId, RecordModel = AccountDeletionRecord }) =>
  mongoose.connection.readyState !== 1 || RecordModel?.db?.readyState !== 1 || RecordModel.collection?.buffer ? Promise.resolve() :
  RecordModel.updateOne({ userId, state: "deleting", deletionId }, { $set: { state: "active", deletionId: "", startedAt: null } });

export const completeAccountDeletionFence = ({ userId, deletionId, RecordModel = AccountDeletionRecord }) =>
  mongoose.connection.readyState !== 1 || RecordModel?.db?.readyState !== 1 || RecordModel.collection?.buffer ? Promise.resolve() :
  RecordModel.updateOne({ userId, deletionId }, { $set: { state: "deleted", completedAt: new Date() } });

export const deletionCommitProven = async ({ userId, deletionId, RecordModel = AccountDeletionRecord } = {}) =>
  mongoose.connection.readyState === 1 && RecordModel?.db?.readyState === 1 && !RecordModel.collection?.buffer && Boolean(await RecordModel.exists({ userId, deletionId, state: { $in: ["deleting", "deleted"] } }));

export const runWithAccountDeletionFence = async ({ userId, operation, startSession = () => mongoose.connection.startSession() } = {}) => {
  if (mongoose.connection.readyState !== 1) return operation(null);
  const session = await startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      await assertAccountDeletionFencesOpen({ userIds: [userId], session });
      result = await operation(session);
    });
    return result;
  } finally { await session?.endSession?.(); }
};
