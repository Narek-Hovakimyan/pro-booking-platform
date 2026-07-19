import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { approveEntry, cancelEntry, createEntry } from "./bookings/waitlistController.js";
import Booking from "../models/Booking.js";
import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import WaitlistEntry from "../models/WaitlistEntry.js";

const clientId = "64b000000000000000000001";
const barberId = "64b000000000000000000010";
const salonId = "64b000000000000000000020";
const serviceId = "64b000000000000000000030";
const futureDate = "2026-08-15";

const originalMethods = {
  bookingCreate: Booking.create,
  salonFindById: Salon.findById,
  serviceFindOne: Service.findOne,
  userFindById: User.findById,
  waitlistCreate: WaitlistEntry.create,
  waitlistFindOne: WaitlistEntry.findOne,
};

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Salon.findById = originalMethods.salonFindById;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
  WaitlistEntry.create = originalMethods.waitlistCreate;
  WaitlistEntry.findOne = originalMethods.waitlistFindOne;
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

const mockValidRelationships = () => {
  Service.findOne = async () => ({ _id: serviceId, barberId });
  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      id: barberId,
      role: "barber",
      salons: [{ salon: salonId, status: "approved" }],
    }),
  });
  Salon.findById = () => ({
    select: async () => ({ _id: salonId, ownerId: "64b000000000000000000099", admins: [] }),
  });
};

test("concurrent duplicate waitlist POST creates one active entry", async () => {
  const createdEntries = [];

  mockValidRelationships();
  WaitlistEntry.findOne = async (query) =>
    createdEntries.find(
      (entry) =>
        String(entry.clientId) === String(query.clientId) &&
        String(entry.barberId) === String(query.barberId) &&
        String(entry.salonId || "") === String(query.salonId || "") &&
        String(entry.serviceId) === String(query.serviceId) &&
        entry.date === query.date &&
        entry.preferredStartTime === query.preferredStartTime &&
        entry.preferredEndTime === query.preferredEndTime &&
        query.status?.$in?.includes(entry.status)
    ) || null;
  WaitlistEntry.create = async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const entry = { _id: `entry-${createdEntries.length + 1}`, ...payload };
    createdEntries.push(entry);
    return entry;
  };

  const body = {
    barberId,
    salonId,
    serviceId,
    date: futureDate,
    preferredStartTime: "10:00",
    preferredEndTime: "12:00",
  };
  const firstResponse = createResponse();
  const secondResponse = createResponse();

  await Promise.all([
    createEntry(
      { user: { _id: clientId, role: "client" }, body },
      firstResponse
    ),
    createEntry(
      { user: { _id: clientId, role: "client" }, body },
      secondResponse
    ),
  ]);

  assert.deepEqual(
    [firstResponse.statusCode, secondResponse.statusCode].sort(),
    [201, 409]
  );
  assert.equal(createdEntries.length, 1);
});

test("waitlist POST rejects invalid date without 500", async () => {
  let created = false;
  WaitlistEntry.create = async () => {
    created = true;
    return null;
  };

  const response = createResponse();

  await createEntry(
    {
      user: { _id: clientId, role: "client" },
      body: {
        barberId,
        serviceId,
        date: "2099-02-30",
      },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /date must be a valid YYYY-MM-DD calendar date/);
  assert.equal(created, false);
});

test("waitlist POST unexpected DB error returns 500 generic without leaking raw message", async () => {
  const response = createResponse();

  mockValidRelationships();
  WaitlistEntry.findOne = async () => null;
  WaitlistEntry.create = async () => {
    throw new Error("raw waitlist database failure");
  };

  await withSilencedConsoleError(async () => {
    await createEntry(
      {
        user: { _id: clientId, role: "client" },
        body: {
          barberId,
          salonId,
          serviceId,
          date: futureDate,
        },
      },
      response
    );
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.message, "Could not create waitlist entry");
});

test("waitlist cancel preserves known not-found service status", async () => {
  const response = createResponse();

  WaitlistEntry.findOne = async () => null;

  await cancelEntry(
    {
      user: { _id: clientId, role: "client" },
      params: { id: "waitlist-entry-1" },
    },
    response
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.message, "Waitlist entry not found or already cancelled");
});

test("legacy approve endpoint requires offer flow and creates no booking", async () => {
  let bookingCreated = false;
  Booking.create = async () => {
    bookingCreated = true;
    return null;
  };

  const response = createResponse();

  await approveEntry(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: "waitlist-entry-1" },
      body: { time: "10:00" },
    },
    response
  );

  assert.equal(response.statusCode, 410);
  assert.deepEqual(response.body, {
    message: "Use offer flow; client confirmation is required",
  });
  assert.equal(bookingCreated, false);
});
