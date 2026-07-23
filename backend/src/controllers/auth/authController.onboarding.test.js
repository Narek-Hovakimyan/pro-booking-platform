import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, test } from "node:test";

import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import {
  __resetAuthControllerDependencies,
  __setAuthControllerDependencies,
  loginUser,
  registerUser,
} from "./authController.js";
import { serializeAuthUser, signAccessToken } from "../../services/auth/authResponseService.js";

const originalUserMethods = {
  findOne: User.findOne,
  create: User.create,
};
const originalSubscriptionMethods = {
  findOne: Subscription.findOne,
  create: Subscription.create,
};
const originalSubscriptionPlanMethods = {
  findOne: SubscriptionPlan.findOne,
};
const originalJwtSecret = process.env.JWT_SECRET;
const userId = "64d000000000000000000001";
let issuedSessionCalls = [];

const createResponse = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createUser = (overrides = {}) => ({
  _id: userId,
  name: "Onboarding User",
  phone: "+37400111222",
  email: "onboarding@example.com",
  emailVerified: false,
  emailVerifiedAt: null,
  city: "",
  avatarUrl: "",
  role: "barber",
  salon: null,
  salonStatus: "none",
  salons: [],
  profession: "barber",
  barberType: "unisex",
  specialty: "unisex",
  workHistory: [],
  favoriteBarbers: [],
  favoriteSalons: [],
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  ...overrides,
});

beforeEach(() => {
  issuedSessionCalls = [];
  __setAuthControllerDependencies({
    issueAuthSession: async ({ req, res, user }) => {
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
  User.findOne = originalUserMethods.findOne;
  User.create = originalUserMethods.create;
  Subscription.findOne = originalSubscriptionMethods.findOne;
  Subscription.create = originalSubscriptionMethods.create;
  SubscriptionPlan.findOne = originalSubscriptionPlanMethods.findOne;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test("password registration assigns only server-created barber onboarding state", async () => {
  process.env.JWT_SECRET = "test-secret";
  let createPayload;
  let createdUser;
  User.findOne = async () => null;
  Subscription.findOne = async () => null;
  SubscriptionPlan.findOne = async () => ({
    _id: "plan-1",
    pricePerSeat: 5000,
    currency: "AMD",
  });
  Subscription.create = async (payload) => ({ _id: "subscription-1", ...payload });
  User.create = async (payload) => {
    createPayload = payload;
    createdUser = createUser({ specialistOnboarding: payload.specialistOnboarding });
    return createdUser;
  };

  const res = createResponse();
  const req = {
    body: {
      name: "New Barber",
      phone: "+37400111222",
      email: "new-barber@example.com",
      password: "password123",
      role: "barber",
      specialistOnboarding: { status: "completed", needsOnboarding: false },
    },
  };
  await registerUser(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(jwt.verify(res.body.token, "test-secret").id, userId);
  assert.equal(issuedSessionCalls.length, 1);
  assert.equal(issuedSessionCalls[0].req, req);
  assert.equal(issuedSessionCalls[0].res, res);
  assert.equal(issuedSessionCalls[0].user, createdUser);
  assert.equal("refreshToken" in res.body, false);
  assert.equal("session" in res.body, false);
  assert.equal("familyId" in res.body, false);
  assert.equal("tokenHash" in res.body, false);
  assert.deepEqual(createPayload.specialistOnboarding, {
    version: 1,
    status: "not_started",
    currentStep: "professional_basics",
    workplace: null,
    completedAt: null,
  });
  assert.deepEqual(res.body.user.specialistOnboarding, {
    ...createPayload.specialistOnboarding,
    needsOnboarding: true,
  });
});

test("password registration leaves clients without onboarding state", async () => {
  process.env.JWT_SECRET = "test-secret";
  let createPayload;
  User.findOne = async () => null;

  const res = createResponse();
  const createdUser = createUser({ role: "client", specialistOnboarding: undefined });
  User.create = async (payload) => {
    createPayload = payload;
    return createdUser;
  };
  const req = {
    body: {
      name: "New Client",
      phone: "+37400111222",
      email: "new-client@example.com",
      password: "password123",
      role: "client",
      specialistOnboarding: { status: "completed" },
    },
  };
  await registerUser(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(issuedSessionCalls.length, 1);
  assert.equal(issuedSessionCalls[0].req, req);
  assert.equal(issuedSessionCalls[0].res, res);
  assert.equal(issuedSessionCalls[0].user, createdUser);
  assert.equal(res.body.token, jwt.sign({ id: userId, av: 0 }, "test-secret", { expiresIn: "15m" }));
  assert.equal(createPayload.specialistOnboarding, undefined);
  assert.equal("specialistOnboarding" in res.body.user, false);
  assert.equal("refreshToken" in res.body, false);
  assert.equal("session" in res.body, false);
  assert.equal("familyId" in res.body, false);
  assert.equal("tokenHash" in res.body, false);
});

test("password login safely serializes explicit, legacy, and completed barber states", async () => {
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);
  process.env.JWT_SECRET = "test-secret";
  const states = [
    [undefined, "legacy", false],
    [{ version: 1, status: "in_progress", currentStep: "workplace", workplace: null, completedAt: null }, "in_progress", true],
    [{ version: 1, status: "completed", currentStep: null, workplace: "salon", completedAt: new Date("2026-01-02T03:04:05.000Z") }, "completed", false],
  ];

  for (const [specialistOnboarding, status, needsOnboarding] of states) {
    const user = createUser({ password: passwordHash, specialistOnboarding });
    User.findOne = async () => user;
    const res = createResponse();
    const req = { body: { phone: "+37400111222", password } };
    const previousCallCount = issuedSessionCalls.length;
    await loginUser(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(issuedSessionCalls.length, previousCallCount + 1);
    assert.equal(issuedSessionCalls.at(-1).req, req);
    assert.equal(issuedSessionCalls.at(-1).res, res);
    assert.equal(issuedSessionCalls.at(-1).user, user);
    assert.equal("refreshToken" in res.body, false);
    assert.equal("session" in res.body, false);
    assert.equal("familyId" in res.body, false);
    assert.equal("tokenHash" in res.body, false);
    assert.equal(res.body.user.specialistOnboarding.status, status);
    assert.equal(res.body.user.specialistOnboarding.needsOnboarding, needsOnboarding);
    assert.equal(user.specialistOnboarding, specialistOnboarding);
  }
});

test("password login omits onboarding metadata for clients", async () => {
  const password = "password123";
  process.env.JWT_SECRET = "test-secret";
  User.findOne = async () => createUser({ role: "client", password: await bcrypt.hash(password, 10) });

  const res = createResponse();
  const req = { body: { phone: "+37400111222", password } };
  const user = await User.findOne();
  User.findOne = async () => user;
  await loginUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(issuedSessionCalls.length, 1);
  assert.equal(issuedSessionCalls[0].req, req);
  assert.equal(issuedSessionCalls[0].res, res);
  assert.equal(issuedSessionCalls[0].user, user);
  assert.equal(res.body.token, jwt.sign({ id: userId, av: 0 }, "test-secret", { expiresIn: "15m" }));
  assert.equal("specialistOnboarding" in res.body.user, false);
  assert.equal("refreshToken" in res.body, false);
  assert.equal("session" in res.body, false);
  assert.equal("familyId" in res.body, false);
  assert.equal("tokenHash" in res.body, false);
});
