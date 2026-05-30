import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getClientBookings } from "./bookingReadController.js";
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
