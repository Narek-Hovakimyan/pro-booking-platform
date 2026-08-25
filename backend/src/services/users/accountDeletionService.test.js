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

const createSeatCleanupHarness = ({ seatedUser = false, failAfterSeatCleanup = false } = {}) => {
  const deletingUserId = "deleting-user";
  const otherBarberId = "other-barber";
  const seats = [
    ...(seatedUser ? [{ barberId: deletingUserId, assignedBy: otherBarberId, status: "active" }] : []),
    { barberId: otherBarberId, assignedBy: deletingUserId, status: "active" },
  ];
  const seatUpdates = [];
  const genericModel = {
    find: async () => [],
    findOne: async () => null,
    updateMany: async () => ({ modifiedCount: 0 }),
    deleteMany: async () => ({ deletedCount: 0 }),
  };
  const session = {
    async withTransaction(task) {
      const snapshot = seats.map((seat) => ({ ...seat }));
      try {
        return await task();
      } catch (error) {
        seats.splice(0, seats.length, ...snapshot);
        throw error;
      }
    },
    async endSession() {},
  };
  const models = new Proxy({
    User: {
      findById: () => ({
        select: () => ({
          session: () => ({
            authVersion: 0,
            recentAuthAt: new Date(),
            recentAuthVersion: 0,
          }),
        }),
      }),
      updateMany: genericModel.updateMany,
      deleteOne: async () => {
        if (failAfterSeatCleanup) throw new Error("downstream failure");
        return { deletedCount: 1 };
      },
    },
    SubscriptionSeat: {
      async updateMany(filter, update, options) {
        seatUpdates.push({ filter, update, options });
        for (const seat of seats) {
          if (seat.barberId === filter.barberId && seat.status === filter.status) {
            Object.assign(seat, update.$set);
          }
        }
        return { modifiedCount: 1 };
      },
    },
  }, {
    get(target, property) {
      return target[property] || genericModel;
    },
  });

  return {
    userId: deletingUserId,
    deletingUserId,
    otherBarberId,
    seats,
    seatUpdates,
    models,
    startSession: async () => session,
    beginFence: async () => ({ deletionId: "seat-cleanup" }),
    completeFence: async () => {},
    releaseFence: async () => {},
  };
};

test("deleting an assigning admin does not target another barber's active seat", async () => {
  const harness = createSeatCleanupHarness();

  await deleteAccountAtomically(harness);

  assert.deepEqual(harness.seatUpdates, [{
    filter: { barberId: harness.deletingUserId, status: "active" },
    update: { $set: { status: "revoked", revokedAt: harness.seatUpdates[0].update.$set.revokedAt } },
    options: { session: await harness.startSession() },
  }]);
  assert.equal(harness.seats[0].status, "active");
  assert.equal(harness.seats.filter((seat) => seat.barberId === harness.otherBarberId && seat.status === "active").length, 1);
});

test("deleting a seated barber revokes only that barber's active seat in the transaction", async () => {
  const harness = createSeatCleanupHarness({ seatedUser: true });

  await deleteAccountAtomically(harness);

  assert.deepEqual(harness.seatUpdates[0].filter, {
    barberId: harness.deletingUserId,
    status: "active",
  });
  assert.equal(harness.seatUpdates[0].options.session != null, true);
  assert.equal(harness.seats[0].status, "revoked");
  assert.equal(harness.seats[1].status, "active");
});

test("downstream deletion failure rolls seat cleanup back with the transaction", async () => {
  const harness = createSeatCleanupHarness({ seatedUser: true, failAfterSeatCleanup: true });

  await assert.rejects(deleteAccountAtomically(harness), /downstream failure/);

  assert.deepEqual(harness.seatUpdates[0].filter, {
    barberId: harness.deletingUserId,
    status: "active",
  });
  assert.equal(harness.seats[0].status, "active");
  assert.equal(harness.seats[1].status, "active");
});

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
