import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  sendEmailVerificationController,
  updateMyProfile,
  verifyEmailController,
} from "./userController.js";
import { loginUser, registerUser } from "./authController.js";
import User from "../models/User.js";
import BarberProfile from "../models/BarberProfile.js";
import Salon from "../models/Salon.js";
import { hashEmailVerificationToken } from "../utils/emailVerification.js";
import {
  sendEmailVerification,
  setResendClientFactoryForTesting,
} from "../services/emailService.js";

const originalUserMethods = {
  findById: User.findById,
  findByIdAndUpdate: User.findByIdAndUpdate,
  findOne: User.findOne,
};
const originalBarberProfileMethods = {
  findOneAndUpdate: BarberProfile.findOneAndUpdate,
};
const originalSalonMethods = {
  find: Salon.find,
  findById: Salon.findById,
};

const userId = "64c000000000000000000001";
const otherUserId = "64c000000000000000000002";

afterEach(() => {
  User.findById = originalUserMethods.findById;
  User.findByIdAndUpdate = originalUserMethods.findByIdAndUpdate;
  User.findOne = originalUserMethods.findOne;
  BarberProfile.findOneAndUpdate = originalBarberProfileMethods.findOneAndUpdate;
  Salon.find = originalSalonMethods.find;
  Salon.findById = originalSalonMethods.findById;
  setResendClientFactoryForTesting();
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
  const originalLog = console.log;
  const originalWarn = console.warn;
  const rawToken = "raw-secret-token";
  const logs = [];
  const warnings = [];

  process.env.NODE_ENV = "production";
  delete process.env.EMAIL_VERIFICATION_LOG_URL;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  console.log = (message) => logs.push(message);
  console.warn = (message) => warnings.push(message);

  try {
    const result = await sendEmailVerification({
      user: { _id: userId, email: "test@example.com" },
      token: rawToken,
      req: { protocol: "https", get: () => "example.com" },
    });

    assert.equal(result.delivered, false);
    assert.equal(result.provider, "none");
    assert.equal(result.verificationUrl, "");
    assert.equal(logs.length, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].includes(rawToken), false);
    assert.equal(warnings[0].includes("/email/verify"), false);
    assert.equal(warnings[0].includes("EMAIL_PROVIDER=resend"), true);
    assert.equal(warnings[0].includes("RESEND_API_KEY"), true);
    assert.equal(warnings[0].includes("EMAIL_FROM"), true);
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
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

test("sendEmailVerification – EMAIL_VERIFICATION_LOG_URL=true logs verification URL", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogUrl = process.env.EMAIL_VERIFICATION_LOG_URL;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalLog = console.log;
  const rawToken = "raw-secret-token";
  const logs = [];

  process.env.NODE_ENV = "production";
  process.env.EMAIL_VERIFICATION_LOG_URL = "true";
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  console.log = (message) => logs.push(message);

  try {
    const result = await sendEmailVerification({
      user: { _id: userId, email: "test@example.com" },
      token: rawToken,
      req: { protocol: "https", get: () => "example.com" },
    });

    assert.equal(result.delivered, false);
    assert.equal(result.provider, "log");
    assert.equal(result.verificationUrl.includes(rawToken), true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].startsWith("[emailService] Verification URL: "), true);
    assert.equal(logs[0].includes(rawToken), true);
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
    console.log = originalLog;
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
  const originalWarn = console.warn;
  const rawToken = "raw-secret-token";
  const warnings = [];

  process.env.NODE_ENV = "production";
  process.env.EMAIL_VERIFICATION_LOG_URL = "false";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "HairBook <no-reply@example.com>";
  console.warn = (message) => warnings.push(message);
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
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].includes(rawToken), false);
    assert.equal(warnings[0].includes("/email/verify"), false);
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
    console.warn = originalWarn;
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
  assert.equal(res.body.message, "Name, phone, and password are required");
});

test("registerUser – rejects passwords shorter than eight characters", async () => {
  const res = createResponse();

  await registerUser(
    {
      body: {
        name: "Test User",
        phone: "+37400000000",
        password: "secret",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Password must be at least 8 characters");
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
        phone: "  +37400000000  ",
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Phone already exists");
  assert.equal(phoneSeen, "+37400000000");
});

test("registerUser – rejects phone values over max length", async () => {
  const res = createResponse();

  await registerUser(
    {
      body: {
        name: "Test User",
        phone: `+${"1".repeat(32)}`,
        password: "secret123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Phone must be 32 characters or less");
});

test("loginUser – still requires phone and does not accept email-only login", async () => {
  const res = createResponse();

  await loginUser(
    { body: { email: "test@example.com", password: "secret" } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Phone and password are required");
});
