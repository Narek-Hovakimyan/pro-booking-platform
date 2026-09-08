import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __resetRecentAuthenticationMiddlewareDependencies,
  __setRecentAuthenticationMiddlewareDependencies,
  requireRecentAuthentication,
} from "./recentAuthenticationMiddleware.js";

const now = new Date("2026-09-07T12:00:00.000Z");

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const configure = (user) => {
  __setRecentAuthenticationMiddlewareDependencies({
    findUserById: async () => user,
    now: () => now,
  });
};

afterEach(() => __resetRecentAuthenticationMiddlewareDependencies());

test("requires an authenticated request", async () => {
  const res = createResponse();
  let nextCalled = false;

  await requireRecentAuthentication({}, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("fails closed for missing, expired, or version-mismatched authoritative markers", async () => {
  const cases = [
    { authVersion: 2 },
    {
      authVersion: 2,
      recentAuthAt: new Date(now.getTime() - 10 * 60 * 1000),
      recentAuthVersion: 2,
    },
    { authVersion: 3, recentAuthAt: now, recentAuthVersion: 2 },
  ];

  for (const user of cases) {
    configure(user);
    const res = createResponse();
    let nextCalled = false;
    await requireRecentAuthentication({ user: { _id: "user-1" } }, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
      code: "RECENT_AUTH_REQUIRED",
      message: "Recent authentication is required",
    });
  }
});

test("allows only a fresh marker from the authoritative user document", async () => {
  configure({ authVersion: 4, recentAuthAt: new Date(now.getTime() - 1), recentAuthVersion: 4 });
  const res = createResponse();
  let nextCalled = false;

  await requireRecentAuthentication({ user: { _id: "user-1", recentAuthAt: now } }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("fails closed when the authoritative user cannot be resolved", async () => {
  configure(null);
  const res = createResponse();

  await requireRecentAuthentication({ user: { _id: "user-1" } }, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "RECENT_AUTH_REQUIRED");
});
