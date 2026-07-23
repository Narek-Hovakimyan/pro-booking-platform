import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, test } from "node:test";

import { getLogger, resetLogger } from "../../config/logger.js";
import User from "../../models/User.js";
import { serializeAuthUser, signAccessToken } from "../../services/auth/authResponseService.js";
import {
  __resetAuthControllerDependencies,
  __setAuthControllerDependencies,
  loginUser,
  registerUser,
} from "./authController.js";

const originalFindOne = User.findOne;
const originalCreate = User.create;
const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "auth-controller-session-test-secret";
const userId = "64d000000000000000000001";
let issuedSessionCalls;

const createResponse = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const assertJwtContract = (token, expectedUserId) => {
  assert.equal(typeof token, "string");
  const decoded = jwt.verify(token, jwtSecret);
  assert.equal(decoded.id, expectedUserId);
  assert.equal(decoded.av, 0);
  assert.ok(Math.abs((decoded.exp - decoded.iat) - 15 * 60) <= 5);
};

const assertPublicAuthUser = (user, expected) => {
  assert.equal(user.id, expected.id);
  assert.equal(user.name, expected.name);
  assert.equal(user.phone, expected.phone);
  assert.equal(user.email, expected.email);
  assert.equal(user.role, expected.role);
  assert.equal(user.token, undefined);
  assert.equal(user.password, undefined);
  assert.equal(user.googleId, undefined);
  assert.equal(user.authProviders, undefined);
  assert.equal(user.platformRole, undefined);
  assert.equal(user.resetPasswordTokenHash, undefined);
  assert.equal(user.resetPasswordExpires, undefined);
  assert.equal(user.resetPasswordSentAt, undefined);
  assert.equal(user.emailVerificationTokenHash, undefined);
};

beforeEach(() => {
  issuedSessionCalls = [];
  __setAuthControllerDependencies({
    issueAuthSession: ({ req, res, user }) => {
      issuedSessionCalls.push({ req, res, user });
      return {
        token: signAccessToken(user._id),
        user: serializeAuthUser(user),
      };
    },
  });
});

afterEach(() => {
  __resetAuthControllerDependencies();
  User.findOne = originalFindOne;
  User.create = originalCreate;
  resetLogger();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("loginUser returns a 15-minute JWT and public user contract for valid password authentication", async () => {
  process.env.JWT_SECRET = jwtSecret;
  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    _id: userId,
    name: "Test Barber",
    phone: "+37400111222",
    email: "barber@example.com",
    emailVerified: true,
    city: "Yerevan",
    avatarUrl: "https://example.com/avatar.png",
    role: "barber",
    salon: "64d000000000000000000010",
    salonStatus: "approved",
    salons: [{ salon: "64d000000000000000000010", status: "approved" }],
    favoriteBarbers: [],
    favoriteSalons: [],
    workHistory: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    password: passwordHash,
    googleId: "google-secret",
    authProviders: ["password", "google"],
    resetPasswordTokenHash: "secret-reset-hash",
  };

  User.findOne = async (query) => {
    assert.deepEqual(query, { phone: "+37400111222" });
    return user;
  };

  const res = createResponse();
  const req = { body: { phone: "  +37400111222  ", password } };
  await loginUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(issuedSessionCalls, [{ req, res, user }]);
  assertJwtContract(res.body.token, userId);
  assertPublicAuthUser(res.body.user, {
    id: userId,
    name: "Test Barber",
    phone: "+37400111222",
    email: "barber@example.com",
    role: "barber",
  });
  assert.deepEqual(res.body.user.salons, user.salons);
  assert.equal("token" in res.body.user, false);
});

test("registerUser creates a client with normalized auth fields and returns a 15-minute JWT contract", async () => {
  process.env.JWT_SECRET = jwtSecret;
  const password = "Password123!";
  let createPayload;
  let createdUser;

  User.findOne = async (query) => {
    assert.ok(query.phone === "+37400111222" || query.email === "client@example.com");
    return null;
  };
  User.create = async (payload) => {
    createPayload = payload;
    createdUser = {
      _id: userId,
      ...payload,
      emailVerified: false,
      emailVerifiedAt: null,
      city: "",
      avatarUrl: "",
      salon: null,
      salonStatus: "none",
      salons: [],
      favoriteBarbers: [],
      favoriteSalons: [],
      workHistory: [],
      createdAt: new Date("2026-02-03T04:05:06.000Z"),
      authProviders: ["password"],
      googleId: "hidden-google-id",
      resetPasswordTokenHash: "hidden-reset-token",
    };
    return createdUser;
  };

  const res = createResponse();
  const req = {
    body: {
      name: "Client Name",
      phone: "  +37400111222  ",
      email: "  Client@Example.com ",
      password,
      role: "client",
    },
  };
  await registerUser(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(issuedSessionCalls, [{ req, res, user: createdUser }]);
  assert.deepEqual(
    {
      name: createPayload.name,
      phone: createPayload.phone,
      email: createPayload.email,
      role: createPayload.role,
      specialistOnboarding: createPayload.specialistOnboarding,
    },
    {
      name: "Client Name",
      phone: "+37400111222",
      email: "client@example.com",
      role: "client",
      specialistOnboarding: undefined,
    }
  );
  assert.equal(await bcrypt.compare(password, createPayload.password), true);
  assert.equal(createPayload.password === password, false);
  assertJwtContract(res.body.token, userId);
  assertPublicAuthUser(res.body.user, {
    id: userId,
    name: "Client Name",
    phone: "+37400111222",
    email: "client@example.com",
    role: "client",
  });
  assert.equal(JSON.stringify(res.body).includes(password), false);
});

test("loginUser returns a generic server error when JWT_SECRET is missing", async () => {
  getLogger({ level: "silent" });
  delete process.env.JWT_SECRET;
  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);

  User.findOne = async () => ({
    _id: userId,
    name: "Test Client",
    phone: "+37400111222",
    email: "client@example.com",
    role: "client",
    password: passwordHash,
  });

  const res = createResponse();
  await loginUser(
    { body: { phone: "+37400111222", password } },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(issuedSessionCalls.length, 1);
  assert.deepEqual(res.body, { message: "Login failed" });
  assert.equal("token" in res.body, false);
  assert.equal(JSON.stringify(res.body).includes("JWT_SECRET"), false);
  assert.equal(JSON.stringify(res.body).includes(password), false);
});
