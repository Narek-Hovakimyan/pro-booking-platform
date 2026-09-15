import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";

import {
  analyzeBookingDepositAttempts,
  runSubscriptionPaymentAttemptAudit,
} from "./audit-subscription-payment-attempts.js";

const objectId = (value) => new mongoose.Types.ObjectId(value);
const attempt = (overrides = {}) => ({
  _id: objectId("64b000000000000000000001"),
  bookingId: objectId("64b000000000000000000002"),
  purpose: "booking_deposit",
  status: "pending",
  provider: "manual",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const fakeModel = (attempts) => ({
  find(filter) {
    assert.deepEqual(filter, { purpose: "booking_deposit" });
    return {
      select() { return this; },
      lean() { return this; },
      async *cursor() { yield* attempts; },
    };
  },
});

const runAudit = async (attempts, options = {}) => {
  const stdout = [];
  const stderr = [];
  const exitCodes = [];
  const result = await runSubscriptionPaymentAttemptAudit({
    environment: { MONGO_URI: "mongodb://audit.test/hairbook" },
    PaymentAttemptModel: fakeModel(attempts),
    connect: async () => {},
    disconnect: async () => {},
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
    ...options,
  });
  return { result, stdout, stderr, exitCodes };
};

test("audit accepts empty and unique booking-deposit datasets", async () => {
  const empty = await runAudit([]);
  const unique = await runAudit([
    attempt(),
    attempt({
      _id: objectId("64b000000000000000000003"),
      bookingId: objectId("64b000000000000000000004"),
      status: "requires_action",
      provider: "mock",
    }),
  ]);

  assert.equal(empty.result.safeForFutureBookingDepositUniqueIndex, true);
  assert.equal(unique.result.safeForFutureBookingDepositUniqueIndex, true);
  assert.deepEqual(empty.exitCodes, []);
  assert.deepEqual(unique.exitCodes, []);
  assert.equal(JSON.parse(empty.stdout.join("")).safeForFutureBookingDepositUniqueIndex, true);
  assert.equal(JSON.parse(unique.stdout.join("")).safeForFutureBookingDepositUniqueIndex, true);
});

test("audit reports deterministic mixed-status duplicate groups without sensitive fields", async () => {
  const first = attempt({ status: "paid", provider: "mock" });
  const second = attempt({
    _id: objectId("64b000000000000000000005"),
    status: "failed",
    provider: "manual",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    checkoutUrl: "https://private.example/checkout",
    metadata: { token: "secret" },
    providerPaymentId: "private-payment-reference",
  });
  const capture = await runAudit([second, first]);
  const output = capture.stdout.join("");

  assert.equal(capture.result.safeForFutureBookingDepositUniqueIndex, false);
  assert.equal(capture.result.duplicateGroups.length, 1);
  assert.deepEqual(
    capture.result.duplicateGroups[0].attempts.map(({ status }) => status),
    ["paid", "failed"]
  );
  assert.deepEqual(capture.exitCodes, [2]);
  assert.equal(output.includes('"safeForFutureBookingDepositUniqueIndex": false'), true);
  assert.equal(output.includes("checkoutUrl"), false);
  assert.equal(output.includes("secret"), false);
  assert.equal(output.includes("private-payment-reference"), false);
});

test("audit blocks malformed booking-deposit records and ignores other purposes", async () => {
  const malformed = attempt({ bookingId: null });
  const ignored = attempt({ purpose: "subscription", bookingId: null, status: "paid" });
  const summary = analyzeBookingDepositAttempts([malformed, ignored]);
  const capture = await runAudit([malformed]);

  assert.equal(summary.malformedRows[0].reasons.includes("booking_id_missing_or_invalid"), true);
  assert.equal(summary.scannedBookingDepositAttempts, 1);
  assert.equal(capture.result.malformedRows.length, 1);
  assert.deepEqual(capture.exitCodes, [2]);
  assert.equal(capture.stdout.join("").includes('"safeForFutureBookingDepositUniqueIndex": false'), true);
  assert.equal(ignored.purpose, "subscription");
});

test("audit fails closed for configuration and database failures", async () => {
  const exitCodes = [];
  const stderr = [];
  const missing = await runSubscriptionPaymentAttemptAudit({
    environment: {},
    setExitCode: (code) => exitCodes.push(code),
    writeStderr: (value) => stderr.push(value),
  });
  const failed = await runAudit([], {
    connect: async () => { throw new Error("database password=secret"); },
  });

  assert.equal(missing, null);
  assert.deepEqual(exitCodes, [1]);
  assert.equal(stderr.join("").includes("secret"), false);
  assert.equal(failed.result, null);
  assert.deepEqual(failed.exitCodes, [1]);
});

test("audit fails closed when the booking-deposit cursor rejects", async () => {
  const sensitiveError = new Error(
    "mongodb://user:password@database/private checkoutUrl=https://private.example token=secret"
  );
  const cursorFailureModel = {
    find(filter) {
      assert.deepEqual(filter, { purpose: "booking_deposit" });
      return {
        select() { return this; },
        lean() { return this; },
        async *cursor() { throw sensitiveError; },
      };
    },
  };
  const capture = await runAudit([], { PaymentAttemptModel: cursorFailureModel });
  const output = `${capture.stdout.join("")}${capture.stderr.join("")}`;

  assert.equal(capture.result, null);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.equal(capture.stdout.length, 0);
  assert.equal(output.includes("password"), false);
  assert.equal(output.includes("checkoutUrl"), false);
  assert.equal(output.includes("secret"), false);
});

test("audit fails closed when cleanup rejects after a safe inspection", async () => {
  const capture = await runAudit([attempt()], {
    disconnect: async () => {
      throw new Error("mongodb://user:password@database metadata=secret");
    },
  });
  const output = `${capture.stdout.join("")}${capture.stderr.join("")}`;

  assert.equal(capture.result, null);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.equal(capture.stdout.length, 0);
  assert.equal(capture.stderr.join("").includes("disconnect could not be completed"), true);
  assert.equal(output.includes("password"), false);
  assert.equal(output.includes("metadata=secret"), false);
});
