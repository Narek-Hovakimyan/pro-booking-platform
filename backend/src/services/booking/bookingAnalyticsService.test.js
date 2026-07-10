import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import { getBarberMonthlyIncomeSummary } from "./bookingAnalyticsService.js";

const originalBookingFind = Booking.find;

const barberId = "64b000000000000000000001";
const otherBarberId = "64b000000000000000000002";
const clientId = "64b000000000000000000003";
const month = "2024-06";
const barberRequester = { _id: barberId, role: "barber" };
const otherBarberRequester = { _id: otherBarberId, role: "barber" };
const clientRequester = { _id: clientId, role: "client" };

const createBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId,
  clientId,
  status: "completed",
  bookingDate: "2024-06-15",
  dayKey: "sat",
  completedAt: null,
  price: 100,
  ...overrides,
});

afterEach(() => {
  Booking.find = originalBookingFind;
});

const assertAnalyticsError = async (promise, statusCode, message) => {
  await assert.rejects(
    promise,
    (error) => {
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.message, message);
      return true;
    }
  );
};

test("valid barber gets monthly income summary", async () => {
  Booking.find = async (query) => {
    assert.equal(String(query.barberId), barberId);
    assert.deepEqual(query.status.$in, ["pending", "accepted", "completed"]);
    assert.equal(String(query.$or[0].bookingDate.$regex), `^${month}-`);
    assert.equal(String(query.$or[1].dayKey.$regex), `^${month}-`);
    return [
      createBooking({ status: "completed", bookingDate: "2024-06-03", price: 100 }),
      createBooking({ status: "pending", bookingDate: "2024-06-04", price: 50 }),
      createBooking({ status: "accepted", dayKey: "2024-06-05", bookingDate: "", price: 30 }),
    ];
  };

  const summary = await getBarberMonthlyIncomeSummary({
    barberId,
    month,
    requester: barberRequester,
  });

  assert.deepEqual(summary, {
    month,
    completedIncome: 100,
    completedCount: 1,
    pendingIncome: 80,
    pendingCount: 2,
    totalExpectedIncome: 180,
    totalIncome: 100,
    completedBookingsCount: 1,
  });
});

test("invalid month is rejected with structured 400", async () => {
  await assertAnalyticsError(
    getBarberMonthlyIncomeSummary({
      barberId,
      month: "2024-13",
      requester: barberRequester,
    }),
    400,
    "Month must use YYYY-MM format"
  );
});

test("different barber cannot access another barber income", async () => {
  await assertAnalyticsError(
    getBarberMonthlyIncomeSummary({
      barberId,
      month,
      requester: otherBarberRequester,
    }),
    403,
    "You can fetch only your own income"
  );
});

test("client cannot access barber income", async () => {
  await assertAnalyticsError(
    getBarberMonthlyIncomeSummary({
      barberId,
      month,
      requester: clientRequester,
    }),
    403,
    "You can fetch only your own income"
  );
});

test("only intended booking statuses count toward income", async () => {
  Booking.find = async () => [
    createBooking({ status: "completed", bookingDate: "2024-06-01", price: 90 }),
    createBooking({ status: "pending", bookingDate: "2024-06-02", price: 40 }),
    createBooking({ status: "accepted", bookingDate: "2024-06-03", price: 30 }),
    createBooking({ status: "cancelled", bookingDate: "2024-06-04", price: 500 }),
    createBooking({ status: "rejected", bookingDate: "2024-06-05", price: 600 }),
  ];

  const summary = await getBarberMonthlyIncomeSummary({
    barberId,
    month,
    requester: barberRequester,
  });

  assert.equal(summary.completedIncome, 90);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.pendingIncome, 70);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.totalExpectedIncome, 160);
});

test("month filter excludes bookings outside selected month", async () => {
  Booking.find = async () => [
    createBooking({ status: "completed", bookingDate: "2024-06-30", price: 100 }),
    createBooking({ status: "completed", bookingDate: "2024-07-01", price: 900 }),
    createBooking({ status: "pending", dayKey: "2024-05-31", bookingDate: "", price: 800 }),
  ];

  const summary = await getBarberMonthlyIncomeSummary({
    barberId,
    month,
    requester: barberRequester,
  });

  assert.equal(summary.completedIncome, 100);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.pendingIncome, 0);
  assert.equal(summary.pendingCount, 0);
});

test("completedAt fallback query uses selected month boundaries", async () => {
  Booking.find = async (query) => {
    const completedAtRange = query.$or[2].completedAt;

    assert.equal(completedAtRange.$gte.getFullYear(), 2024);
    assert.equal(completedAtRange.$gte.getMonth(), 5);
    assert.equal(completedAtRange.$gte.getDate(), 1);
    assert.equal(completedAtRange.$lt.getFullYear(), 2024);
    assert.equal(completedAtRange.$lt.getMonth(), 6);
    assert.equal(completedAtRange.$lt.getDate(), 1);

    return [
      createBooking({
        status: "completed",
        bookingDate: "",
        dayKey: "",
        completedAt: new Date(2024, 5, 20),
        price: 120,
      }),
    ];
  };

  const summary = await getBarberMonthlyIncomeSummary({
    barberId,
    month,
    requester: barberRequester,
  });

  assert.equal(summary.completedIncome, 120);
  assert.equal(summary.completedCount, 1);
});
