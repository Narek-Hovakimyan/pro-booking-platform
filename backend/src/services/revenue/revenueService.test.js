import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import { getBarberRevenueSummary } from "./revenueService.js";

const originalBookingFind = Booking.find;

const barberId = "64b000000000000000000001";
const otherBarberId = "64b000000000000000000002";
const clientId = "64b000000000000000000003";
const barberRequester = { _id: barberId, role: "barber" };
const otherBarberRequester = { _id: otherBarberId, role: "barber" };
const clientRequester = { _id: clientId, role: "client" };
const from = "2024-06-01";
const to = "2024-06-30";

const createBooking = (overrides = {}) => ({
  _id: `booking-${Math.random().toString(36).slice(2, 8)}`,
  barberId,
  clientId,
  status: "completed",
  bookingDate: "2024-06-15",
  dayKey: "2024-06-15",
  completedAt: null,
  price: 100,
  serviceName: "Haircut",
  ...overrides,
});

const assertRevenueError = async (promise, statusCode, message) => {
  await assert.rejects(
    promise,
    (error) => {
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.message, message);
      return true;
    }
  );
};

const mockFind = (data) => () => ({
  lean: async () => data,
});

// For tests that need to inspect the query object
const mockFindWithQuery = (assertQueryFn) => (query) => {
  assertQueryFn(query);
  return { lean: async () => [] };
};

afterEach(() => {
  Booking.find = originalBookingFind;
});

// ── Authorization ──

test("barber gets revenue summary for own completed bookings", async () => {
  Booking.find = mockFind([
    createBooking({ bookingDate: "2024-06-03", price: 100, serviceName: "Haircut" }),
    createBooking({ bookingDate: "2024-06-04", price: 50, serviceName: "Beard Trim" }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.totalRevenue, 150);
  assert.equal(summary.completedBookingsCount, 2);
  assert.equal(summary.averageBookingValue, 75);
  assert.equal(summary.revenueByDay.length, 2);
  assert.equal(summary.from, from);
  assert.equal(summary.to, to);
});

test("revenue summary uses finalPrice when present", async () => {
  Booking.find = mockFind([
    createBooking({
      bookingDate: "2024-06-03",
      price: 100,
      finalPrice: 70,
      promotionId: "promotion-1",
      serviceName: "Haircut",
    }),
    createBooking({
      bookingDate: "2024-06-04",
      price: 50,
      finalPrice: 0,
      promotionId: "promotion-2",
      serviceName: "Beard Trim",
    }),
    createBooking({
      bookingDate: "2024-06-05",
      price: 30,
      serviceName: "Legacy",
    }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.totalRevenue, 100);
  assert.equal(summary.completedBookingsCount, 3);
  assert.deepEqual(
    summary.revenueByDay.map((item) => item.revenue),
    [70, 0, 30]
  );
});

test("client requester is forbidden", async () => {
  await assertRevenueError(
    getBarberRevenueSummary({ barberId, requester: clientRequester, from, to }),
    403,
    "Only barbers can access revenue data"
  );
});

test("different barber requester is forbidden", async () => {
  await assertRevenueError(
    getBarberRevenueSummary({ barberId, requester: otherBarberRequester, from, to }),
    403,
    "You can access only your own revenue"
  );
});

// ── Status filtering ──

test("only completed bookings count toward totalRevenue/completedBookingsCount", async () => {
  Booking.find = mockFind([
    createBooking({ status: "completed", price: 100 }),
    createBooking({ status: "completed", price: 50 }),
    createBooking({ status: "pending", price: 999 }),
    createBooking({ status: "accepted", price: 888 }),
    createBooking({ status: "cancelled", price: 777 }),
    createBooking({ status: "rejected", price: 666 }),
    createBooking({ status: "no_show", price: 555 }),
    createBooking({ status: "late_cancelled", price: 444 }),
    createBooking({ status: "expired", price: 333 }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.totalRevenue, 150);
  assert.equal(summary.completedBookingsCount, 2);
  assert.equal(summary.averageBookingValue, 75);
});

test("statusBreakdown includes all statuses in range", async () => {
  Booking.find = mockFind([
    createBooking({ status: "completed" }),
    createBooking({ status: "pending" }),
    createBooking({ status: "cancelled" }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.statusBreakdown.completed, 1);
  assert.equal(summary.statusBreakdown.pending, 1);
  assert.equal(summary.statusBreakdown.cancelled, 1);
  assert.equal(summary.statusBreakdown.rejected, 0);
  assert.equal(summary.statusBreakdown.no_show, 0);
  assert.equal(summary.statusBreakdown.late_cancelled, 0);
  assert.equal(summary.statusBreakdown.expired, 0);
  assert.equal(summary.statusBreakdown.accepted, 0);
});

// ── Date range ──

test("date range from/to inclusive works", async () => {
  Booking.find = (query) => {
    // Verify the query uses correct $or date range conditions
    const bookingDateCondition = query.$or[0];
    assert.equal(bookingDateCondition.bookingDate.$gte, "2024-06-01");
    assert.equal(bookingDateCondition.bookingDate.$lte, "2024-06-30");
    // Return only in-range data (mock bypasses actual MongoDB filtering)
    return {
      lean: async () => [
        createBooking({ bookingDate: "2024-06-01", price: 10 }),
        createBooking({ bookingDate: "2024-06-30", price: 20 }),
      ],
    };
  };

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.totalRevenue, 30);
  assert.equal(summary.completedBookingsCount, 2);
});

// ── Top services ──

test("topServicesByRevenue sorted correctly", async () => {
  Booking.find = mockFind([
    createBooking({ serviceName: "Haircut", price: 100 }),
    createBooking({ serviceName: "Haircut", price: 100 }),
    createBooking({ serviceName: "Shave", price: 80 }),
    createBooking({ serviceName: "Color", price: 250 }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.topServicesByRevenue.length, 3);
  assert.equal(summary.topServicesByRevenue[0].serviceName, "Color");
  assert.equal(summary.topServicesByRevenue[0].revenue, 250);
  assert.equal(summary.topServicesByRevenue[0].count, 1);
  assert.equal(summary.topServicesByRevenue[1].serviceName, "Haircut");
  assert.equal(summary.topServicesByRevenue[1].revenue, 200);
  assert.equal(summary.topServicesByRevenue[1].count, 2);
  assert.equal(summary.topServicesByRevenue[2].serviceName, "Shave");
  assert.equal(summary.topServicesByRevenue[2].revenue, 80);
});

test("topServicesByCount sorted correctly", async () => {
  Booking.find = mockFind([
    createBooking({ serviceName: "Beard Trim", price: 50 }),
    createBooking({ serviceName: "Beard Trim", price: 50 }),
    createBooking({ serviceName: "Beard Trim", price: 50 }),
    createBooking({ serviceName: "Haircut", price: 100 }),
    createBooking({ serviceName: "Shave", price: 200 }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.topServicesByCount.length, 3);
  assert.equal(summary.topServicesByCount[0].serviceName, "Beard Trim");
  assert.equal(summary.topServicesByCount[0].count, 3);
  assert.equal(summary.topServicesByCount[1].serviceName, "Haircut");
  assert.equal(summary.topServicesByCount[1].count, 1);
  assert.equal(summary.topServicesByCount[2].serviceName, "Shave");
  assert.equal(summary.topServicesByCount[2].count, 1);
});

// ── Package booking ──

test("package booking counts by Booking.price snapshot", async () => {
  Booking.find = mockFind([
    createBooking({ serviceName: "Package Deal", price: 500 }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  assert.equal(summary.totalRevenue, 500);
  assert.equal(summary.completedBookingsCount, 1);
  assert.equal(summary.averageBookingValue, 500);
  assert.equal(summary.topServicesByRevenue[0].serviceName, "Package Deal");
  assert.equal(summary.topServicesByRevenue[0].revenue, 500);
});

// ── Empty range ──

test("empty range returns zeros and empty arrays", async () => {
  Booking.find = mockFind([]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from: "2024-01-01",
    to: "2024-01-31",
  });

  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.completedBookingsCount, 0);
  assert.equal(summary.averageBookingValue, 0);
  assert.deepEqual(summary.revenueByDay, []);
  assert.deepEqual(summary.topServicesByRevenue, []);
  assert.deepEqual(summary.topServicesByCount, []);
  assert.equal(summary.statusBreakdown.completed, 0);
});

// ── Private fields ──

test("private fields are not returned in revenue data", async () => {
  Booking.find = mockFind([
    createBooking({
      bookingDate: "2024-06-15",
      price: 100,
      clientName: "John Doe",
      clientPhone: "+37499123456",
      phone: "+37499123456",
      consultation: { hairType: "curly" },
      consent: { accepted: true },
      referenceImages: ["img1.jpg"],
      treatmentRecord: { colorFormula: "test" },
    }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from,
    to,
  });

  // Verify revenue calculations work
  assert.equal(summary.totalRevenue, 100);
  assert.equal(summary.completedBookingsCount, 1);

  // Verify the response shape does not include private fields
  const responseKeys = Object.keys(summary);
  assert.ok(responseKeys.includes("totalRevenue"));
  assert.ok(responseKeys.includes("completedBookingsCount"));
  assert.ok(responseKeys.includes("averageBookingValue"));
  assert.ok(responseKeys.includes("revenueByDay"));
  assert.ok(responseKeys.includes("topServicesByRevenue"));
  assert.ok(responseKeys.includes("topServicesByCount"));
  assert.ok(responseKeys.includes("statusBreakdown"));
  assert.ok(!responseKeys.includes("clientName"));
  assert.ok(!responseKeys.includes("clientPhone"));
  assert.ok(!responseKeys.includes("phone"));
  assert.ok(!responseKeys.includes("consultation"));
  assert.ok(!responseKeys.includes("consent"));
  assert.ok(!responseKeys.includes("referenceImages"));
  assert.ok(!responseKeys.includes("treatmentRecord"));
  assert.ok(!responseKeys.includes("clientId"));
});

// ── Default month when no range ──

test("defaults to current month when from/to not provided", async () => {
  Booking.find = mockFind([]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from: null,
    to: null,
  });

  assert.ok(summary.from);
  assert.ok(summary.to);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  assert.ok(summary.from.startsWith(`${year}-${month}`));
  assert.ok(summary.to.startsWith(`${year}-${month}`));
});

// ── Invalid date format ──

test("invalid date format throws 400", async () => {
  await assertRevenueError(
    getBarberRevenueSummary({
      barberId,
      requester: barberRequester,
      from: "invalid",
      to: "2024-06-30",
    }),
    400,
    "from/to must use YYYY-MM-DD format"
  );
});

test("from > to throws 400", async () => {
  await assertRevenueError(
    getBarberRevenueSummary({
      barberId,
      requester: barberRequester,
      from: "2024-06-30",
      to: "2024-06-01",
    }),
    400,
    "from must be before or equal to to"
  );
});

test("from equal to to does not throw", async () => {
  Booking.find = mockFind([
    createBooking({ bookingDate: "2024-06-15", price: 50, serviceName: "Beard Trim" }),
  ]);

  const summary = await getBarberRevenueSummary({
    barberId,
    requester: barberRequester,
    from: "2024-06-15",
    to: "2024-06-15",
  });

  assert.equal(summary.totalRevenue, 50);
  assert.equal(summary.completedBookingsCount, 1);
});

test("too-large date range throws 400", async () => {
  await assertRevenueError(
    getBarberRevenueSummary({
      barberId,
      requester: barberRequester,
      from: "2024-01-01",
      to: "2025-06-01",
    }),
    400,
    "Date range must not exceed 366 days"
  );
});
