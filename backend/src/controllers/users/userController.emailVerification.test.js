import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";

import {
  getMyProfile,
  sendEmailVerificationController,
  updateMyProfile,
  verifyEmailController,
} from "./userController.js";
import {
  __resetAuthControllerDependencies,
  __setAuthControllerDependencies,
  loginUser,
  registerUser,
} from "../auth/authController.js";
import { serializeAuthUser, signAccessToken } from "../../services/auth/authResponseService.js";
import User from "../../models/User.js";
import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import { hashEmailVerificationToken } from "../../utils/emailVerification.js";
import { getLogger, resetLogger } from "../../config/logger.js";
import {
  sendEmailVerification,
  setResendClientFactoryForTesting,
} from "../../services/auth/emailService.js";

const originalUserMethods = {
  findById: User.findById,
  findByIdAndUpdate: User.findByIdAndUpdate,
  findByIdAndDelete: User.findByIdAndDelete,
  findOne: User.findOne,
  create: User.create,
};
const originalBarberProfileMethods = {
  findOneAndUpdate: BarberProfile.findOneAndUpdate,
};
const originalSalonMethods = {
  find: Salon.find,
  findById: Salon.findById,
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
const originalPlatformAdminEmails = process.env.PLATFORM_ADMIN_EMAILS;
const originalPlatformAdminIds = process.env.PLATFORM_ADMIN_IDS;

const userId = "64c000000000000000000001";
const otherUserId = "64c000000000000000000002";
let issuedSessionCalls = [];

const makeLoggerStream = () => {
  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { lines, stream };
};

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
  getLogger({ level: "silent" });
});

afterEach(() => {
  __resetAuthControllerDependencies();
  User.findById = originalUserMethods.findById;
  User.findByIdAndUpdate = originalUserMethods.findByIdAndUpdate;
  User.findByIdAndDelete = originalUserMethods.findByIdAndDelete;
  User.findOne = originalUserMethods.findOne;
  User.create = originalUserMethods.create;
  BarberProfile.findOneAndUpdate = originalBarberProfileMethods.findOneAndUpdate;
  Salon.find = originalSalonMethods.find;
  Salon.findById = originalSalonMethods.findById;
  Subscription.findOne = originalSubscriptionMethods.findOne;
  Subscription.create = originalSubscriptionMethods.create;
  SubscriptionPlan.findOne = originalSubscriptionPlanMethods.findOne;
  SubscriptionPlan.create = originalSubscriptionPlanMethods.create;
  setResendClientFactoryForTesting();
  resetLogger();
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  if (originalPlatformAdminEmails === undefined) {
    delete process.env.PLATFORM_ADMIN_EMAILS;
  } else {
    process.env.PLATFORM_ADMIN_EMAILS = originalPlatformAdminEmails;
  }
  if (originalPlatformAdminIds === undefined) {
    delete process.env.PLATFORM_ADMIN_IDS;
  } else {
    process.env.PLATFORM_ADMIN_IDS = originalPlatformAdminIds;
  }
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

const createRequest = (overrides = {}) => ({
  user: { _id: userId, role: "client", ...overrides.user },
  body: overrides.body || {},
  query: overrides.query || {},
  protocol: "http",
  get: () => "localhost:5000",
});

const createBaseUser = (overrides = {}) => ({
  _id: userId,
  name: "Test User",
  phone: "+37400000000",
  email: "",
  emailVerified: false,
  emailVerifiedAt: null,
  emailVerificationTokenHash: "",
  emailVerificationExpires: null,
  emailVerificationSentAt: null,
  city: "",
  avatarUrl: "",
  role: "client",
  salon: null,
  salonStatus: "none",
  salons: [],
  specialty: "unisex",
  workHistory: [],
  favoriteBarbers: [],
  favoriteSalons: [],
  createdAt: new Date("2025-01-01"),
  ...overrides,
});

const applyUpdate = (baseUser, updates = {}) => {
  const nextUser = { ...baseUser };

  if (updates.$set || updates.$unset) {
    Object.assign(nextUser, updates.$set || {});
    Object.keys(updates.$unset || {}).forEach((key) => {
      delete nextUser[key];
    });
    return nextUser;
  }

  return { ...nextUser, ...updates };
};

// Helper: wrap a user object so it supports .select() chaining
const selectable = (data) => ({
  select: async () => data,
});

// Helper: wrap a user object for findByIdAndUpdate with select chaining
const updateAndSelect = (data) => ({
  select: async (fields) => {
    const result = { ...data, toObject: () => ({ ...result }) };
    // Strip select:false fields to mimic Mongoose behavior
    if (fields && typeof fields === "string" && fields.includes("-emailVerificationTokenHash")) {
      delete result.emailVerificationTokenHash;
      delete result.emailVerificationExpires;
      delete result.emailVerificationSentAt;
    }
    return result;
  },
});

// ── updateMyProfile – email add ────────────────────────────────────────

test("User model – email is optional and has sparse unique index", () => {
  assert.equal(User.schema.path("email").defaultValue, undefined);
  assert.deepEqual(
    User.schema.indexes().find(([fields]) => fields.email === 1),
    [{ email: 1 }, { unique: true, sparse: true }]
  );
});

test("getMyProfile returns canAccessPlatform true for DB platform superuser", async () => {
  const res = createResponse();
  const req = createRequest({
    user: createBaseUser({ platformRole: "superuser" }),
  });

  await getMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.canAccessPlatform, true);
  assert.equal(res.body.platformRole, undefined);
});

test("getMyProfile returns canAccessPlatform true for env allowlisted verified user", async () => {
  process.env.PLATFORM_ADMIN_EMAILS = "allowlisted@example.com";
  const res = createResponse();
  const req = createRequest({
    user: createBaseUser({
      email: "allowlisted@example.com",
      emailVerified: true,
    }),
  });

  await getMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.canAccessPlatform, true);
  assert.equal(res.body.platformRole, undefined);
});

test("getMyProfile returns canAccessPlatform false for normal user", async () => {
  const res = createResponse();
  const req = createRequest({ user: createBaseUser() });

  await getMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.canAccessPlatform, false);
  assert.equal(res.body.platformRole, undefined);
});

test("updateMyProfile – adding email normalizes trim/lowercase and response excludes token hash", async () => {
  const res = createResponse();
  const req = createRequest({ body: { email: "  Test@Example.COM  " } });

  // No existing user with this email
  User.findOne = async (filter) => {
    if (filter?.email === "test@example.com" && filter?._id?.$ne) return null;
    return null;
  };

  BarberProfile.findOneAndUpdate = async () => null;
  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;

  const baseUser = createBaseUser();

  User.findByIdAndUpdate = (_id, _updates, _opts) =>
    updateAndSelect(applyUpdate(baseUser, _updates));

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, "test@example.com");
  assert.equal(res.body.emailVerified, false);
  assert.equal(res.body.emailVerifiedAt, null);
  assert.equal(res.body.emailVerificationTokenHash, undefined);
  assert.equal(res.body.emailVerificationExpires, undefined);
  assert.equal(res.body.emailVerificationSentAt, undefined);
});

test("updateMyProfile – updating profile fields without media keeps existing avatar", async () => {
  const res = createResponse();
  const req = createRequest({
    body: { name: "Updated Name", city: "Yerevan" },
  });
  let updatesSeen;

  BarberProfile.findOneAndUpdate = async () => null;
  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;
  User.findByIdAndUpdate = (_id, updates) => {
    updatesSeen = updates;
    return updateAndSelect(applyUpdate(
      createBaseUser({ avatarUrl: "/uploads/avatars/existing.png" }),
      updates
    ));
  };

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.avatarUrl, "/uploads/avatars/existing.png");
  assert.equal(Object.hasOwn(updatesSeen, "avatarUrl"), false);
});

test("updateMyProfile – explicitly empty avatarUrl still clears avatar", async () => {
  const res = createResponse();
  const req = createRequest({
    body: { avatarUrl: "" },
  });
  let updatesSeen;

  BarberProfile.findOneAndUpdate = async () => null;
  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;
  User.findByIdAndUpdate = (_id, updates) => {
    updatesSeen = updates;
    return updateAndSelect(applyUpdate(
      createBaseUser({ avatarUrl: "/uploads/avatars/existing.png" }),
      updates
    ));
  };

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.avatarUrl, "");
  assert.equal(updatesSeen.avatarUrl, "");
});

test("updateMyProfile – barber profile edit without media keeps existing imageUrl", async () => {
  const res = createResponse();
  const req = createRequest({
    user: { _id: userId, role: "barber" },
    body: { name: "Updated Barber", bio: "Fresh bio" },
  });
  let profileUpdatesSeen;

  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;
  User.findByIdAndUpdate = (_id, updates) =>
    updateAndSelect(applyUpdate(
      createBaseUser({
        role: "barber",
        avatarUrl: "/uploads/avatars/existing-avatar.png",
      }),
      updates
    ));
  BarberProfile.findOneAndUpdate = async (_query, updates) => {
    profileUpdatesSeen = updates;
    return {
      barberId: userId,
      bio: updates.bio,
      city: "",
      imageUrl: "/uploads/avatars/existing-profile.png",
      galleryImages: [],
      defaultSchedule: {},
    };
  };

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.imageUrl, "/uploads/avatars/existing-profile.png");
  assert.equal(Object.hasOwn(profileUpdatesSeen, "imageUrl"), false);
});

test("updateMyProfile – uploaded avatar updates user avatar and barber image", async () => {
  const res = createResponse();
  const req = createRequest({
    user: { _id: userId, role: "barber" },
    body: { name: "Updated Barber" },
  });
  req.file = { filename: "uploaded.png" };
  let userUpdatesSeen;
  let profileUpdatesSeen;

  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;
  User.findByIdAndUpdate = (_id, updates) => {
    userUpdatesSeen = updates;
    return updateAndSelect(applyUpdate(
      createBaseUser({ role: "barber" }),
      updates
    ));
  };
  BarberProfile.findOneAndUpdate = async (_query, updates) => {
    profileUpdatesSeen = updates;
    return {
      barberId: userId,
      bio: "",
      city: "",
      imageUrl: updates.imageUrl,
      galleryImages: [],
      defaultSchedule: {},
    };
  };

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(userUpdatesSeen.avatarUrl, "/uploads/avatars/uploaded.png");
  assert.equal(profileUpdatesSeen.imageUrl, "/uploads/avatars/uploaded.png");
  assert.equal(res.body.avatarUrl, "/uploads/avatars/uploaded.png");
  assert.equal(res.body.imageUrl, "/uploads/avatars/uploaded.png");
});

test("updateMyProfile retries the expected barber profile duplicate once without upsert", async () => {
  const res = createResponse();
  const req = createRequest({
    user: { _id: userId, role: "barber" },
    body: { bio: "Fresh bio" },
  });
  const calls = [];
  const duplicate = new Error(
    "E11000 duplicate key error index: barberprofiles_barberId_unique dup key"
  );
  duplicate.code = 11000;
  duplicate.keyPattern = { barberId: 1 };

  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;
  User.findByIdAndUpdate = (_id, updates) =>
    updateAndSelect(applyUpdate(createBaseUser({ role: "barber" }), updates));
  BarberProfile.findOneAndUpdate = async (filter, update, options) => {
    calls.push({ filter, update, options });
    if (calls.length === 1) throw duplicate;
    return { barberId: userId, bio: "Fresh bio", galleryImages: [], defaultSchedule: {} };
  };

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.upsert, true);
  assert.deepEqual(calls[1].options, { returnDocument: "after", runValidators: true });
});

test("updateMyProfile returns bounded 409 when the expected duplicate retry finds no profile", async () => {
  const res = createResponse();
  const req = createRequest({
    user: { _id: userId, role: "barber" },
    body: { bio: "Fresh bio" },
  });
  const duplicate = new Error(
    "E11000 duplicate key error index: barberprofiles_barberId_unique dup key"
  );
  duplicate.code = 11000;
  duplicate.keyPattern = { barberId: 1 };
  let attempts = 0;

  User.findByIdAndUpdate = (_id, updates) =>
    updateAndSelect(applyUpdate(createBaseUser({ role: "barber" }), updates));
  BarberProfile.findOneAndUpdate = async () => {
    attempts += 1;
    if (attempts === 1) throw duplicate;
    return null;
  };

  await updateMyProfile(req, res);

  assert.equal(attempts, 2);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    code: "BARBER_PROFILE_CONFLICT",
    message: "Could not save barber profile",
  });
});

test("updateMyProfile – ignores role, platformRole, and auth internals", async () => {
  const res = createResponse();
  const req = createRequest({
    body: {
      name: "Safe Update",
      role: "barber",
      platformRole: "superuser",
      authProviders: ["google"],
      googleId: "attacker-google-id",
      emailVerified: true,
      resetPasswordTokenHash: "attacker-reset",
      emailVerificationTokenHash: "attacker-email",
    },
  });
  let updatesSeen;

  BarberProfile.findOneAndUpdate = async () => null;
  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;
  User.findByIdAndUpdate = (_id, updates) => {
    updatesSeen = updates;
    return updateAndSelect(applyUpdate(createBaseUser(), updates));
  };

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updatesSeen.name, "Safe Update");
  assert.equal(Object.hasOwn(updatesSeen, "role"), false);
  assert.equal(Object.hasOwn(updatesSeen, "platformRole"), false);
  assert.equal(Object.hasOwn(updatesSeen, "authProviders"), false);
  assert.equal(Object.hasOwn(updatesSeen, "googleId"), false);
  assert.equal(Object.hasOwn(updatesSeen, "emailVerified"), false);
  assert.equal(Object.hasOwn(updatesSeen, "resetPasswordTokenHash"), false);
  assert.equal(Object.hasOwn(updatesSeen, "emailVerificationTokenHash"), false);
  assert.equal(res.body.canAccessPlatform, false);
  assert.equal(res.body.platformRole, undefined);
});

// ── updateMyProfile – change email from verified → unverified ─────────

test("updateMyProfile – changing email from verified marks unverified and clears emailVerifiedAt", async () => {
  const res = createResponse();
  const req = createRequest({
    user: { _id: userId, role: "client" },
    body: { email: "newemail@example.com" },
  });

  User.findOne = async (filter) => {
    if (filter?.email === "newemail@example.com" && filter?._id?.$ne) return null;
    return null;
  };

  BarberProfile.findOneAndUpdate = async () => null;
  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;

  User.findByIdAndUpdate = (_id, _updates, _opts) =>
    updateAndSelect(applyUpdate(
      createBaseUser({
        email: "old@example.com",
        emailVerified: true,
        emailVerifiedAt: new Date("2025-06-01"),
      }),
      _updates
    ));

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, "newemail@example.com");
  assert.equal(res.body.emailVerified, false);
  assert.equal(res.body.emailVerifiedAt, null);
});

// ── updateMyProfile – duplicate email ─────────────────────────────────

test("updateMyProfile – duplicate email returns 409", async () => {
  const res = createResponse();
  const req = createRequest({ body: { email: "existing@example.com" } });

  // Simulate duplicate by having findOne return another user
  User.findOne = async () => ({ _id: otherUserId });

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "Email already in use");
});

// ── updateMyProfile – invalid email ──────────────────────────────────

test("updateMyProfile – invalid email returns 400", async () => {
  const res = createResponse();
  const req = createRequest({ body: { email: "not-an-email" } });

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid email format");
});

// ── updateMyProfile – unchanged email ─────────────────────────────────

test("updateMyProfile – unchanged verified email stays verified", async () => {
  const verifiedAt = new Date("2025-06-01");
  const res = createResponse();
  const req = createRequest({
    user: {
      _id: userId,
      role: "client",
      email: "same@example.com",
      emailVerified: true,
      emailVerifiedAt: verifiedAt,
    },
    body: { email: " SAME@example.com " },
  });
  let duplicateLookupCalled = false;

  User.findOne = async () => {
    duplicateLookupCalled = true;
    return null;
  };
  BarberProfile.findOneAndUpdate = async () => null;
  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;
  User.findByIdAndUpdate = (_id, _updates, _opts) =>
    updateAndSelect(applyUpdate(
      createBaseUser({
        email: "same@example.com",
        emailVerified: true,
        emailVerifiedAt: verifiedAt,
      }),
      _updates
    ));

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, "same@example.com");
  assert.equal(res.body.emailVerified, true);
  assert.equal(res.body.emailVerifiedAt, verifiedAt);
  assert.equal(duplicateLookupCalled, false);
});

// ── updateMyProfile – clearing email ──────────────────────────────────

test("updateMyProfile – clearing email removes all verification fields", async () => {
  const res = createResponse();
  const req = createRequest({
    user: { _id: userId, role: "client" },
    body: { email: "" },
  });

  BarberProfile.findOneAndUpdate = async () => null;
  Salon.find = async () => ({ select: async () => [] });
  Salon.findById = async () => null;

  User.findByIdAndUpdate = (_id, _updates, _opts) =>
    updateAndSelect(applyUpdate(
      createBaseUser({
        email: "old@example.com",
        emailVerified: true,
        emailVerifiedAt: new Date("2025-06-01"),
        emailVerificationTokenHash: "hash",
        emailVerificationExpires: new Date("2025-06-02"),
        emailVerificationSentAt: new Date("2025-06-01"),
      }),
      _updates
    ));

  await updateMyProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, "");
  assert.equal(res.body.emailVerified, false);
  assert.equal(res.body.emailVerifiedAt, null);
  assert.equal(res.body.emailVerificationTokenHash, undefined);
  assert.equal(res.body.emailVerificationExpires, undefined);
  assert.equal(res.body.emailVerificationSentAt, undefined);
});

// ── sendEmailVerificationController – requires email ─────────────────

test("sendEmailVerificationController – requires email", async () => {
  const res = createResponse();
  const req = createRequest();

  User.findById = () =>
    selectable(createBaseUser({ email: "", emailVerificationSentAt: null }));

  await sendEmailVerificationController(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "No email to verify");
});

// ── sendEmailVerificationController – throttle ───────────────────────

test("sendEmailVerificationController – throttled if sent too recently", async () => {
  const res = createResponse();
  const req = createRequest();

  const recentSentAt = new Date(Date.now() - 5 * 1000); // 5 seconds ago

  User.findById = () =>
    selectable(createBaseUser({
      email: "test@example.com",
      emailVerified: false,
      emailVerificationSentAt: recentSentAt,
      emailVerificationExpires: null,
    }));

  await sendEmailVerificationController(req, res);

  assert.equal(res.statusCode, 429);
  assert.ok(res.body.message.includes("Please wait"));
});

// ── verifyEmailController – valid token ──────────────────────────────

test("verifyEmailController – valid token verifies email and clears token hash/expires", async () => {
  const res = createResponse();
  const rawToken = "abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcdef1234";
  const tokenHash = hashEmailVerificationToken(rawToken);
  const expires = new Date(Date.now() + 3600000);

  const req = createRequest({ query: { token: rawToken } });

  const user = {
    ...createBaseUser({
      email: "test@example.com",
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: expires,
      emailVerificationSentAt: new Date(),
    }),
    async save() {
      this.emailVerified = true;
      this.emailVerifiedAt = new Date();
      this.emailVerificationTokenHash = "";
      this.emailVerificationExpires = null;
      return this;
    },
  };

  User.findOne = () => ({
    select: async () => user,
  });

  await verifyEmailController(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Email verified successfully");
  assert.equal(res.body.user.email, "test@example.com");
  assert.equal(res.body.user.emailVerified, true);
  assert.equal(res.body.user.canAccessPlatform, false);
  assert.ok(res.body.user.emailVerifiedAt);
  // Token fields not exposed
  assert.equal(res.body.user.emailVerificationTokenHash, undefined);
});

// ── verifyEmailController – invalid token ────────────────────────────

test("verifyEmailController – invalid token returns 400", async () => {
  const res = createResponse();
  const req = createRequest({ query: { token: "invalidtoken123" } });

  User.findOne = () => ({
    select: async () => null,
  });

  await verifyEmailController(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid or expired verification token");
});

// ── verifyEmailController – expired token ────────────────────────────

test("verifyEmailController – expired token returns 400", async () => {
  const res = createResponse();
  const rawToken = "abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcdef1234";
  const req = createRequest({ query: { token: rawToken } });

  // findOne won't match because $gt filter on expired date finds nothing
  User.findOne = () => ({
    select: async () => null,
  });

  await verifyEmailController(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid or expired verification token");
});

// ── verifyEmailController – missing token ────────────────────────────

test("verifyEmailController – missing token returns 400", async () => {
  const res = createResponse();
  const req = createRequest({ query: {} });

  await verifyEmailController(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Verification token is required");
});

// ── email service – production logging safety ────────────────────────

test("sendEmailVerification – does not log raw token or URL in production by default", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogUrl = process.env.EMAIL_VERIFICATION_LOG_URL;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const rawToken = "raw-secret-token";

  process.env.NODE_ENV = "production";
  delete process.env.EMAIL_VERIFICATION_LOG_URL;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });

  try {
    const result = await sendEmailVerification({
      user: { _id: userId, email: "test@example.com" },
      token: rawToken,
      req: { protocol: "https", get: () => "example.com" },
    });

    assert.equal(result.delivered, false);
    assert.equal(result.provider, "none");
    assert.equal(result.verificationUrl, "");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, "email.verification_skipped");
    const output = JSON.stringify(lines);
    assert.equal(output.includes(rawToken), false);
    assert.equal(output.includes("/email/verify"), false);
    assert.equal(output.includes("test@example.com"), false);
    assert.equal(output.includes("EMAIL_PROVIDER=resend"), false);
    assert.equal(output.includes("RESEND_API_KEY"), false);
    assert.equal(output.includes("EMAIL_FROM"), false);
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalLogUrl === undefined) {
      delete process.env.EMAIL_VERIFICATION_LOG_URL;
    } else {
      process.env.EMAIL_VERIFICATION_LOG_URL = originalLogUrl;
    }
    if (originalProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = originalProvider;
    }
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
    if (originalFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = originalFrom;
    }
  }
});

test("sendEmailVerification – EMAIL_VERIFICATION_LOG_URL=true retains fallback without logging verification URL", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogUrl = process.env.EMAIL_VERIFICATION_LOG_URL;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const rawToken = "raw-secret-token";

  process.env.NODE_ENV = "production";
  process.env.EMAIL_VERIFICATION_LOG_URL = "true";
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });

  try {
    const result = await sendEmailVerification({
      user: { _id: userId, email: "test@example.com" },
      token: rawToken,
      req: { protocol: "https", get: () => "example.com" },
    });

    assert.equal(result.delivered, false);
    assert.equal(result.provider, "log");
    assert.equal(result.verificationUrl.includes(rawToken), true);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, "email.verification_skipped");
    const output = JSON.stringify(lines);
    assert.equal(output.includes(rawToken), false);
    assert.equal(output.includes("/email/verify"), false);
    assert.equal(output.includes("test@example.com"), false);
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalLogUrl === undefined) {
      delete process.env.EMAIL_VERIFICATION_LOG_URL;
    } else {
      process.env.EMAIL_VERIFICATION_LOG_URL = originalLogUrl;
    }
    if (originalProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = originalProvider;
    }
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
    if (originalFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = originalFrom;
    }
  }
});

test("sendEmailVerification – Resend provider sends expected payload", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogUrl = process.env.EMAIL_VERIFICATION_LOG_URL;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalReplyTo = process.env.EMAIL_REPLY_TO;
  const originalAppUrl = process.env.APP_PUBLIC_URL;
  const rawToken = "raw-secret-token";
  const calls = [];

  process.env.NODE_ENV = "production";
  process.env.EMAIL_VERIFICATION_LOG_URL = "false";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "HairBook <no-reply@example.com>";
  process.env.EMAIL_REPLY_TO = "support@example.com";
  process.env.APP_PUBLIC_URL = "https://api.example.com";
  setResendClientFactoryForTesting((apiKey) => {
    calls.push({ apiKey });
    return {
      emails: {
        send: async (payload) => {
          calls.push({ payload });
          return { data: { id: "email_123" } };
        },
      },
    };
  });

  try {
    const result = await sendEmailVerification({
      user: { _id: userId, email: "test@example.com", name: "Test User" },
      token: rawToken,
      req: { protocol: "https", get: () => "example.com" },
    });

    assert.deepEqual(result, {
      delivered: true,
      provider: "resend",
      id: "email_123",
    });
    assert.equal(calls[0].apiKey, "re_test_key");
    assert.equal(calls[1].payload.from, "HairBook <no-reply@example.com>");
    assert.equal(calls[1].payload.to, "test@example.com");
    assert.equal(calls[1].payload.replyTo, "support@example.com");
    assert.equal(calls[1].payload.subject, "Verify your HairBook email");
    assert.equal(calls[1].payload.html.includes(rawToken), true);
    assert.equal(calls[1].payload.text.includes(rawToken), true);
    assert.equal(
      calls[1].payload.text.includes(
        "https://api.example.com/api/users/me/email/verify?token="
      ),
      true
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalLogUrl === undefined) {
      delete process.env.EMAIL_VERIFICATION_LOG_URL;
    } else {
      process.env.EMAIL_VERIFICATION_LOG_URL = originalLogUrl;
    }
    if (originalProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = originalProvider;
    }
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
    if (originalFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = originalFrom;
    }
    if (originalReplyTo === undefined) {
      delete process.env.EMAIL_REPLY_TO;
    } else {
      process.env.EMAIL_REPLY_TO = originalReplyTo;
    }
    if (originalAppUrl === undefined) {
      delete process.env.APP_PUBLIC_URL;
    } else {
      process.env.APP_PUBLIC_URL = originalAppUrl;
    }
  }
});

test("sendEmailVerification – Resend failure does not log raw token or URL", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogUrl = process.env.EMAIL_VERIFICATION_LOG_URL;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const rawToken = "raw-secret-token";

  process.env.NODE_ENV = "production";
  process.env.EMAIL_VERIFICATION_LOG_URL = "false";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "HairBook <no-reply@example.com>";
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });
  setResendClientFactoryForTesting(() => ({
    emails: {
      send: async () => {
        throw new Error(`provider down ${rawToken}`);
      },
    },
  }));

  try {
    const result = await sendEmailVerification({
      user: { _id: userId, email: "test@example.com" },
      token: rawToken,
      req: { protocol: "https", get: () => "example.com" },
    });

    assert.deepEqual(result, { delivered: false, provider: "resend" });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, "email.verification_failed");
    const output = JSON.stringify(lines);
    assert.equal(output.includes(rawToken), false);
    assert.equal(output.includes("/email/verify"), false);
    assert.equal(output.includes("test@example.com"), false);
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalLogUrl === undefined) {
      delete process.env.EMAIL_VERIFICATION_LOG_URL;
    } else {
      process.env.EMAIL_VERIFICATION_LOG_URL = originalLogUrl;
    }
    if (originalProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = originalProvider;
    }
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
    if (originalFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = originalFrom;
    }
  }
});

// ── auth remains phone-only ──────────────────────────────────────────

test("registerUser – still requires phone even if email is supplied", async () => {
  const res = createResponse();

  await registerUser(
    { body: { name: "Test User", email: "test@example.com", password: "secret" } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Name, phone, email, and password are required");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – requires email", async () => {
  const res = createResponse();

  await registerUser(
    {
      body: {
        name: "Test User",
        phone: "+37400000000",
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Name, phone, email, and password are required");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – rejects invalid email", async () => {
  const res = createResponse();

  await registerUser(
    {
      body: {
        name: "Test User",
        email: "not-an-email",
        phone: "+37400000000",
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid email format");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – rejects passwords shorter than eight characters", async () => {
  const res = createResponse();

  await registerUser(
    {
      body: {
        name: "Test User",
        email: "test@example.com",
        phone: "+37400000000",
        password: "secret",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Password must be at least 8 characters");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – trims phone before duplicate lookup", async () => {
  const res = createResponse();
  let phoneSeen;

  User.findOne = async (filter) => {
    phoneSeen = filter.phone;
    return createBaseUser({ phone: filter.phone });
  };

  await registerUser(
    {
      body: {
        name: "Test User",
        email: "test@example.com",
        phone: "  +37400000000  ",
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Phone already exists");
  assert.equal(phoneSeen, "+37400000000");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – rejects phone values over max length", async () => {
  const res = createResponse();

  await registerUser(
    {
      body: {
        name: "Test User",
        email: "test@example.com",
        phone: `+${"1".repeat(32)}`,
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Phone must be 32 characters or less");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – normalizes email before duplicate lookup and save", async () => {
  const res = createResponse();
  let emailSeen;
  let createPayload;
  let createdUser;

  process.env.JWT_SECRET = "test-secret";
  User.findOne = async (filter) => {
    if (Object.hasOwn(filter, "email")) {
      emailSeen = filter.email;
    }
    return null;
  };
  User.create = async (payload) => {
    createPayload = payload;
    createdUser = createBaseUser({ ...payload, _id: userId });
    return createdUser;
  };

  const req = {
    body: {
      name: "Test User",
      email: "  Test@Example.COM  ",
      phone: "+37400000000",
      password: "secret123",
    },
  };
  await registerUser(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(issuedSessionCalls.length, 1);
  assert.equal(issuedSessionCalls[0].req, req);
  assert.equal(issuedSessionCalls[0].res, res);
  assert.equal(issuedSessionCalls[0].user, createdUser);
  assert.equal(emailSeen, "test@example.com");
  assert.equal(createPayload.email, "test@example.com");
  assert.equal(res.body.user.email, "test@example.com");
  assert.equal(res.body.user.emailVerified, false);
  assert.equal("refreshToken" in res.body, false);
  assert.equal("session" in res.body, false);
  assert.equal("familyId" in res.body, false);
  assert.equal("tokenHash" in res.body, false);
});

test("registerUser – duplicate email returns safe 400", async () => {
  const res = createResponse();

  User.findOne = async (filter) => {
    if (filter.phone) return null;
    if (filter.email === "existing@example.com") {
      return createBaseUser({ _id: otherUserId, email: filter.email });
    }
    return null;
  };

  await registerUser(
    {
      body: {
        name: "Test User",
        email: " Existing@Example.COM ",
        phone: "+37400000000",
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Email already in use");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – duplicate key email does not report phone error", async () => {
  const res = createResponse();

  process.env.JWT_SECRET = "test-secret";
  User.findOne = async () => null;
  User.create = async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    error.keyPattern = { email: 1 };
    throw error;
  };

  await registerUser(
    {
      body: {
        name: "Test User",
        email: "test@example.com",
        phone: "+37400000000",
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Email already in use");
  assert.equal(issuedSessionCalls.length, 0);
});

test("registerUser – new barber receives trial subscription", async () => {
  const res = createResponse();
  const barberUser = createBaseUser({
    _id: userId,
    role: "barber",
    phone: "+37400000000",
  });
  const plan = {
    _id: "plan-1",
    pricePerSeat: 5000,
    currency: "AMD",
  };
  let createdSubscription = null;
  let createdUser;

  process.env.JWT_SECRET = "test-secret";
  User.findOne = async () => null;
  User.create = async (payload) => {
    createdUser = { ...barberUser, ...payload };
    return createdUser;
  };
  SubscriptionPlan.findOne = async () => plan;
  Subscription.findOne = async () => null;
  Subscription.create = async (payload) => {
    createdSubscription = payload;
    return { _id: "subscription-1", ...payload };
  };

  const req = {
    body: {
      name: "Trial Barber",
      email: "trial-barber@example.com",
      phone: "+37400000000",
      password: "secret123",
      role: "barber",
    },
  };
  await registerUser(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(issuedSessionCalls.length, 1);
  assert.equal(issuedSessionCalls[0].req, req);
  assert.equal(issuedSessionCalls[0].res, res);
  assert.equal(issuedSessionCalls[0].user, createdUser);
  assert.equal(res.body.user.role, "barber");
  assert.equal(res.body.user.email, "trial-barber@example.com");
  assert.equal(res.body.user.emailVerified, false);
  assert.ok(res.body.token);
  assert.equal("refreshToken" in res.body, false);
  assert.equal("session" in res.body, false);
  assert.equal("familyId" in res.body, false);
  assert.equal("tokenHash" in res.body, false);
  assert.equal(createdSubscription.ownerType, "barber");
  assert.equal(createdSubscription.ownerRefModel, "User");
  assert.equal(String(createdSubscription.ownerId), String(userId));
  assert.equal(createdSubscription.status, "trialing");
  assert.equal(createdSubscription.seatCount, 1);
  assert.equal(createdSubscription.provider, "manual");
  assert.ok(createdSubscription.trialEndsAt);
});

test("registerUser – client registration does not create subscription", async () => {
  const res = createResponse();
  const clientUser = createBaseUser({
    _id: userId,
    role: "client",
    phone: "+37400000000",
  });
  let subscriptionCreateCalled = false;
  let createdPayload = null;
  let createdUser;

  process.env.JWT_SECRET = "test-secret";
  User.findOne = async () => null;
  User.create = async (payload) => {
    createdPayload = payload;
    createdUser = { ...clientUser, ...payload };
    return createdUser;
  };
  Subscription.create = async () => {
    subscriptionCreateCalled = true;
    return {};
  };

  const req = {
    body: {
      name: "Free Client",
      email: "free-client@example.com",
      phone: "+37400000000",
      password: "secret123",
      role: "client",
    },
  };
  await registerUser(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(issuedSessionCalls.length, 1);
  assert.equal(issuedSessionCalls[0].req, req);
  assert.equal(issuedSessionCalls[0].res, res);
  assert.equal(issuedSessionCalls[0].user, createdUser);
  assert.equal(res.body.user.role, "client");
  assert.equal(res.body.user.email, "free-client@example.com");
  assert.equal(createdPayload.email, "free-client@example.com");
  assert.equal(subscriptionCreateCalled, false);
  assert.equal("refreshToken" in res.body, false);
  assert.equal("session" in res.body, false);
  assert.equal("familyId" in res.body, false);
  assert.equal("tokenHash" in res.body, false);
});

test("loginUser – still requires phone and does not accept email-only login", async () => {
  const res = createResponse();

  await loginUser(
    { body: { email: "test@example.com", password: "secret" } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Phone and password are required");
  assert.equal(issuedSessionCalls.length, 0);
});
