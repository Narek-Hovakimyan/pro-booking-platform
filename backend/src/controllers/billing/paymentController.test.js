import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

import { handlePaymentWebhook } from "./paymentController.js";
import {
  getControllerErrorStatusCode,
  sendControllerError,
} from "../../utils/controllerError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllerPath = path.join(__dirname, "paymentController.js");

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

let cachedSourcePromise;

const loadPaymentController = async (processPaymentWebhook) => {
  cachedSourcePromise ||= fs.readFile(controllerPath, "utf8");
  const source = await cachedSourcePromise;
  const transformed = source
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g, "")
    .replace(/export const /g, "const ")
    .concat("\nreturn { handlePaymentWebhook };");
  const factory = new Function(
    "processPaymentWebhook",
    "getControllerErrorStatusCode",
    "sendControllerError",
    transformed
  );

  return factory(
    processPaymentWebhook,
    getControllerErrorStatusCode,
    sendControllerError
  );
};

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

test("handlePaymentWebhook redacts unexpected provider and persistence failures", async () => {
  const rawError = new Error(
    "MongoServerError: topology rs0 db=hairbook collection=paymentattempts index=providerEventId_1 provider_secret=sk_internal"
  );
  const { handlePaymentWebhook: controller } = await loadPaymentController(
    async () => {
      throw rawError;
    }
  );
  const res = createResponse();

  await controller({ body: Buffer.from("{}"), headers: {} }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not process payment webhook" });
  const response = JSON.stringify(res.body);
  for (const internalDetail of [
    "MongoServerError",
    "topology",
    "rs0",
    "hairbook",
    "paymentattempts",
    "providerEventId_1",
    "provider_secret",
    "sk_internal",
  ]) {
    assert.equal(response.includes(internalDetail), false);
  }
});
