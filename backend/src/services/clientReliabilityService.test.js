import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../models/Booking.js";
import {
  barberHasBookingWithClient,
  getAccessibleClientReliabilitySummary,
  getClientReliabilitySummary,
} from "./clientReliabilityService.js";

const clientId = "64b000000000000000000001";
const barberA = "64b000000000000000000010";
const barberB = "64b000000000000000000011";
const adminId = "64b000000000000000000020";

const mockBooking = (overrides = {}) => ({
  clientId,
  barberId: barberA,
  status: "pending",
  ...overrides,
});

const originalBookingFind = Booking.find;
const originalBookingCountDocuments = Booking.countDocuments;

afterEach(() => {
  Booking.find = originalBookingFind;
  Booking.countDocuments = originalBookingCountDocuments;
});

// --- getClientReliabilitySummary tests ---

test("summary includes all booking status counts correctly", async () => {
  Booking.find = async (query) => {
    assert.equal(String(query.clientId), clientId);
    return [
      mockBooking({ status: "completed" }),
      mockBooking({ status: "completed" }),
      mockBooking({ status: "completed" }),
      mockBooking({ status: "cancelled" }),
      mockBooking({ status: "cancelled" }),
      mockBooking({ status: "no_show" }),
      mockBooking({ status: "late_cancelled" }),
      mockBooking({ status: "late_cancelled" }),
      mockBooking({ status: "rejected" }),
      mockBooking({ status: "pending" }),
      mockBooking({ status: "accepted" }),
      mockBooking({ status: "expired" }),
    ];
  };

  const summary = await getClientReliabilitySummary(clientId);

  assert.equal(summary.clientId, clientId);
  assert.equal(summary.totalBookings, 12);
  assert.equal(summary.completedCount, 3);
  assert.equal(summary.cancelledCount, 2);
  assert.equal(summary.noShowCount, 1);
  assert.equal(summary.lateCancelledCount, 2);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.expiredCount, 1);
});

test("reliability score is 100 with no negative events", async () => {
  Booking.find = async () => [
    mockBooking({ status: "completed" }),
    mockBooking({ status: "completed" }),
    mockBooking({ status: "accepted" }),
    mockBooking({ status: "pending" }),
    mockBooking({ status: "rejected" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.reliabilityScore, 100);
});

test("reliability score deducts for no_show (-20 each)", async () => {
  Booking.find = async () => [
    mockBooking({ status: "no_show" }),
    mockBooking({ status: "no_show" }),
    mockBooking({ status: "completed" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.reliabilityScore, 60); // 100 - 40
});

test("reliability score deducts for late_cancelled (-10 each)", async () => {
  Booking.find = async () => [
    mockBooking({ status: "late_cancelled" }),
    mockBooking({ status: "late_cancelled" }),
    mockBooking({ status: "late_cancelled" }),
    mockBooking({ status: "completed" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.reliabilityScore, 70); // 100 - 30
});

test("reliability score deducts for cancelled (-5 each)", async () => {
  Booking.find = async () => [
    mockBooking({ status: "cancelled" }),
    mockBooking({ status: "cancelled" }),
    mockBooking({ status: "cancelled" }),
    mockBooking({ status: "cancelled" }),
    mockBooking({ status: "completed" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.reliabilityScore, 80); // 100 - 20
});

test("reliability score combines all deductions", async () => {
  Booking.find = async () => [
    mockBooking({ status: "no_show" }),           // -20
    mockBooking({ status: "late_cancelled" }),     // -10
    mockBooking({ status: "cancelled" }),           // -5
    mockBooking({ status: "cancelled" }),           // -5
    mockBooking({ status: "completed" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.reliabilityScore, 60); // 100 - 20 - 10 - 5 - 5
});

test("reliability score does not go below 0", async () => {
  Booking.find = async () => [
    mockBooking({ status: "no_show" }),
    mockBooking({ status: "no_show" }),
    mockBooking({ status: "no_show" }),
    mockBooking({ status: "no_show" }),
    mockBooking({ status: "no_show" }),
    mockBooking({ status: "no_show" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.reliabilityScore, 0); // would be -20, clamped to 0
});

test("reliability score does not go above 100", async () => {
  Booking.find = async () => [];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.reliabilityScore, 100);
});

test("no personal data exposed in summary", async () => {
  Booking.find = async () => [
    mockBooking({ status: "completed", clientName: "John Doe", clientPhone: "555-0100" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);

  // Should NOT include clientName or clientPhone
  assert.equal(summary.clientName, undefined);
  assert.equal(summary.clientPhone, undefined);

  // Should include only the clientId and counts/score
  assert.ok(summary.clientId);
  assert.ok(Number.isFinite(summary.totalBookings));
  assert.ok(Number.isFinite(summary.reliabilityScore));
});

// --- barberHasBookingWithClient tests ---

test("barber with booking relationship can access client summary", async () => {
  Booking.countDocuments = async (query) => {
    assert.equal(String(query.barberId), barberA);
    assert.equal(String(query.clientId), clientId);
    return 1;
  };

  const hasRelationship = await barberHasBookingWithClient(barberA, clientId);
  assert.equal(hasRelationship, true);
});

test("unrelated barber cannot access client summary", async () => {
  Booking.countDocuments = async (query) => {
    assert.equal(String(query.barberId), barberB);
    assert.equal(String(query.clientId), clientId);
    return 0;
  };

  const hasRelationship = await barberHasBookingWithClient(barberB, clientId);
  assert.equal(hasRelationship, false);
});

test("barber with multiple bookings still has relationship", async () => {
  Booking.countDocuments = async () => 5;

  const hasRelationship = await barberHasBookingWithClient(barberA, clientId);
  assert.equal(hasRelationship, true);
});

test("booking count for unrelated barber-client pair is zero", async () => {
  Booking.countDocuments = async () => 0;

  const hasRelationship = await barberHasBookingWithClient(barberB, clientId);
  assert.equal(hasRelationship, false);
});

// --- getAccessibleClientReliabilitySummary tests ---

const assertAccessError = async (promise, statusCode, message) => {
  await assert.rejects(
    promise,
    (error) => {
      assert.equal(error.statusCode, statusCode);
      assert.equal(error.message, message);
      return true;
    }
  );
};

test("accessible summary rejects invalid clientId with structured 400", async () => {
  await assertAccessError(
    getAccessibleClientReliabilitySummary({
      clientId: "not-a-client-id",
      requester: { _id: barberA, role: "barber" },
    }),
    400,
    "Invalid clientId"
  );
});

test("client can access own reliability summary", async () => {
  Booking.find = async (query) => {
    assert.equal(String(query.clientId), clientId);
    return [
      mockBooking({ status: "completed" }),
      mockBooking({ status: "no_show" }),
    ];
  };

  const summary = await getAccessibleClientReliabilitySummary({
    clientId,
    requester: { _id: clientId, role: "client" },
  });

  assert.equal(summary.clientId, clientId);
  assert.equal(summary.totalBookings, 2);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.noShowCount, 1);
  assert.equal(summary.reliabilityScore, 80);
});

test("barber with booking relationship can access reliability summary", async () => {
  Booking.countDocuments = async (query) => {
    assert.equal(String(query.barberId), barberA);
    assert.equal(String(query.clientId), clientId);
    return 1;
  };
  Booking.find = async (query) => {
    assert.equal(String(query.clientId), clientId);
    return [
      mockBooking({ status: "accepted" }),
      mockBooking({ status: "late_cancelled" }),
    ];
  };

  const summary = await getAccessibleClientReliabilitySummary({
    clientId,
    requester: { _id: barberA, role: "barber" },
  });

  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.lateCancelledCount, 1);
  assert.equal(summary.reliabilityScore, 90);
});

test("unrelated barber gets structured 403 for reliability summary", async () => {
  Booking.countDocuments = async (query) => {
    assert.equal(String(query.barberId), barberB);
    assert.equal(String(query.clientId), clientId);
    return 0;
  };

  await assertAccessError(
    getAccessibleClientReliabilitySummary({
      clientId,
      requester: { _id: barberB, role: "barber" },
    }),
    403,
    "You do not have access to this client's reliability summary"
  );
});

test("non-client and non-barber gets structured 403 for reliability summary", async () => {
  await assertAccessError(
    getAccessibleClientReliabilitySummary({
      clientId,
      requester: { _id: adminId, role: "admin" },
    }),
    403,
    "You do not have access to this client's reliability summary"
  );
});

test("accessible summary does not expose personal data", async () => {
  Booking.find = async () => [
    mockBooking({
      status: "completed",
      clientName: "John Doe",
      clientPhone: "555-0100",
    }),
  ];

  const summary = await getAccessibleClientReliabilitySummary({
    clientId,
    requester: { _id: clientId, role: "client" },
  });

  assert.equal(summary.clientName, undefined);
  assert.equal(summary.clientPhone, undefined);
  assert.ok(summary.clientId);
  assert.ok(Number.isFinite(summary.totalBookings));
  assert.ok(Number.isFinite(summary.reliabilityScore));
});

test("client can see own summary", async () => {
  // This test validates the access rule: client sees own summary
  // The service itself doesn't enforce access control; the controller does.
  // But the service should correctly compute the summary for any valid clientId.
  Booking.find = async () => [
    mockBooking({ status: "completed" }),
    mockBooking({ status: "accepted" }),
  ];

  const summary = await getClientReliabilitySummary(clientId);
  assert.equal(summary.totalBookings, 2);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.reliabilityScore, 100);
});

test("empty booking history returns zero counts and score 100", async () => {
  Booking.find = async () => [];

  const summary = await getClientReliabilitySummary(clientId);

  assert.equal(summary.totalBookings, 0);
  assert.equal(summary.completedCount, 0);
  assert.equal(summary.cancelledCount, 0);
  assert.equal(summary.noShowCount, 0);
  assert.equal(summary.lateCancelledCount, 0);
  assert.equal(summary.rejectedCount, 0);
  assert.equal(summary.pendingCount, 0);
  assert.equal(summary.acceptedCount, 0);
  assert.equal(summary.expiredCount, 0);
  assert.equal(summary.reliabilityScore, 100);
});
