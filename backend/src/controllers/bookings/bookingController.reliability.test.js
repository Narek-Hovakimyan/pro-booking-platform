import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getClientReliability } from "./bookingAnalyticsController.js";
import Booking from "../../models/Booking.js";

import {
  barber,
  barberId,
  bookingDate,
  client,
  clientId,
  createMutableBooking,
  createResponse,
  originalMethods,
  otherClient,
} from "./bookingController.testUtils.js";

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.aggregate = originalMethods.bookingAggregate;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
});

// --- Client reliability tests ---

test("client can fetch own reliability summary", async () => {
  const res = createResponse();

  Booking.aggregate = async (pipeline) => {
    assert.equal(String(pipeline[0].$match.clientId), clientId);
    return [{
      totalBookings: 2,
      completedCount: 1,
      cancelledCount: 0,
      noShowCount: 1,
      lateCancelledCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
      acceptedCount: 0,
      expiredCount: 0,
    }];
  };

  await getClientReliability(
    {
      user: client,
      params: { clientId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.clientId, clientId);
  assert.equal(res.body.totalBookings, 2);
  assert.equal(res.body.completedCount, 1);
  assert.equal(res.body.noShowCount, 1);
  assert.equal(res.body.reliabilityScore, 80);
  assert.equal(res.body.clientName, undefined);
  assert.equal(res.body.clientPhone, undefined);
});

test("client cannot fetch another client's reliability summary", async () => {
  const res = createResponse();

  await getClientReliability(
    {
      user: otherClient,
      params: { clientId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("barber can fetch reliability summary for client with booking relationship", async () => {
  const res = createResponse();

  Booking.countDocuments = async (query) => {
    assert.equal(String(query.barberId), barberId);
    assert.equal(String(query.clientId), clientId);
    return 1;
  };
  Booking.aggregate = async (pipeline) => {
    assert.equal(String(pipeline[0].$match.clientId), clientId);
    return [{
      totalBookings: 2,
      completedCount: 0,
      cancelledCount: 0,
      noShowCount: 0,
      lateCancelledCount: 1,
      rejectedCount: 0,
      pendingCount: 0,
      acceptedCount: 1,
      expiredCount: 0,
    }];
  };

  await getClientReliability(
    {
      user: barber,
      params: { clientId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.acceptedCount, 1);
  assert.equal(res.body.lateCancelledCount, 1);
  assert.equal(res.body.reliabilityScore, 90);
});

test("unrelated barber cannot fetch client reliability summary", async () => {
  const res = createResponse();

  Booking.countDocuments = async (query) => {
    assert.equal(String(query.clientId), clientId);
    return 0;
  };

  await getClientReliability(
    {
      user: barber,
      params: { clientId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("non-client and non-barber role cannot fetch client reliability summary", async () => {
  const res = createResponse();

  await getClientReliability(
    {
      user: { _id: "64b000000000000000000020", role: "admin" },
      params: { clientId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("invalid clientId is rejected for reliability summary", async () => {
  const res = createResponse();

  await getClientReliability(
    {
      user: barber,
      params: { clientId: "not-a-client-id" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});
