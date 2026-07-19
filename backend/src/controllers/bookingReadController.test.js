import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getClientBookings } from "./bookings/bookingReadController.js";
import Booking from "../models/Booking.js";

const originalMethods = {
  bookingFind: Booking.find,
};

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
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

const withSilencedConsoleError = async (task) => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await task();
  } finally {
    console.error = originalConsoleError;
  }
};

test("getClientBookings unexpected DB error returns generic 500", async () => {
  const userId = "64b000000000000000000001";
  const res = createResponse();

  Booking.find = () => ({
    select: async () => {
      throw new Error("raw booking read db failure");
    },
  });

  await withSilencedConsoleError(async () => {
    await getClientBookings(
      {
        user: { _id: userId },
        params: { clientId: userId },
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch client bookings");
  assert.equal(res.body.message.includes("raw booking read db failure"), false);
});

test("getClientBookings hides internal payment references but keeps safe snapshot fields", async () => {
  const userId = "64b000000000000000000001";
  const res = createResponse();

  Booking.find = () => ({
    select: async () => [
      {
        _id: "booking-1",
        clientId: userId,
        currency: "AMD",
        paidAmount: 100,
        paymentStatus: "paid",
        paymentProvider: "mock",
        refundStatus: "none",
        refundedAmount: 0,
        paymentTransactionIds: ["64b000000000000000009001"],
        refundTransactionIds: ["64b000000000000000009002"],
        providerPaymentId: "provider-payment-private",
        providerTransactionId: "provider-transaction-private",
        rawWebhookPayload: { secret: true },
      },
    ],
  });

  await getClientBookings(
    {
      user: { _id: userId },
      params: { clientId: userId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].currency, "AMD");
  assert.equal(res.body[0].paidAmount, 100);
  assert.equal(res.body[0].paymentStatus, "paid");
  assert.equal(res.body[0].paymentProvider, "mock");
  assert.equal(res.body[0].refundStatus, "none");
  assert.equal(res.body[0].refundedAmount, 0);
  assert.equal(res.body[0].paymentTransactionIds, undefined);
  assert.equal(res.body[0].refundTransactionIds, undefined);
  assert.equal(res.body[0].providerPaymentId, undefined);
  assert.equal(res.body[0].providerTransactionId, undefined);
  assert.equal(res.body[0].rawWebhookPayload, undefined);
});
