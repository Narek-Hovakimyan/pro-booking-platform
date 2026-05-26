import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../models/Booking.js";
import {
  getBarberBookingsForRequester,
  getClientBookingsForRequester,
} from "./bookingReadService.js";

const originalBookingFind = Booking.find;

const barberId = "64b000000000000000000001";
const otherBarberId = "64b000000000000000000002";
const clientId = "64b000000000000000000003";
const otherClientId = "64b000000000000000000004";

afterEach(() => {
  Booking.find = originalBookingFind;
});

const createBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId,
  clientId,
  salonId: "64b000000000000000000005",
  bookingDate: "2099-06-01",
  dayKey: "mon",
  time: "10:00",
  duration: 45,
  status: "accepted",
  clientName: "Client",
  clientPhone: "+374000000",
  phone: "+374000000",
  note: "Private note",
  ...overrides,
});

test("client can fetch own bookings with original shape and order", async () => {
  const firstBooking = createBooking({ _id: "booking-1", time: "10:00" });
  const secondBooking = createBooking({ _id: "booking-2", time: "11:00" });
  const storedBookings = [firstBooking, secondBooking];

  Booking.find = (query) => ({
    select: async () => {
      assert.deepEqual(query, { clientId });
      return storedBookings;
    },
  });

  const bookings = await getClientBookingsForRequester({
    clientId,
    requester: { _id: clientId, role: "client" },
  });

  assert.strictEqual(bookings, storedBookings);
  assert.deepEqual(bookings.map((booking) => booking._id), ["booking-1", "booking-2"]);
});

test("client cannot fetch another client's bookings", async () => {
  let findCalled = false;
  Booking.find = async () => {
    findCalled = true;
    return [];
  };

  await assert.rejects(
    getClientBookingsForRequester({
      clientId: otherClientId,
      requester: { _id: clientId, role: "client" },
    }),
    {
      statusCode: 403,
      message: "You can fetch only your own bookings",
    }
  );
  assert.equal(findCalled, false);
});

test("barber can fetch own full bookings with original shape and order", async () => {
  const firstBooking = createBooking({ _id: "booking-1", time: "10:00" });
  const secondBooking = createBooking({ _id: "booking-2", time: "11:00" });
  const storedBookings = [firstBooking, secondBooking];

  Booking.find = async (query) => {
    assert.deepEqual(query, { barberId });
    return storedBookings;
  };

  const bookings = await getBarberBookingsForRequester({
    barberId,
    requester: { _id: barberId, role: "barber" },
  });

  assert.strictEqual(bookings, storedBookings);
  assert.deepEqual(bookings.map((booking) => booking._id), ["booking-1", "booking-2"]);
});

test("barber cannot fetch another barber's full bookings", async () => {
  let findCalled = false;
  Booking.find = async () => {
    findCalled = true;
    return [];
  };

  await assert.rejects(
    getBarberBookingsForRequester({
      barberId: otherBarberId,
      requester: { _id: barberId, role: "barber" },
    }),
    {
      statusCode: 403,
      message: "You can fetch only your own bookings",
    }
  );
  assert.equal(findCalled, false);
});

test("public barber bookings use serialized availability shape", async () => {
  const ownClientBooking = createBooking({ _id: "booking-1", clientId });
  const otherClientBooking = createBooking({
    _id: "booking-2",
    clientId: otherClientId,
    time: "11:00",
  });

  Booking.find = async (query) => {
    assert.deepEqual(query, { barberId });
    return [ownClientBooking, otherClientBooking];
  };

  const bookings = await getBarberBookingsForRequester({
    barberId,
    requester: { _id: clientId, role: "client" },
  });

  assert.deepEqual(bookings, [
    {
      _id: "booking-1",
      id: "booking-1",
      barberId,
      clientId,
      salonId: "64b000000000000000000005",
      bookingDate: "2099-06-01",
      dayKey: "mon",
      time: "10:00",
      duration: 45,
      status: "accepted",
    },
    {
      _id: "booking-2",
      id: "booking-2",
      barberId,
      clientId: null,
      salonId: "64b000000000000000000005",
      bookingDate: "2099-06-01",
      dayKey: "mon",
      time: "11:00",
      duration: 45,
      status: "accepted",
    },
  ]);
});
