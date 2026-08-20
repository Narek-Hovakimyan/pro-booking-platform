import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasValidRecentAuthentication,
  RECENT_AUTHENTICATION_WINDOW_MS,
  recordRecentAuthentication,
} from "./recentAuthenticationService.js";

const now = new Date("2026-08-20T12:00:00.000Z");

test("recent authentication is valid only before the ten-minute boundary at the same auth version", () => {
  const user = {
    authVersion: 3,
    recentAuthAt: new Date(now.getTime() - RECENT_AUTHENTICATION_WINDOW_MS + 1),
    recentAuthVersion: 3,
  };

  assert.equal(hasValidRecentAuthentication(user, { now }), true);
  user.recentAuthAt = new Date(now.getTime() - RECENT_AUTHENTICATION_WINDOW_MS);
  assert.equal(hasValidRecentAuthentication(user, { now }), false);
  user.recentAuthAt = new Date(now.getTime() - 1);
  user.recentAuthVersion = 2;
  assert.equal(hasValidRecentAuthentication(user, { now }), false);
});

test("recent authentication fails closed for malformed or future markers", () => {
  assert.equal(hasValidRecentAuthentication({ authVersion: 0 }, { now }), false);
  assert.equal(
    hasValidRecentAuthentication(
      { authVersion: 0, recentAuthAt: "invalid", recentAuthVersion: 0 },
      { now }
    ),
    false
  );
  assert.equal(
    hasValidRecentAuthentication(
      { authVersion: 0, recentAuthAt: new Date(now.getTime() + 1), recentAuthVersion: 0 },
      { now }
    ),
    false
  );
});

test("recording uses server time and conditionally binds the marker to authVersion", async () => {
  let received;
  const UserModel = {
    findOneAndUpdate(filter, update, options) {
      received = { filter, update, options };
      return Promise.resolve({ _id: "user-1" });
    },
  };

  const result = await recordRecentAuthentication(
    { _id: "user-1", authVersion: 2 },
    { now, UserModel }
  );

  assert.deepEqual(result, { _id: "user-1" });
  assert.deepEqual(received.filter, { _id: "user-1", authVersion: 2 });
  assert.deepEqual(received.update.$set, { recentAuthAt: now, recentAuthVersion: 2 });
  assert.deepEqual(received.options, { new: true, runValidators: true });
});

test("recording legacy zero versions guards against concurrent version changes", async () => {
  let filter;
  const UserModel = {
    findOneAndUpdate(receivedFilter) {
      filter = receivedFilter;
      return Promise.resolve(null);
    },
  };

  assert.equal(
    await recordRecentAuthentication({ _id: "user-1" }, { now, UserModel }),
    null
  );
  assert.deepEqual(filter, {
    _id: "user-1",
    $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }],
  });
});
