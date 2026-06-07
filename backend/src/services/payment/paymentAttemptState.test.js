import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyPaymentAttemptTransition,
  assertPaymentAttemptTransition,
} from "./paymentAttemptState.js";

test("payment attempt state machine allows expected transitions", () => {
  assert.deepEqual(assertPaymentAttemptTransition("pending", "paid"), {
    idempotent: false,
  });
  assert.deepEqual(assertPaymentAttemptTransition("pending", "failed"), {
    idempotent: false,
  });
  assert.deepEqual(assertPaymentAttemptTransition("pending", "cancelled"), {
    idempotent: false,
  });
  assert.deepEqual(assertPaymentAttemptTransition("requires_action", "paid"), {
    idempotent: false,
  });
  assert.deepEqual(assertPaymentAttemptTransition("paid", "refunded"), {
    idempotent: false,
  });
});

test("payment attempt state machine treats duplicate paid as idempotent", () => {
  assert.deepEqual(assertPaymentAttemptTransition("paid", "paid"), {
    idempotent: true,
  });
});

test("payment attempt state machine rejects unsafe paid transitions", () => {
  for (const status of ["failed", "cancelled", "refunded"]) {
    assert.throws(
      () => assertPaymentAttemptTransition(status, "paid"),
      (error) =>
        error.code === "INVALID_PAYMENT_ATTEMPT_TRANSITION" &&
        error.statusCode === 400
    );
  }
});

test("payment attempt state machine rejects unknown or unsupported same-status transitions", () => {
  assert.throws(
    () => assertPaymentAttemptTransition("expired", "expired"),
    (error) =>
      error.code === "INVALID_PAYMENT_ATTEMPT_TRANSITION" &&
      error.statusCode === 400
  );
  assert.throws(
    () => assertPaymentAttemptTransition("mystery", "mystery"),
    (error) =>
      error.code === "INVALID_PAYMENT_ATTEMPT_TRANSITION" &&
      error.statusCode === 400
  );
});

test("applyPaymentAttemptTransition sets payment timestamps", () => {
  const now = new Date("2026-06-07T10:00:00Z");
  const attempt = { status: "pending" };

  applyPaymentAttemptTransition(attempt, "paid", now);

  assert.equal(attempt.status, "paid");
  assert.equal(attempt.paidAt, now);
  assert.equal(attempt.confirmedAt, now);
});
