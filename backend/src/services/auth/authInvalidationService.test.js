import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getLogger, resetLogger } from "../../config/logger.js";
import {
  __resetAuthInvalidationDependencies,
  __setAuthInvalidationDependencies,
  disconnectUserSocketsBestEffort,
  incrementUserAuthVersion,
  normalizeInvalidationAuthVersion,
  revokeAllUserRefreshSessionsBestEffort,
} from "./authInvalidationService.js";

afterEach(() => {
  __resetAuthInvalidationDependencies();
  resetLogger();
});

test("normalizes legacy missing authVersion as zero and rejects malformed values", () => {
  assert.equal(normalizeInvalidationAuthVersion(undefined, { allowMissing: true }), 0);
  assert.equal(normalizeInvalidationAuthVersion(3), 3);

  for (const value of [-1, 1.5, NaN, "1", null]) {
    assert.throws(() => normalizeInvalidationAuthVersion(value), /authVersion/);
  }
});

test("incrementUserAuthVersion atomically increments an existing user", async () => {
  const calls = [];
  __setAuthInvalidationDependencies({
    User: {
      updateOne: async (filter, update) => {
        calls.push({ filter, update });
        return { matchedCount: 1, modifiedCount: 1 };
      },
    },
  });

  assert.equal(await incrementUserAuthVersion("user-1"), true);
  assert.deepEqual(calls, [
    { filter: { _id: "user-1" }, update: { $inc: { authVersion: 1 } } },
  ]);
});

test("incrementUserAuthVersion fails closed when no user matches", async () => {
  __setAuthInvalidationDependencies({
    User: {
      updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
    },
  });

  await assert.rejects(() => incrementUserAuthVersion("missing-user"), /invalidation failed/);
});

test("best-effort refresh-session cleanup logs generic failures without throwing", async () => {
  getLogger({ level: "silent" });
  __setAuthInvalidationDependencies({
    revokeAllUserRefreshSessions: async () => {
      throw new Error("database unavailable for token secret");
    },
  });

  const result = await revokeAllUserRefreshSessionsBestEffort({
    userId: "user-1",
    reason: "password_reset",
    event: "auth.test_cleanup_failed",
  });

  assert.equal(result, false);
});

test("disconnectUserSocketsBestEffort delegates the normalized user ID and returns true for success or no-op", async () => {
  const calls = [];
  __setAuthInvalidationDependencies({
    disconnectAuthenticatedUserSockets: (userId) => {
      calls.push(userId);
      return { ok: true, room: `user:${userId}`, disconnected: userId === "user-1" };
    },
  });

  assert.equal(
    await disconnectUserSocketsBestEffort({
      userId: " user-1 ",
      event: "auth.socket_cleanup_failed",
    }),
    true
  );
  assert.equal(
    await disconnectUserSocketsBestEffort({
      userId: "user-2",
      event: "auth.socket_cleanup_failed",
    }),
    true
  );
  assert.equal(await disconnectUserSocketsBestEffort({ userId: "   " }), false);
  assert.deepEqual(calls, ["user-1", "user-2"]);
});

test("disconnectUserSocketsBestEffort returns false and logs generic metadata when socket cleanup fails", async () => {
  getLogger({ level: "silent" });
  __setAuthInvalidationDependencies({
    disconnectAuthenticatedUserSockets: () => {
      throw new Error("socket adapter failed");
    },
  });

  const result = await disconnectUserSocketsBestEffort({
    userId: "user-1",
    event: "auth.password_reset_socket_cleanup_failed",
  });

  assert.equal(result, false);
});
