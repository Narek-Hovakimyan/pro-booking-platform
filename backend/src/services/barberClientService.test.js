import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../models/Booking.js";
import User from "../models/User.js";
import { getBarberClients } from "./barberClientService.js";

const originalMethods = {
  bookingFind: Booking.find,
  userFind: User.find,
};

const barberId = "64b000000000000000000001";
const otherBarberId = "64b000000000000000000002";
const clientAId = "64b000000000000000000003";
const clientBId = "64b000000000000000000004";
const manualClientId = null;

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
  User.find = originalMethods.userFind;
});

const createLeanQuery = (items, onSelect = () => {}) => ({
  select(fields) {
    onSelect(fields);
    return this;
  },
  async lean() {
    return items;
  },
});

const makeBooking = (overrides = {}) => ({
  _id: overrides._id || "booking-id",
  barberId,
  clientId: clientAId,
  clientName: "Snapshot Client",
  clientPhone: "",
  phone: "",
  serviceName: "Haircut",
  price: 100,
  finalPrice: 9999,
  bookingDate: "2026-06-01",
  dayKey: "2026-06-01",
  time: "10:00",
  status: "completed",
  consultation: { notes: "private" },
  consent: { accepted: true },
  treatmentRecord: { formula: "private" },
  referenceImages: ["/uploads/private.jpg"],
  ...overrides,
});

test("getBarberClients rejects unauthenticated requests", async () => {
  await assert.rejects(
    () => getBarberClients(),
    (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(error.message, "Not authenticated");
      return true;
    }
  );
});

test("getBarberClients rejects non-barber users", async () => {
  await assert.rejects(
    () =>
      getBarberClients({
        requester: { _id: clientAId, role: "client" },
      }),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, "Only barbers can access clients");
      return true;
    }
  );
});

test("getBarberClients returns only current barber client summaries", async () => {
  const bookingQueryCalls = [];
  const userQueryCalls = [];

  Booking.find = (query) => {
    bookingQueryCalls.push(query);
    return createLeanQuery([
      makeBooking({
        _id: "a-old",
        clientId: clientAId,
        clientName: "Old Snapshot",
        clientPhone: "111",
        serviceName: "Cut",
        price: 5000,
        bookingDate: "2026-05-20",
        dayKey: "2026-05-20",
        time: "09:00",
        status: "completed",
      }),
      makeBooking({
        _id: "a-last",
        clientId: clientAId,
        clientName: "Latest Snapshot",
        clientPhone: "",
        phone: "222",
        serviceName: "Color",
        price: 7000,
        finalPrice: 1,
        bookingDate: "2026-06-03",
        dayKey: "2026-06-03",
        time: "11:00",
        status: "completed",
      }),
      makeBooking({
        _id: "a-next",
        clientId: clientAId,
        serviceName: "Color",
        price: 3000,
        bookingDate: "2026-06-06",
        dayKey: "2026-06-06",
        time: "13:00",
        status: "accepted",
      }),
      makeBooking({
        _id: "b-last",
        clientId: clientBId,
        clientName: "Client B Snapshot",
        clientPhone: "333",
        serviceName: "Shave",
        price: 4000,
        bookingDate: "2026-05-18",
        dayKey: "2026-05-18",
        time: "15:00",
        status: "completed",
      }),
      makeBooking({
        _id: "manual-booking",
        clientId: manualClientId,
        clientName: "Walk In",
        clientPhone: "444",
      }),
      makeBooking({
        _id: "other-barber-booking",
        barberId: otherBarberId,
        clientId: "64b000000000000000000006",
        clientName: "Other Barber Client",
      }),
    ]);
  };

  User.find = (query) => {
    userQueryCalls.push(query);
    return createLeanQuery([
      {
        _id: clientAId,
        name: "User Client A",
        avatarUrl: "/uploads/avatar-a.jpg",
        phone: "999-user-phone",
        email: "client-a@example.com",
      },
      {
        _id: clientBId,
        name: "",
        avatarUrl: "/uploads/avatar-b.jpg",
        phone: "888-user-phone",
        email: "client-b@example.com",
      },
    ]);
  };

  const result = await getBarberClients({
    requester: { _id: barberId, role: "barber" },
    now: new Date("2026-06-04T08:00:00.000Z"),
  });

  assert.deepEqual(bookingQueryCalls, [
    { barberId, clientId: { $ne: null } },
  ]);
  assert.deepEqual(userQueryCalls, [
    { _id: { $in: [clientAId, clientBId] } },
  ]);
  assert.equal(result.length, 2);

  const clientA = result.find((client) => client.clientId === clientAId);
  const clientB = result.find((client) => client.clientId === clientBId);

  assert.deepEqual(clientA, {
    clientId: clientAId,
    clientName: "User Client A",
    phone: "222",
    lastBooking: {
      bookingId: "a-last",
      date: "2026-06-03",
      time: "11:00",
      status: "completed",
      serviceName: "Color",
    },
    nextBooking: {
      bookingId: "a-next",
      date: "2026-06-06",
      time: "13:00",
      status: "accepted",
      serviceName: "Color",
    },
    completedBookingsCount: 2,
    totalSpent: 12000,
    mostBookedService: {
      serviceName: "Color",
      count: 1,
    },
    bookingCount: 3,
    messagePath: `/messages/${clientAId}`,
  });

  assert.deepEqual(clientB, {
    clientId: clientBId,
    clientName: "Client B Snapshot",
    phone: "333",
    lastBooking: {
      bookingId: "b-last",
      date: "2026-05-18",
      time: "15:00",
      status: "completed",
      serviceName: "Shave",
    },
    nextBooking: null,
    completedBookingsCount: 1,
    totalSpent: 4000,
    mostBookedService: {
      serviceName: "Shave",
      count: 1,
    },
    bookingCount: 1,
    messagePath: `/messages/${clientBId}`,
  });

  assert.equal(JSON.stringify(result).includes("999-user-phone"), false);
  assert.equal(JSON.stringify(result).includes("client-a@example.com"), false);
  assert.equal(JSON.stringify(result).includes("consultation"), false);
  assert.equal(JSON.stringify(result).includes("consent"), false);
  assert.equal(JSON.stringify(result).includes("treatmentRecord"), false);
  assert.equal(JSON.stringify(result).includes("referenceImages"), false);
  assert.equal(JSON.stringify(result).includes("Walk In"), false);
  assert.equal(JSON.stringify(result).includes("Other Barber Client"), false);
});

test("getBarberClients uses non-rejected service fallback when client has no completed bookings", async () => {
  Booking.find = () =>
    createLeanQuery([
      makeBooking({
        _id: "pending-one",
        clientId: clientAId,
        serviceName: "Trim",
        status: "pending",
        bookingDate: "2026-06-06",
        dayKey: "2026-06-06",
        price: 5000,
      }),
      makeBooking({
        _id: "accepted-one",
        clientId: clientAId,
        serviceName: "Trim",
        status: "accepted",
        bookingDate: "2026-06-07",
        dayKey: "2026-06-07",
        price: 6000,
      }),
      makeBooking({
        _id: "rejected-one",
        clientId: clientAId,
        serviceName: "Color",
        status: "rejected",
        bookingDate: "2026-06-01",
        dayKey: "2026-06-01",
      }),
    ]);
  User.find = () => createLeanQuery([]);

  const result = await getBarberClients({
    requester: { _id: barberId, role: "barber" },
    now: new Date("2026-06-04T08:00:00.000Z"),
  });

  assert.equal(result[0].completedBookingsCount, 0);
  assert.equal(result[0].totalSpent, 0);
  assert.deepEqual(result[0].mostBookedService, {
    serviceName: "Trim",
    count: 2,
  });
});
