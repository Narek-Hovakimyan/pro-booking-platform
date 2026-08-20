import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __resetRecentAuthenticationControllerDependencies,
  __setRecentAuthenticationControllerDependencies,
  confirmRecentAuthentication,
} from "./recentAuthenticationController.js";

const fixedNow = new Date("2026-08-20T12:00:00.000Z");

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  ended: false,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  end() {
    this.ended = true;
    return this;
  },
});

const passwordUser = {
  _id: "password-user",
  authProviders: ["password", "google"],
  authVersion: 2,
  password: "stored-hash",
  googleId: "google-password-user",
};

const googleUser = {
  _id: "google-user",
  authProviders: ["google"],
  authVersion: 1,
  googleId: "google-only-user",
};

const configure = ({ user, comparePassword, now, verifyGoogleIdToken, record } = {}) => {
  __setRecentAuthenticationControllerDependencies({
    comparePassword: comparePassword || (async () => true),
    findUserById: async () => user,
    now: now || (() => fixedNow),
    recordRecentAuthentication: record || (async () => ({ _id: user?._id })),
    verifyGoogleIdToken: verifyGoogleIdToken || (async () => ({ googleId: user?.googleId })),
  });
};

afterEach(() => __resetRecentAuthenticationControllerDependencies());

test("password-capable accounts require the current password and record a version-bound marker", async () => {
  let recorded;
  configure({
    user: passwordUser,
    comparePassword: async (password, hash) => password === "correct" && hash === "stored-hash",
    record: async (user, options) => {
      recorded = { user, options };
      return { _id: user._id };
    },
  });
  const res = createResponse();

  await confirmRecentAuthentication(
    { body: { currentPassword: "correct" }, user: { _id: passwordUser._id } },
    res
  );

  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.deepEqual(recorded, { user: passwordUser, options: { now: fixedNow } });
});

test("wrong or missing password cannot update the recent-authentication marker", async () => {
  let recordCalls = 0;
  configure({
    user: passwordUser,
    comparePassword: async () => false,
    record: async () => {
      recordCalls += 1;
      return {};
    },
  });

  for (const body of [{ currentPassword: "wrong" }, {}, { googleCredential: "credential" }]) {
    const res = createResponse();
    await confirmRecentAuthentication({ body, user: { _id: passwordUser._id } }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { message: "Recent authentication failed" });
  }
  assert.equal(recordCalls, 0);
});

test("Google-only accounts require a verified credential for the same Google account", async () => {
  configure({ user: googleUser });
  const success = createResponse();
  await confirmRecentAuthentication(
    { body: { googleCredential: "verified-token" }, user: { _id: googleUser._id } },
    success
  );
  assert.equal(success.statusCode, 204);

  for (const verifyGoogleIdToken of [
    async () => ({ googleId: "different-account" }),
    async () => {
      throw new Error("invalid credential");
    },
  ]) {
    configure({ user: googleUser, verifyGoogleIdToken });
    const res = createResponse();
    await confirmRecentAuthentication(
      { body: { googleCredential: "untrusted" }, user: { _id: googleUser._id } },
      res
    );
    assert.equal(res.statusCode, 403);
  }

  const missing = createResponse();
  await confirmRecentAuthentication({ body: {}, user: { _id: googleUser._id } }, missing);
  assert.equal(missing.statusCode, 403);
});

test("failed conditional recording and unauthenticated requests fail closed", async () => {
  configure({ user: passwordUser, record: async () => null });
  const stale = createResponse();
  await confirmRecentAuthentication(
    { body: { currentPassword: "correct" }, user: { _id: passwordUser._id } },
    stale
  );
  assert.equal(stale.statusCode, 403);

  const unauthenticated = createResponse();
  await confirmRecentAuthentication({ body: { currentPassword: "correct" } }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 403);
});

test("repeated successful confirmation refreshes the server timestamp", async () => {
  const times = [fixedNow, new Date(fixedNow.getTime() + 1000)];
  const recordedTimes = [];
  configure({
    user: passwordUser,
    now: () => times.shift(),
    record: async (_user, { now }) => {
      recordedTimes.push(now);
      return { _id: passwordUser._id };
    },
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = createResponse();
    await confirmRecentAuthentication(
      { body: { currentPassword: "correct" }, user: { _id: passwordUser._id } },
      res
    );
    assert.equal(res.statusCode, 204);
  }
  assert.deepEqual(recordedTimes, [fixedNow, new Date(fixedNow.getTime() + 1000)]);
});
