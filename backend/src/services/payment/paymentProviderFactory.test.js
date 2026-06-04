import assert from "node:assert/strict";
import { test } from "node:test";

import ManualPaymentProvider from "./ManualPaymentProvider.js";
import { getPaymentProvider } from "./paymentProviderFactory.js";

test("factory returns ManualPaymentProvider", () => {
  const provider = getPaymentProvider("manual");

  assert.ok(provider instanceof ManualPaymentProvider);
  assert.equal(provider.providerName, "manual");
});

test("factory defaults to manual provider", () => {
  const provider = getPaymentProvider();

  assert.ok(provider instanceof ManualPaymentProvider);
});

test("unsupported provider throws controlled error", () => {
  assert.throws(
    () => getPaymentProvider("stripe"),
    (error) =>
      error.code === "UNSUPPORTED_PAYMENT_PROVIDER" &&
      error.statusCode === 400 &&
      /Unsupported payment provider: stripe/.test(error.message)
  );
});

test("ManualPaymentProvider createPaymentIntent returns manual activation object", async () => {
  const provider = new ManualPaymentProvider();

  const result = await provider.createPaymentIntent({
    amount: 5000,
    currency: "AMD",
    metadata: { ownerType: "barber" },
  });

  assert.deepEqual(result, {
    provider: "manual",
    requiresManualActivation: true,
    message: "Manual payment activation is required.",
    amount: 5000,
    currency: "AMD",
    metadata: { ownerType: "barber" },
  });
});
