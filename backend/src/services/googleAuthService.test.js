import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  setGoogleAuthClientFactoryForTesting,
  verifyGoogleIdToken,
} from "./googleAuthService.js";

const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

afterEach(() => {
  setGoogleAuthClientFactoryForTesting();
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  if (originalGoogleClientId === undefined) {
    delete process.env.GOOGLE_CLIENT_ID;
  } else {
    process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
  }
});

const mockGooglePayload = (payload) => {
  setGoogleAuthClientFactoryForTesting(() => ({
    verifyIdToken: async (options) => ({
      options,
      getPayload: () => payload,
    }),
  }));
};

test("verifyGoogleIdToken rejects missing GOOGLE_CLIENT_ID", async () => {
  delete process.env.GOOGLE_CLIENT_ID;

  await assert.rejects(
    () => verifyGoogleIdToken("google-token"),
    /Google client ID is not configured/
  );
});

test("verifyGoogleIdToken rejects missing token", async () => {
  process.env.GOOGLE_CLIENT_ID = "client-id";

  await assert.rejects(
    () => verifyGoogleIdToken(" "),
    /Google ID token is required/
  );
});

test("verifyGoogleIdToken rejects invalid token safely", async () => {
  const rawToken = "raw-google-token";
  const logs = [];
  const warnings = [];
  const errors = [];

  process.env.GOOGLE_CLIENT_ID = "client-id";
  console.log = (...args) => logs.push(args.join(" "));
  console.warn = (...args) => warnings.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  setGoogleAuthClientFactoryForTesting(() => ({
    verifyIdToken: async () => {
      throw new Error(`invalid ${rawToken}`);
    },
  }));

  await assert.rejects(
    () => verifyGoogleIdToken(rawToken),
    /Invalid Google ID token/
  );
  assert.deepEqual(logs, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
});

test("verifyGoogleIdToken rejects unverified email", async () => {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  mockGooglePayload({
    sub: "google-sub",
    email: "test@example.com",
    email_verified: false,
  });

  await assert.rejects(
    () => verifyGoogleIdToken("google-token"),
    /Google email is not verified/
  );
});

test("verifyGoogleIdToken rejects missing email", async () => {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  mockGooglePayload({
    sub: "google-sub",
    email_verified: true,
  });

  await assert.rejects(
    () => verifyGoogleIdToken("google-token"),
    /Google email is missing/
  );
});

test("verifyGoogleIdToken returns normalized safe payload", async () => {
  const calls = [];

  process.env.GOOGLE_CLIENT_ID = "client-id";
  setGoogleAuthClientFactoryForTesting(() => ({
    verifyIdToken: async (options) => {
      calls.push(options);
      return {
        getPayload: () => ({
          sub: " google-sub ",
          email: "  Test@Example.COM  ",
          email_verified: true,
          name: " Test User ",
          picture: " https://example.com/avatar.png ",
        }),
      };
    },
  }));

  const result = await verifyGoogleIdToken(" google-token ");

  assert.deepEqual(calls, [
    {
      idToken: "google-token",
      audience: "client-id",
    },
  ]);
  assert.deepEqual(result, {
    googleId: "google-sub",
    email: "test@example.com",
    emailVerified: true,
    name: "Test User",
    picture: "https://example.com/avatar.png",
  });
});
