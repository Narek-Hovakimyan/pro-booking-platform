import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getMyRevenue } from "./revenueController.js";
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

test("getMyRevenue unexpected error returns generic 500 without leaking raw message", async () => {
  const barberId = "64b000000000000000000001";
  const res = createResponse();

  Booking.find = () => ({
    lean: async () => {
      throw new Error("raw revenue aggregation failure");
    },
  });

  await withSilencedConsoleError(async () => {
    await getMyRevenue(
      {
        user: { _id: barberId, role: "barber" },
        query: {},
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch revenue summary");
  assert.equal(res.body.message.includes("raw revenue aggregation failure"), false);
});
