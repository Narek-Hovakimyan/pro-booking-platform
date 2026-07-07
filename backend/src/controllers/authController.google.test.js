import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { afterEach, test } from "node:test";

import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import { setGoogleAuthClientFactoryForTesting } from "../services/googleAuthService.js";
import { googleAuth, loginUser, registerUser } from "./authController.js";

const originalUserMethods = {
  findOne: User.findOne,
  create: User.create,
  findByIdAndDelete: User.findByIdAndDelete,
};
const originalSubscriptionMethods = {
  findOne: Subscription.findOne,
  create: Subscription.create,
};
const originalSubscriptionPlanMethods = {
  findOne: SubscriptionPlan.findOne,
  create: SubscriptionPlan.create,
};
const originalJwtSecret = process.env.JWT_SECRET;
const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
const originalPlatformAdminEmails = process.env.PLATFORM_ADMIN_EMAILS;
const originalPlatformAdminIds = process.env.PLATFORM_ADMIN_IDS;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

const userId = "64d000000000000000000001";
const otherUserId = "64d000000000000000000002";

afterEach(() => {
  User.findOne = originalUserMethods.findOne;
  User.create = originalUserMethods.create;
  User.findByIdAndDelete = originalUserMethods.findByIdAndDelete;
  Subscription.findOne = originalSubscriptionMethods.findOne;
  Subscription.create = originalSubscriptionMethods.create;
  SubscriptionPlan.findOne = originalSubscriptionPlanMethods.findOne;
  SubscriptionPlan.create = originalSubscriptionPlanMethods.create;
  setGoogleAuthClientFactoryForTesting();
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
  if (originalPlatformAdminEmails === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = originalPlatformAdminEmails;
  if (originalPlatformAdminIds === undefined) delete process.env.PLATFORM_ADMIN_IDS;
  else process.env.PLATFORM_ADMIN_IDS = originalPlatformAdminIds;
});

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

const createUser = (overrides = {}) => ({
  _id: userId,
  name: "Google User",
  phone: "+37400111222",
  email: "google@example.com",
  emailVerified: false,
  emailVerifiedAt: null,
  googleId: "",
  authProviders: ["password"],
  avatarUrl: "",
  role: "client",
  platformRole: null,
  salon: null,
  salonStatus: "none",
  salons: [],
  favoriteBarbers: [],
  favoriteSalons: [],
  workHistory: [],
  createdAt: new Date("2025-01-01"),
  saved: false,
  async save() {
    this.saved = true;
  },
  ...overrides,
});

const selectable = (result, onSelect = () => {}) => ({
  select(fields) {
    onSelect(fields);
    return result;
  },
});

const createPersistedUser = async (payload) => {
  const user = new User({ ...payload, _id: userId });
  await User.schema.s.hooks.execPre("save", user, []);
  return user;
};

const mockGooglePayload = (payload) => {
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  setGoogleAuthClientFactoryForTesting(() => ({
    verifyIdToken: async ({ idToken, audience }) => {
      assert.equal(idToken, "valid-google-token");
      assert.equal(audience, "google-client-id");
      return { getPayload: () => payload };
    },
  }));
};

const baseGooglePayload = {
  sub: "google-sub",
  email: " Google@Example.COM ",
  email_verified: true,
  name: " Google User ",
  picture: " https://example.com/avatar.png ",
};

test("googleAuth rejects missing credential", async () => {
  const res = createResponse();

  await googleAuth({ body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Google credential is required" });
});

test("googleAuth rejects invalid Google token without logging raw token", async () => {
  const logs = [];
  const warnings = [];
  const errors = [];

  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  console.log = (...args) => logs.push(args.join(" "));
  console.warn = (...args) => warnings.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  setGoogleAuthClientFactoryForTesting(() => ({
    verifyIdToken: async () => {
      throw new Error("provider failed raw-google-token");
    },
  }));

  const res = createResponse();
  await googleAuth({ body: { credential: "raw-google-token" } }, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Invalid Google credential" });
  assert.deepEqual(logs, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
});

test("googleAuth rejects unverified Google email", async () => {
  mockGooglePayload({ ...baseGooglePayload, email_verified: false });

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token" } }, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Invalid Google credential" });
});

test("googleAuth logs in existing googleId user and preserves role fields", async () => {
  process.env.JWT_SECRET = "test-secret";
  mockGooglePayload(baseGooglePayload);
  const existingUser = createUser({
    googleId: "google-sub",
    role: "barber",
    platformRole: "superuser",
    salon: "salon-1",
    salonStatus: "approved",
    salons: [{ salon: "salon-1", status: "approved" }],
    authProviders: ["password"],
  });

  User.findOne = (filter) => {
    if (filter.googleId === "google-sub") return selectable(existingUser);
    return selectable(null);
  };

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token", role: "client", phone: "+37400999000" } }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  assert.equal(jwt.verify(res.body.token, "test-secret").id, userId);
  assert.equal(res.body.user.role, "barber");
  assert.equal(res.body.user.platformRole, "superuser");
  assert.equal(res.body.user.canAccessPlatform, true);
  assert.equal(existingUser.phone, "+37400111222");
  assert.deepEqual(existingUser.salons, [{ salon: "salon-1", status: "approved" }]);
  assert.equal(existingUser.authProviders.includes("google"), true);
  assert.equal(existingUser.googleId, "google-sub");
  assert.equal(existingUser.saved, true);
});

test("googleAuth does not mark a different stored email as verified for existing googleId", async () => {
  process.env.JWT_SECRET = "test-secret";
  mockGooglePayload(baseGooglePayload);
  const existingUser = createUser({
    googleId: "google-sub",
    email: "different@example.com",
    emailVerified: false,
  });

  User.findOne = (filter) => {
    if (filter.googleId === "google-sub") return selectable(existingUser);
    return selectable(null);
  };

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(existingUser.email, "different@example.com");
  assert.equal(existingUser.emailVerified, false);
  assert.equal(existingUser.emailVerifiedAt, null);
  assert.equal(existingUser.googleId, "google-sub");
  assert.equal(existingUser.authProviders.includes("google"), true);
});

test("googleAuth links existing verified email without changing role or phone", async () => {
  process.env.JWT_SECRET = "test-secret";
  mockGooglePayload(baseGooglePayload);
  const existingUser = createUser({
    _id: otherUserId,
    email: "google@example.com",
    googleId: "",
    role: "barber",
    phone: "+37400111222",
    platformRole: "superuser",
    salon: "salon-1",
    salonStatus: "approved",
    salons: [{ salon: "salon-1", status: "approved" }],
    avatarUrl: "",
  });

  User.findOne = (filter) => {
    if (filter.googleId) return selectable(null);
    if (filter.email === "google@example.com") return selectable(existingUser);
    return selectable(null);
  };

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token", role: "client", phone: "+37400999000" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(jwt.verify(res.body.token, "test-secret").id, otherUserId);
  assert.equal(existingUser.googleId, "google-sub");
  assert.equal(existingUser.authProviders.includes("google"), true);
  assert.equal(existingUser.emailVerified, true);
  assert.equal(existingUser.role, "barber");
  assert.equal(existingUser.phone, "+37400111222");
  assert.equal(existingUser.platformRole, "superuser");
  assert.deepEqual(existingUser.salons, [{ salon: "salon-1", status: "approved" }]);
  assert.equal(existingUser.avatarUrl, "https://example.com/avatar.png");
});

test("googleAuth rejects existing email linked to different googleId", async () => {
  mockGooglePayload(baseGooglePayload);
  const existingUser = createUser({
    email: "google@example.com",
    googleId: "different-google-sub",
  });

  User.findOne = (filter) => {
    if (filter.googleId) return selectable(null);
    if (filter.email === "google@example.com") return selectable(existingUser);
    return selectable(null);
  };

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token" } }, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { message: "Google account conflict" });
  assert.equal(existingUser.saved, false);
});

test("googleAuth first-time user without role or phone requires profile completion", async () => {
  let createCalled = false;

  mockGooglePayload(baseGooglePayload);
  User.findOne = () => selectable(null);
  User.create = async () => {
    createCalled = true;
  };

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token" } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: "Additional information required",
    requiresProfileCompletion: true,
    fields: ["role", "phone"],
  });
  assert.equal(createCalled, false);
  assert.equal("token" in res.body, false);
});

test("googleAuth first-time user rejects invalid role and duplicate phone", async () => {
  mockGooglePayload(baseGooglePayload);
  User.findOne = () => selectable(null);

  let res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token", role: "owner", phone: "+37400111222" } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Role must be client or barber" });

  User.findOne = (filter) => {
    if (filter.phone === "+37400111222") return selectable(createUser());
    return selectable(null);
  };
  res = createResponse();
  await googleAuth({
    body: {
      credential: "valid-google-token",
      role: "client",
      phone: "  +37400111222  ",
      platformRole: "superuser",
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Phone already exists" });
});

test("googleAuth creates first-time client user and returns JWT response shape", async () => {
  process.env.JWT_SECRET = "test-secret";
  mockGooglePayload(baseGooglePayload);
  let createPayload;
  let createdUser;

  User.findOne = (filter) => {
    if (filter.googleId || filter.email) return selectable(null);
    return null;
  };
  User.create = async (payload) => {
    createPayload = payload;
    createdUser = await createPersistedUser(payload);
    return createdUser;
  };

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token", role: "client", phone: "  +37400111222  " } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(jwt.verify(res.body.token, "test-secret").id, userId);
  assert.equal(res.body.user.email, "google@example.com");
  assert.equal(res.body.user.emailVerified, true);
  assert.equal(res.body.user.avatarUrl, "https://example.com/avatar.png");
  assert.equal(res.body.user.googleId, undefined);
  assert.equal(createPayload.password, undefined);
  assert.equal(createPayload.phone, "+37400111222");
  assert.equal(createPayload.role, "client");
  assert.equal(createPayload.platformRole, undefined);
  assert.equal(res.body.user.platformRole, undefined);
  assert.deepEqual(createPayload.authProviders, ["google"]);
  const rawUser = createdUser.toObject();
  assert.deepEqual(rawUser.favoriteBarbers, []);
  assert.deepEqual(rawUser.favoriteSalons, []);
  assert.equal("profession" in rawUser, false);
  assert.equal("barberType" in rawUser, false);
  assert.equal("specialty" in rawUser, false);
  assert.equal("loyaltyDiscountSettings" in rawUser, false);
  assert.equal("workHistory" in rawUser, false);
  assert.equal("salons" in rawUser, false);
  assert.equal("salon" in rawUser, false);
  assert.equal("salonStatus" in rawUser, false);
  assert.equal("platformRole" in rawUser, false);
});

test("googleAuth first-time user ignores malicious admin platformRole", async () => {
  process.env.JWT_SECRET = "test-secret";
  mockGooglePayload(baseGooglePayload);
  let createPayload;

  User.findOne = (filter) => {
    if (filter.googleId || filter.email) return selectable(null);
    return null;
  };
  User.create = async (payload) => {
    createPayload = payload;
    return createPersistedUser(payload);
  };

  const res = createResponse();
  await googleAuth({
    body: {
      credential: "valid-google-token",
      role: "client",
      phone: "+37400111222",
      platformRole: "admin",
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createPayload.platformRole, undefined);
  assert.equal(res.body.user.platformRole, undefined);
});

test("googleAuth creates first-time barber user with trial subscription", async () => {
  process.env.JWT_SECRET = "test-secret";
  mockGooglePayload(baseGooglePayload);
  const plan = { _id: "plan-1", pricePerSeat: 5000, currency: "AMD" };
  let subscriptionPayload;
  let createdUser;

  User.findOne = (filter) => {
    if (filter.googleId || filter.email) return selectable(null);
    return null;
  };
  User.create = async (payload) => {
    createdUser = await createPersistedUser(payload);
    return createdUser;
  };
  Subscription.findOne = async () => null;
  SubscriptionPlan.findOne = async () => plan;
  Subscription.create = async (payload) => {
    subscriptionPayload = payload;
    return { _id: "subscription-1", ...payload };
  };

  const res = createResponse();
  await googleAuth({ body: { credential: "valid-google-token", role: "barber", phone: "+37400111222" } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, "barber");
  assert.equal(subscriptionPayload.ownerType, "barber");
  assert.equal(String(subscriptionPayload.ownerId), userId);
  assert.equal(subscriptionPayload.ownerRefModel, "User");
  assert.equal(subscriptionPayload.status, "trialing");
  const rawUser = createdUser.toObject();
  assert.equal(rawUser.profession, "barber");
  assert.equal(rawUser.barberType, "unisex");
  assert.equal(rawUser.specialty, "unisex");
  assert.deepEqual(rawUser.salons, []);
  assert.equal(rawUser.salonStatus, "none");
  assert.deepEqual(rawUser.workHistory, []);
  assert.equal(rawUser.loyaltyDiscountSettings.enabled, false);
});

test("Google-only user cannot login with phone/password, while password user still can", async () => {
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);

  User.findOne = () => createUser({
    authProviders: ["google"],
    password: undefined,
  });

  let res = createResponse();
  await loginUser({ body: { phone: "+37400111222", password } }, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Invalid phone or password" });

  process.env.JWT_SECRET = "test-secret";
  User.findOne = () => createUser({
    authProviders: ["password"],
    password: passwordHash,
  });

  res = createResponse();
  await loginUser({ body: { phone: "+37400111222", password } }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.phone, "+37400111222");
  assert.equal(res.body.user.canAccessPlatform, false);
});

test("env allowlisted verified user login includes platform access flag", async () => {
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);
  process.env.JWT_SECRET = "test-secret";
  process.env.PLATFORM_ADMIN_EMAILS = "google@example.com";

  User.findOne = () => createUser({
    authProviders: ["password"],
    password: passwordHash,
    email: "google@example.com",
    emailVerified: true,
    platformRole: null,
  });

  const res = createResponse();
  await loginUser({ body: { phone: "+37400111222", password } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.canAccessPlatform, true);
  assert.equal(res.body.user.platformRole, undefined);
});

test("normal registration still requires password", async () => {
  const res = createResponse();

  await registerUser(
    {
      body: {
        name: "Password User",
        phone: "+37400111222",
        email: "password@example.com",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: "Name, phone, email, and password are required",
  });
});

test("normal registration creates clean client user fields", async () => {
  process.env.JWT_SECRET = "test-secret";
  let createPayload;
  let createdUser;

  User.findOne = () => null;
  User.create = async (payload) => {
    createPayload = payload;
    createdUser = await createPersistedUser(payload);
    return createdUser;
  };

  const res = createResponse();
  await registerUser(
    {
      body: {
        name: "Password Client",
        phone: "+37400111222",
        email: "client@example.com",
        password: "password123",
        role: "client",
        platformRole: "superuser",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createPayload.role, "client");
  assert.equal(createPayload.platformRole, undefined);
  assert.equal(res.body.user.platformRole, undefined);
  assert.equal(res.body.user.canAccessPlatform, false);
  assert.equal(jwt.verify(res.body.token, "test-secret").id, userId);
  const rawUser = createdUser.toObject();
  assert.deepEqual(rawUser.favoriteBarbers, []);
  assert.deepEqual(rawUser.favoriteSalons, []);
  assert.equal("profession" in rawUser, false);
  assert.equal("barberType" in rawUser, false);
  assert.equal("specialty" in rawUser, false);
  assert.equal("loyaltyDiscountSettings" in rawUser, false);
  assert.equal("workHistory" in rawUser, false);
  assert.equal("salons" in rawUser, false);
  assert.equal("salon" in rawUser, false);
  assert.equal("salonStatus" in rawUser, false);
  assert.equal("platformRole" in rawUser, false);
});

test("normal registration ignores malicious admin platformRole", async () => {
  process.env.JWT_SECRET = "test-secret";
  let createPayload;

  User.findOne = () => null;
  User.create = async (payload) => {
    createPayload = payload;
    return createPersistedUser(payload);
  };

  const res = createResponse();
  await registerUser(
    {
      body: {
        name: "Password Client",
        phone: "+37400111222",
        email: "client@example.com",
        password: "password123",
        role: "client",
        platformRole: "admin",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createPayload.platformRole, undefined);
  assert.equal(res.body.user.platformRole, undefined);
  assert.equal(res.body.user.canAccessPlatform, false);
});

test("normal registration creates barber fields and trial subscription", async () => {
  process.env.JWT_SECRET = "test-secret";
  const plan = { _id: "plan-1", pricePerSeat: 5000, currency: "AMD" };
  let createdUser;
  let subscriptionPayload;

  User.findOne = () => null;
  User.create = async (payload) => {
    createdUser = await createPersistedUser(payload);
    return createdUser;
  };
  Subscription.findOne = async () => null;
  SubscriptionPlan.findOne = async () => plan;
  Subscription.create = async (payload) => {
    subscriptionPayload = payload;
    return { _id: "subscription-1", ...payload };
  };

  const res = createResponse();
  await registerUser(
    {
      body: {
        name: "Password Barber",
        phone: "+37400111222",
        email: "barber@example.com",
        password: "password123",
        role: "barber",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, "barber");
  assert.equal(subscriptionPayload.ownerType, "barber");
  assert.equal(String(subscriptionPayload.ownerId), userId);
  assert.equal(subscriptionPayload.status, "trialing");
  const rawUser = createdUser.toObject();
  assert.equal(rawUser.profession, "barber");
  assert.equal(rawUser.barberType, "unisex");
  assert.equal(rawUser.specialty, "unisex");
  assert.deepEqual(rawUser.salons, []);
  assert.equal(rawUser.salonStatus, "none");
  assert.deepEqual(rawUser.workHistory, []);
  assert.equal(rawUser.loyaltyDiscountSettings.enabled, false);
});
