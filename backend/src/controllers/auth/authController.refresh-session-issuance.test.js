import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { afterEach, beforeEach, test } from "node:test";

import { getLogger, resetLogger } from "../../config/logger.js";
import User from "../../models/User.js";
import { setGoogleAuthClientFactoryForTesting } from "../../services/auth/googleAuthService.js";
import {
  __resetAuthSessionIssuanceDependencies,
  __setAuthSessionIssuanceDependencies,
} from "../../services/auth/authSessionIssuanceService.js";
import {
  __resetAuthControllerDependencies,
  __setAuthControllerDependencies,
  googleAuth,
  loginUser,
  registerUser,
} from "./authController.js";

const originalUserMethods = { findOne: User.findOne, create: User.create };
const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
const userId = "64d000000000000000000001";

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const selectable = (value, onSelect = () => {}) => ({
  select(selection) {
    onSelect(selection);
    return value;
  },
});
const user = (overrides = {}) => ({
  _id: userId,
  name: "Current User",
  phone: "+37400111222",
  email: "current@example.com",
  emailVerified: true,
  role: "client",
  salons: [],
  favoriteBarbers: [],
  favoriteSalons: [],
  workHistory: [],
  password: "password-hash",
  async save() {},
  ...overrides,
});

beforeEach(() => {
  setGoogleAuthClientFactoryForTesting(() => ({
    verifyIdToken: async () => ({
      getPayload: () => ({
        sub: "google-sub",
        email: "google@example.com",
        email_verified: true,
        name: "Google User",
      }),
    }),
  }));
});

afterEach(() => {
  __resetAuthControllerDependencies();
  __resetAuthSessionIssuanceDependencies();
  User.findOne = originalUserMethods.findOne;
  User.create = originalUserMethods.create;
  resetLogger();
  setGoogleAuthClientFactoryForTesting();
  if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
});

function captureIssuance(implementation) {
  const calls = [];
  __setAuthControllerDependencies({
    issueAuthSession: async (payload) => {
      calls.push(payload);
      return implementation ? implementation(payload) : {
        token: "access-token",
        user: { id: payload.user._id },
      };
    },
  });
  return calls;
}

function assertIssuanceCall(call, { req, res, user: currentUser }) {
  assert.deepEqual(Object.keys(call).sort(), ["req", "res", "user"]);
  assert.equal(call.req, req);
  assert.equal(call.res, res);
  assert.equal(call.user, currentUser);
}

test("register and password login issue exactly once with no response cookie helper", async () => {
  const calls = captureIssuance();
  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 4);
  const createdUser = user({ password: passwordHash });
  User.findOne = async () => null;
  User.create = async () => createdUser;

  const registerReq = {
    body: {
      name: "New User",
      phone: createdUser.phone,
      email: createdUser.email,
      password,
      role: "client",
      userId: "forged-user",
      familyId: "forged-family",
      sessionId: "forged-session",
    },
  };
  const registerRes = response();
  await registerUser(registerReq, registerRes);
  assert.equal(registerRes.statusCode, 201);
  assert.deepEqual(registerRes.body, { token: "access-token", user: { id: userId } });
  assert.equal(calls.length, 1);
  assertIssuanceCall(calls[0], { req: registerReq, res: registerRes, user: createdUser });

  const loginUserDocument = user({ password: passwordHash });
  let loginSelection = "";
  User.findOne = () => selectable(loginUserDocument, (selection) => { loginSelection = selection; });
  const loginReq = {
    body: {
      phone: createdUser.phone,
      password,
      role: "barber",
      userId: "forged-user",
      familyId: "forged-family",
      sessionId: "forged-session",
    },
    query: { userId: "forged-query-user" },
  };
  const loginRes = response();
  await loginUser(loginReq, loginRes);
  assert.equal(loginRes.statusCode, 200);
  assert.equal(loginSelection, "+authVersion");
  assert.equal(calls.length, 2);
  assertIssuanceCall(calls[1], { req: loginReq, res: loginRes, user: loginUserDocument });
});

test("all Google success branches issue exactly once for their authenticated user", async () => {
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  const calls = captureIssuance();
  const existingGoogleUser = user({ googleId: "google-sub" });
  const existingEmailUser = user({
    _id: "64d000000000000000000002",
    email: "google@example.com",
    googleId: "",
  });
  const newGoogleUser = user({
    _id: "64d000000000000000000003",
    email: "google@example.com",
    googleId: "google-sub",
  });

  const requestBody = {
    credential: "valid",
    role: "client",
    phone: "+37400999888",
    userId: "forged-user",
    familyId: "forged-family",
    sessionId: "forged-session",
  };
  const selections = [];
  User.findOne = (query) => query.googleId
    ? selectable(existingGoogleUser, (selection) => selections.push(selection))
    : selectable(null, (selection) => selections.push(selection));
  const googleIdReq = { body: requestBody, query: { userId: "forged-query-user" } };
  const googleIdRes = response();
  await googleAuth(googleIdReq, googleIdRes);
  assert.equal(googleIdRes.statusCode, 200);
  assert.deepEqual(selections, ["+googleId +authVersion"]);
  assert.equal(calls.length, 1);
  assertIssuanceCall(calls[0], { req: googleIdReq, res: googleIdRes, user: existingGoogleUser });

  selections.length = 0;
  User.findOne = (query) => query.googleId
    ? selectable(null, (selection) => selections.push(selection))
    : selectable(existingEmailUser, (selection) => selections.push(selection));
  const emailReq = { body: requestBody };
  const emailRes = response();
  await googleAuth(emailReq, emailRes);
  assert.equal(emailRes.statusCode, 200);
  assert.deepEqual(selections, ["+googleId +authVersion", "+googleId +authVersion"]);
  assert.equal(calls.length, 2);
  assertIssuanceCall(calls[1], { req: emailReq, res: emailRes, user: existingEmailUser });

  User.findOne = (query) => query.phone ? null : selectable(null);
  User.create = async () => newGoogleUser;
  const newUserReq = { body: requestBody };
  const newUserRes = response();
  await googleAuth(newUserReq, newUserRes);
  assert.equal(newUserRes.statusCode, 201);
  assert.equal(calls.length, 3);
  assertIssuanceCall(calls[2], { req: newUserReq, res: newUserRes, user: newGoogleUser });
});

test("issuer failures return endpoint-specific generic errors without Bearer fallback", async () => {
  getLogger({ level: "silent" });
  const calls = captureIssuance(async () => {
    throw new Error("issuance unavailable");
  });
  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 4);
  const currentUser = user({ password: passwordHash, googleId: "google-sub" });

  User.findOne = async () => null;
  User.create = async () => currentUser;
  const registerRes = response();
  await registerUser({ body: { name: "New User", phone: currentUser.phone, email: currentUser.email, password, role: "client" } }, registerRes);
  assert.equal(registerRes.statusCode, 500);
  assert.deepEqual(registerRes.body, { message: "Registration failed" });

  User.findOne = async () => currentUser;
  const loginRes = response();
  await loginUser({ body: { phone: currentUser.phone, password } }, loginRes);
  assert.equal(loginRes.statusCode, 500);
  assert.deepEqual(loginRes.body, { message: "Login failed" });

  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  User.findOne = (query) => query.googleId ? selectable(currentUser) : selectable(null);
  const googleRes = response();
  await googleAuth({ body: { credential: "valid" } }, googleRes);
  assert.equal(googleRes.statusCode, 500);
  assert.deepEqual(googleRes.body, { message: "Google authentication failed" });
  assert.equal(calls.length, 3);
  assert.equal("token" in registerRes.body, false);
  assert.equal("token" in loginRes.body, false);
  assert.equal("token" in googleRes.body, false);
});

test("failed authentication and validation branches never issue a session", async () => {
  const calls = captureIssuance();

  const registerRes = response();
  await registerUser({ body: {} }, registerRes);
  assert.equal(registerRes.statusCode, 400);

  const loginRes = response();
  await loginUser({ body: {} }, loginRes);
  assert.equal(loginRes.statusCode, 400);

  const googleRes = response();
  await googleAuth({ body: {} }, googleRes);
  assert.equal(googleRes.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("dependency reset restores the real issuer without requiring res.cookie", async () => {
  const events = [];
  __setAuthSessionIssuanceDependencies({
    signAccessToken: () => "real-issuer-token",
    serializeAuthUser: (currentUser) => ({ id: currentUser._id }),
    resolveRuntimeRefreshCookieOptions: () => ({ secure: false }),
    readRuntimeRefreshToken: () => null,
    createRefreshSession: async (payload) => {
      events.push(["create", payload]);
      return { refreshToken: "replacement", session: {} };
    },
    setRuntimeRefreshCookie: (res, token) => events.push(["set", res, token]),
  });
  __resetAuthControllerDependencies();
  const password = "Password123!";
  const currentUser = user({ password: await bcrypt.hash(password, 4) });
  User.findOne = async () => currentUser;
  const req = { ip: "198.51.100.10", body: { phone: currentUser.phone, password } };
  const res = response();

  await loginUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { token: "real-issuer-token", user: { id: userId } });
  assert.deepEqual(events, [
    ["create", { userId, ip: "198.51.100.10", userAgent: undefined }],
    ["set", res, "replacement"],
  ]);
});
