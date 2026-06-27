import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";

import User from "../models/User.js";
import { forgotPassword, resetPassword } from "./authController.js";

const genericResetMessage =
  "If an account exists, password reset instructions have been sent.";

const originalFindOne = User.findOne;
const originalNodeEnv = process.env.NODE_ENV;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

const selectable = (result, onSelect = () => {}) => ({
  select(fields) {
    onSelect(fields);
    return result;
  },
});

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

afterEach(() => {
  User.findOne = originalFindOne;
  console.log = originalConsoleLog;
  console.error = originalConsoleError;

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("forgot-password known phone stores hashed token and expiry without returning raw token", async () => {
  process.env.NODE_ENV = "development";
  const logs = [];
  let selectedFields = "";
  let saved = false;
  const user = {
    async save() {
      saved = true;
    },
  };

  console.log = (...args) => logs.push(args.join(" "));
  User.findOne = (query) => {
    assert.deepEqual(query, { phone: "+37400111222" });
    return selectable(user, (fields) => {
      selectedFields = fields;
    });
  };

  const before = Date.now();
  const res = mockRes();
  await forgotPassword({ body: { phone: "  +37400111222  " } }, res);
  const after = Date.now();
  const rawToken = logs[0]?.match(/token=([a-f0-9]{64})/)?.[1];

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: genericResetMessage });
  assert.equal(saved, true);
  assert.match(selectedFields, /\+resetPasswordTokenHash/);
  assert.ok(rawToken, "expected dev log to include raw token");
  assert.equal(user.resetPasswordTokenHash, hashToken(rawToken));
  assert.notEqual(user.resetPasswordTokenHash, rawToken);
  assert.ok(user.resetPasswordExpires instanceof Date);
  assert.ok(user.resetPasswordExpires.getTime() >= before + 15 * 60 * 1000);
  assert.ok(user.resetPasswordExpires.getTime() <= after + 15 * 60 * 1000);
  assert.ok(user.resetPasswordSentAt instanceof Date);
  assert.equal(JSON.stringify(res.body).includes(rawToken), false);
});

test("forgot-password unknown phone returns same generic response", async () => {
  const logs = [];
  console.log = (...args) => logs.push(args.join(" "));
  User.findOne = (query) => {
    assert.deepEqual(query, { phone: "+37400999000" });
    return selectable(null);
  };

  const res = mockRes();
  await forgotPassword({ body: { phone: "+37400999000" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: genericResetMessage });
  assert.deepEqual(logs, []);
});

test("forgot-password does not log reset token in production", async () => {
  process.env.NODE_ENV = "production";
  const logs = [];
  const user = {
    async save() {},
  };

  console.log = (...args) => logs.push(args.join(" "));
  User.findOne = () => selectable(user);

  const res = mockRes();
  await forgotPassword({ body: { phone: "+37400111222" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: genericResetMessage });
  assert.deepEqual(logs, []);
});

test("reset-password rejects missing token or password", async () => {
  let res = mockRes();
  await resetPassword({ body: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Token and password are required");

  res = mockRes();
  await resetPassword({ body: { token: "sometoken" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Token and password are required");

  res = mockRes();
  await resetPassword({ body: { password: "newpassword123" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Token and password are required");
});

test("reset-password rejects non-string token without hashing error", async () => {
  const res = mockRes();
  await resetPassword({ body: { token: { value: "bad" }, password: "newpassword123" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Token and password are required");
});

test("reset-password rejects password shorter than 8 characters", async () => {
  const req = { body: { token: "sometoken", password: "short" } };
  const res = mockRes();
  await resetPassword(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Password must be at least 8 characters");
});

test("reset-password rejects invalid token using SHA-256 token lookup and expiry check", async () => {
  let capturedQuery = null;
  User.findOne = (query) => {
    capturedQuery = query;
    return selectable(null);
  };

  const res = mockRes();
  await resetPassword({ body: { token: "invalid-token", password: "newpassword123" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid or expired reset token");
  assert.equal(capturedQuery.resetPasswordTokenHash, hashToken("invalid-token"));
  assert.ok(capturedQuery.resetPasswordExpires.$gt instanceof Date);
});

test("reset-password rejects expired token", async () => {
  User.findOne = (query) => {
    assert.equal(query.resetPasswordTokenHash, hashToken("expired-token"));
    assert.ok(query.resetPasswordExpires.$gt instanceof Date);
    return selectable(null);
  };

  const res = mockRes();
  await resetPassword({ body: { token: "expired-token", password: "newpassword123" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid or expired reset token");
});

test("reset-password with valid token changes password and clears reset fields", async () => {
  const oldPassword = "oldpassword123";
  const newPassword = "newpassword456";
  const user = {
    password: await bcrypt.hash(oldPassword, 10),
    resetPasswordTokenHash: hashToken("valid-token"),
    resetPasswordExpires: new Date(Date.now() + 60_000),
    resetPasswordSentAt: new Date(),
    saved: false,
    async save() {
      this.saved = true;
    },
  };

  User.findOne = (query) => {
    assert.equal(query.resetPasswordTokenHash, hashToken("valid-token"));
    assert.ok(query.resetPasswordExpires.$gt instanceof Date);
    return selectable(user);
  };

  const res = mockRes();
  await resetPassword({ body: { token: " valid-token ", password: newPassword } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Password has been reset successfully." });
  assert.equal(user.saved, true);
  assert.equal(await bcrypt.compare(newPassword, user.password), true);
  assert.equal(await bcrypt.compare(oldPassword, user.password), false);
  assert.equal(user.resetPasswordTokenHash, "");
  assert.equal(user.resetPasswordExpires, null);
  assert.equal(user.resetPasswordSentAt, null);
  assert.equal("password" in res.body, false);
});

test("password reset fields are excluded by default from User queries", () => {
  assert.equal(User.schema.path("resetPasswordTokenHash").options.select, false);
  assert.equal(User.schema.path("resetPasswordExpires").options.select, false);
  assert.equal(User.schema.path("resetPasswordSentAt").options.select, false);
});
