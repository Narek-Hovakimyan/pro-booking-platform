import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  sendEmail,
  sendPasswordResetEmail,
  setEmailTransportFactoryForTesting,
} from "./emailService.js";

const emailEnvKeys = [
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_SECURE",
  "EMAIL_USER",
  "EMAIL_PASS",
  "EMAIL_FROM",
];
const originalEmailEnv = Object.fromEntries(
  emailEnvKeys.map((key) => [key, process.env[key]])
);
const originalConsoleWarn = console.warn;

afterEach(() => {
  setEmailTransportFactoryForTesting();
  console.warn = originalConsoleWarn;
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
});

test("sendEmail delivery failure logs safe warning without payload details", async () => {
  configureSmtpEnv();
  const warnings = [];

  console.warn = (...args) => warnings.push(args.join(" "));
  setEmailTransportFactoryForTesting(() => ({
    sendMail: async () => {
      throw new Error("provider down token=raw-token EMAIL_PASS=smtp-pass");
    },
  }));

  const result = await sendEmail({
    to: "test@example.com",
    subject: "Secret subject",
    text: "token=raw-token",
    html: "<p>token=raw-token</p>",
  });

  assert.deepEqual(result, { delivered: false, provider: "smtp" });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].includes("raw-token"), false);
  assert.equal(warnings[0].includes("smtp-pass"), false);
  assert.equal(warnings[0].includes("test@example.com"), false);
});
