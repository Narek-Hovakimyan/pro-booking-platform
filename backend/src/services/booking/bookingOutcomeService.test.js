import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import {
  markBookingLateCancel,
  markBookingNoShow,
} from "./bookingOutcomeService.js";

const originalMethods = {
  bookingFindById: Booking.findById,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
};

const barberId = "64b000000000000000000001";
const clientId = "64b000000000000000000003";
const otherBarberId = "64b000000000000000000099";
const pastBookingDate = "2020-01-15";
const futureBookingDate = "2099-06-01";

const barber = {
  _id: barberId,
  id: barberId,
  role: "barber",
};

const client = {
  _id: clientId,
  id: clientId,
  role: "client",
};

const otherBarber = {
  _id: otherBarberId,
  id: otherBarberId,
  role: "barber",
};

const createBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId,
  clientId,
  serviceId: "64b000000000000000000002",
  salonId: "64b000000000000000000004",
  bookingDate: pastBookingDate,
  dayKey: "wed",
  time: "10:00",
  duration: 60,
  price: 100,
  status: "accepted",
  noShowMarkedAt: null,
  noShowMarkedBy: null,
  lateCancelledAt: null,
  lateCancelledBy: null,
  ...overrides,
});

const outcomeActions = [
  {
    name: "no-show",
    run: markBookingNoShow,
    status: "no_show",
    markedAtField: "noShowMarkedAt",
    markedByField: "noShowMarkedBy",
    assignedBarberMessage: "Only the assigned barber can mark no-show",
    acceptedStatusMessage: "Only accepted bookings can be marked as no-show",
    duplicateMessage: "Booking already marked as no-show",
    futureMessage: "Cannot mark no-show for a future booking",
  },
  {
    name: "late-cancel",
    run: markBookingLateCancel,
    status: "late_cancelled",
    markedAtField: "lateCancelledAt",
    markedByField: "lateCancelledBy",
    assignedBarberMessage: "Only the assigned barber can mark late cancellation",
    acceptedStatusMessage: "Only accepted bookings can be marked as late cancellation",
    duplicateMessage: "Booking already marked as late cancellation",
    futureMessage: "Cannot mark late cancellation for a future booking",
  },
];

afterEach(() => {
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
});

const assertOutcomeError = async (promise, statusCode, message) => {
  await assert.rejects(
    promise,
    (error) => {
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.message, message);
      return true;
    }
  );
};

const mockStatusClaim = (booking) => {
  Booking.findOneAndUpdate = async (query, update) => {
    if (String(booking._id) !== String(query._id)) return null;
    if (String(booking.barberId) !== String(query.barberId)) return null;
    if (booking.status !== query.status) return null;

    Object.assign(booking, update.$set || {});
    return booking;
  };
};

for (const action of outcomeActions) {
  test(`client cannot mark ${action.name}`, async () => {
    const booking = createBooking();

    Booking.findById = async () => booking;

    await assertOutcomeError(
      action.run({ bookingId: booking._id, requester: client }),
      403,
      action.assignedBarberMessage
    );
  });

  test(`unrelated barber cannot mark ${action.name}`, async () => {
    const booking = createBooking();

    Booking.findById = async () => booking;

    await assertOutcomeError(
      action.run({ bookingId: booking._id, requester: otherBarber }),
      403,
      action.assignedBarberMessage
    );
  });

  for (const status of ["pending", "rejected", "cancelled", "completed", "expired"]) {
    test(`${status} booking cannot be marked ${action.name}`, async () => {
      const booking = createBooking({ status });

      Booking.findById = async () => booking;

      await assertOutcomeError(
        action.run({ bookingId: booking._id, requester: barber }),
        400,
        action.acceptedStatusMessage
      );
    });
  }

  test(`future booking cannot be marked ${action.name}`, async () => {
    const booking = createBooking({ bookingDate: futureBookingDate });

    Booking.findById = async () => booking;

    await assertOutcomeError(
      action.run({ bookingId: booking._id, requester: barber }),
      400,
      action.futureMessage
    );
  });
}

test("duplicate no-show is blocked", async () => {
  const booking = createBooking({
    noShowMarkedAt: new Date("2020-01-15T12:00:00Z"),
    noShowMarkedBy: barberId,
  });

  Booking.findById = async () => booking;

  await assertOutcomeError(
    markBookingNoShow({ bookingId: booking._id, requester: barber }),
    400,
    "Booking already marked as no-show"
  );
});

test("duplicate late-cancel is blocked", async () => {
  const booking = createBooking({
    lateCancelledAt: new Date("2020-01-15T12:00:00Z"),
    lateCancelledBy: barberId,
  });

  Booking.findById = async () => booking;

  await assertOutcomeError(
    markBookingLateCancel({ bookingId: booking._id, requester: barber }),
    400,
    "Booking already marked as late cancellation"
  );
});

test("concurrent no-show marks only one claim succeeds", async () => {
  const storedBooking = createBooking();
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });

  Booking.findById = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return createBooking({ ...storedBooking, status: "accepted" });
  };
  mockStatusClaim(storedBooking);

  const results = await Promise.allSettled([
    markBookingNoShow({ bookingId: storedBooking._id, requester: barber }),
    markBookingNoShow({ bookingId: storedBooking._id, requester: barber }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(storedBooking.status, "no_show");
  assert.ok(storedBooking.noShowMarkedAt);
  assert.equal(String(storedBooking.noShowMarkedBy), barberId);
});

test("concurrent late-cancel marks only one claim succeeds", async () => {
  const storedBooking = createBooking();
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });

  Booking.findById = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return createBooking({ ...storedBooking, status: "accepted" });
  };
  mockStatusClaim(storedBooking);

  const results = await Promise.allSettled([
    markBookingLateCancel({ bookingId: storedBooking._id, requester: barber }),
    markBookingLateCancel({ bookingId: storedBooking._id, requester: barber }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(storedBooking.status, "late_cancelled");
  assert.ok(storedBooking.lateCancelledAt);
  assert.equal(String(storedBooking.lateCancelledBy), barberId);
});
