import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { handlePaymentWebhook } from "./paymentController.js";

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  paymentProvider: process.env.PAYMENT_PROVIDER,
  webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
};

afterEach(() => {
  process.env.NODE_ENV = originalEnv.nodeEnv;
  if (originalEnv.paymentProvider === undefined) {
    delete process.env.PAYMENT_PROVIDER;
  } else {
    process.env.PAYMENT_PROVIDER = originalEnv.paymentProvider;
  }
  if (originalEnv.webhookSecret === undefined) {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
  } else {
    process.env.PAYMENT_WEBHOOK_SECRET = originalEnv.webhookSecret;
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

test("handlePaymentWebhook preserves service HTTP status, code, and message on errors", async () => {
  process.env.NODE_ENV = "production";
  process.env.PAYMENT_PROVIDER = "manual";
  delete process.env.PAYMENT_WEBHOOK_SECRET;

  const res = createResponse();

  await handlePaymentWebhook(
    {
      body: Buffer.from(
        JSON.stringify({
          id: "evt_manual_webhook",
          type: "payment.paid",
          providerPaymentId: "manual-payment-id",
        })
      ),
      headers: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    code: "WEBHOOK_NOT_SUPPORTED",
    message: "Manual provider does not support webhooks",
  });
});
