import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import DisabledPaymentProvider from "./DisabledPaymentProvider.js";
import ManualPaymentProvider from "./ManualPaymentProvider.js";
import MockPaymentProvider from "./MockPaymentProvider.js";
import { getPaymentProvider } from "./paymentProviderFactory.js";

const originalEnv = process.env.NODE_ENV;
const originalProvider = process.env.PAYMENT_PROVIDER;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  if (originalProvider === undefined) {
    delete process.env.PAYMENT_PROVIDER;
  } else {
    process.env.PAYMENT_PROVIDER = originalProvider;
  }
});

test("factory returns ManualPaymentProvider", () => {
  const provider = getPaymentProvider("manual");

  assert.ok(provider instanceof ManualPaymentProvider);
  assert.equal(provider.providerName, "manual");
});

test("factory defaults to manual provider", () => {
  const provider = getPaymentProvider();

  assert.ok(provider instanceof ManualPaymentProvider);
});

test("factory supports disabled provider", () => {
  const provider = getPaymentProvider("disabled");

  assert.ok(provider instanceof DisabledPaymentProvider);
  assert.equal(provider.providerName, "disabled");
});

test("factory supports mock provider outside production", () => {
  process.env.NODE_ENV = "development";
  const provider = getPaymentProvider("mock");

  assert.ok(provider instanceof MockPaymentProvider);
  assert.equal(provider.providerName, "mock");
});

test("mock provider is disabled in production", () => {
  process.env.NODE_ENV = "production";

  assert.throws(
    () => getPaymentProvider("mock"),
    (error) =>
      error.code === "PAYMENT_PROVIDER_DISABLED_IN_PRODUCTION" &&
      error.statusCode === 403
  );
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
    providerPaymentId: null,
    checkoutUrl: null,
    status: "pending",
    requiresManualActivation: true,
    message: "Manual payment activation is required.",
    amount: 5000,
    currency: "AMD",
    metadata: { ownerType: "barber" },
  });
});
