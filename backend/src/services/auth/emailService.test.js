import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";

import { getLogger, resetLogger } from "../../config/logger.js";
import {
  sendEmail,
  sendEmailVerification,
  sendPasswordResetEmail,
  setEmailTransportFactoryForTesting,
  setResendClientFactoryForTesting,
} from "./emailService.js";

const emailEnvKeys = [
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_SECURE",
  "EMAIL_USER",
  "EMAIL_PASS",
  "EMAIL_FROM",
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "EMAIL_REPLY_TO",
  "APP_PUBLIC_URL",
  "NODE_ENV",
];
const originalEmailEnv = Object.fromEntries(
  emailEnvKeys.map((key) => [key, process.env[key]])
);
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
  getLogger({ level: "silent" });
});

afterEach(() => {
  setEmailTransportFactoryForTesting();
  setResendClientFactoryForTesting();
  resetLogger();
  for (const key of emailEnvKeys) {
    if (originalEmailEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEmailEnv[key];
    }
  }
});

const configureSmtpEnv = () => {
  process.env.EMAIL_HOST = "smtp.example.com";
  process.env.EMAIL_PORT = "587";
  process.env.EMAIL_SECURE = "false";
  process.env.EMAIL_USER = "smtp-user";
  process.env.EMAIL_PASS = "smtp-pass";
  process.env.EMAIL_FROM = "HairBook <no-reply@example.com>";
};

test("sendEmail reports disabled when SMTP config is missing", async () => {
  for (const key of emailEnvKeys) {
    delete process.env[key];
  }

  const result = await sendEmail({
    to: "test@example.com",
    subject: "Hello",
    text: "Hello",
    html: "<p>Hello</p>",
  });

  assert.equal(result.delivered, false);
  assert.equal(result.provider, "smtp");
  assert.equal(result.disabled, true);
  assert.deepEqual(result.missing, [
    "EMAIL_HOST",
    "EMAIL_PORT",
    "EMAIL_USER",
    "EMAIL_PASS",
    "EMAIL_FROM",
  ]);
});

test("sendPasswordResetEmail sends expected SMTP payload", async () => {
  configureSmtpEnv();
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });
  const calls = [];

  setEmailTransportFactoryForTesting((config) => {
    calls.push({ config });
    return {
      sendMail: async (payload) => {
        calls.push({ payload });
        return { messageId: "email-1" };
      },
    };
  });

  const result = await sendPasswordResetEmail({
    to: "test@example.com",
    resetUrl: "https://app.example.com/reset-password?token=raw-token",
    appName: "HairBook",
  });

  assert.deepEqual(result, {
    delivered: true,
    provider: "smtp",
    id: "email-1",
  });
  assert.deepEqual(calls[0].config, {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: {
      user: "smtp-user",
      pass: "smtp-pass",
    },
  });
  assert.equal(calls[1].payload.from, "HairBook <no-reply@example.com>");
  assert.equal(calls[1].payload.to, "test@example.com");
  assert.equal(calls[1].payload.subject, "Reset your HairBook password");
  assert.equal(calls[1].payload.text.includes("https://app.example.com/reset-password?token=raw-token"), true);
  assert.equal(calls[1].payload.text.includes("expires in 15 minutes"), true);
  assert.equal(calls[1].payload.html.includes("https://app.example.com/reset-password?token=raw-token"), true);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "email.password_reset_sent");
  const output = JSON.stringify(lines);
  assert.equal(output.includes("raw-token"), false);
  assert.equal(output.includes("test@example.com"), false);
  assert.equal(output.includes("+37400111222"), false);
  assert.equal(output.includes("smtp-pass"), false);
});

test("sendEmail delivery failure logs a sanitized structured warning without payload details", async () => {
  configureSmtpEnv();
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });

  setEmailTransportFactoryForTesting(() => ({
    sendMail: async () => {
      const error = new Error("provider down token=raw-token EMAIL_PASS=smtp-pass");
      error.config = {
        auth: { user: "smtp-user", pass: "smtp-pass" },
        headers: { authorization: "Bearer provider-secret" },
      };
      throw error;
    },
  }));

  const result = await sendEmail({
    to: "test@example.com",
    subject: "Secret subject",
    text: "token=raw-token",
    html: "<p>token=raw-token</p>",
  });

  assert.deepEqual(result, { delivered: false, provider: "smtp" });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "email.failed");
  assert.equal(lines[0].err.config, undefined);
  const output = JSON.stringify(lines);
  assert.equal(output.includes("raw-token"), false);
  assert.equal(output.includes("smtp-pass"), false);
  assert.equal(output.includes("provider-secret"), false);
  assert.equal(output.includes("test@example.com"), false);
});

test("verification fallback logs no URL, token, recipient, or phone", async () => {
  process.env.NODE_ENV = "development";
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });
  const token = "verification-token-secret";
  const email = "verify@example.com";
  const phone = "+37400111222";

  const result = await sendEmailVerification({
    user: { _id: "user-1", name: "Verifier", email, phone },
    token,
  });

  assert.equal(result.delivered, false);
  assert.equal(result.provider, "log");
  assert.ok(result.verificationUrl.includes(token));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "email.verification_skipped");
  const output = JSON.stringify(lines);
  assert.equal(output.includes(token), false);
  assert.equal(output.includes(email), false);
  assert.equal(output.includes(phone), false);
  assert.equal(output.includes("/verify?token="), false);
});

test("verification delivery logs no URL, token, recipient, or payload", async () => {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "resend-api-secret";
  process.env.EMAIL_FROM = "HairBook <no-reply@example.com>";
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });
  const calls = [];
  const token = "verification-token-secret";
  const email = "verify@example.com";
  const phone = "+37400111222";
  setResendClientFactoryForTesting(() => ({
    emails: {
      send: async (payload) => {
        calls.push(payload);
        return { data: { id: "verification-email-1" } };
      },
    },
  }));

  const result = await sendEmailVerification({
    user: { _id: "user-1", name: "Verifier", email, phone },
    token,
  });

  assert.deepEqual(result, {
    delivered: true,
    provider: "resend",
    id: "verification-email-1",
  });
  assert.equal(calls[0].to, email);
  assert.ok(calls[0].text.includes(token));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "email.verification_sent");
  const output = JSON.stringify(lines);
  assert.equal(output.includes(token), false);
  assert.equal(output.includes(email), false);
  assert.equal(output.includes(phone), false);
  assert.equal(output.includes("resend-api-secret"), false);
});
