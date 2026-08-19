import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { updateBooking } from "./bookingController.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import User from "../../models/User.js";
import Voucher from "../../models/Voucher.js";
import { __bookingSideEffectsTestHooks } from "../../services/booking/bookingSideEffectsService.js";
import {
  barber,
  client,
  createMutableBooking,
  createResponse,
  originalMethods,
} from "./bookingController.testUtils.js";

const originalVoucherFindOneAndUpdate = Voucher.findOneAndUpdate;

afterEach(() => {
  Booking.findById = originalMethods.bookingFindById;
  Notification.create = originalMethods.notificationCreate;
  User.findById = originalMethods.userFindById;
  Voucher.findOneAndUpdate = originalVoucherFindOneAndUpdate;
  __bookingSideEffectsTestHooks.resetGetIO();
});

const configureConcurrentStatusDependencies = (booking) => {
  const notifications = [];
  let bookingSocketEmits = 0;

  Booking.findById = async () => booking;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({ select: async () => ({ name: "Barber" }) });
  __bookingSideEffectsTestHooks.setGetIO(() => ({
    to: () => ({
      emit: (event) => {
        if (event === "bookingUpdated") bookingSocketEmits += 1;
      },
    }),
  }));

  return {
    notifications,
    getBookingSocketEmits: () => bookingSocketEmits,
  };
};

test("concurrent cancel and reject claim one terminal state and restore a voucher once", async () => {
  const booking = createMutableBooking({
    status: "pending",
    voucherId: "voucher-1",
    voucherDiscount: 10,
  });
  const { notifications, getBookingSocketEmits } =
    configureConcurrentStatusDependencies(booking);
  let voucherRestoreCalls = 0;
  let voucherCurrentUses = 1;
  Voucher.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter._id, "voucher-1");
    assert.equal(filter.redemptionBookingIds, booking._id);
    assert.deepEqual(filter.currentUses, { $gt: 0 });
    voucherRestoreCalls += 1;
    voucherCurrentUses += update.$inc.currentUses;
    return { currentUses: voucherCurrentUses };
  };

  const cancelResponse = createResponse();
  const rejectResponse = createResponse();
  await Promise.all([
    updateBooking(
      {
        user: client,
        params: { id: booking._id },
        body: { status: "cancelled", cancelReason: "Plans changed" },
      },
      cancelResponse
    ),
    updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: "rejected", rejectionReason: "Unavailable" },
      },
      rejectResponse
    ),
  ]);

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(rejectResponse.statusCode, 400);
  assert.equal(
    rejectResponse.body.message,
    "Only pending or accepted bookings can be rejected"
  );
  assert.equal(booking.status, "cancelled");
  assert.equal(voucherRestoreCalls, 1);
  assert.equal(voucherCurrentUses, 0);
  assert.deepEqual(notifications.map(({ type }) => type), ["booking_cancelled"]);
  assert.equal(getBookingSocketEmits(), 2);
});

test("concurrent cancel and complete leave the losing complete request side-effect free", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const { notifications, getBookingSocketEmits } =
    configureConcurrentStatusDependencies(booking);
  const cancelResponse = createResponse();
  const completeResponse = createResponse();

  await Promise.all([
    updateBooking(
      {
        user: client,
        params: { id: booking._id },
        body: { status: "cancelled", cancelReason: "Plans changed" },
      },
      cancelResponse
    ),
    updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: "completed" },
      },
      completeResponse
    ),
  ]);

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(completeResponse.statusCode, 400);
  assert.equal(
    completeResponse.body.message,
    "Only accepted bookings can be completed"
  );
  assert.equal(booking.status, "cancelled");
  assert.deepEqual(notifications.map(({ type }) => type), ["booking_cancelled"]);
  assert.equal(getBookingSocketEmits(), 2);
});

test("concurrent reject and complete preserve the winning rejection and its side effects", async () => {
  const booking = createMutableBooking({ status: "accepted" });
  const { notifications, getBookingSocketEmits } =
    configureConcurrentStatusDependencies(booking);
  const rejectResponse = createResponse();
  const completeResponse = createResponse();

  await Promise.all([
    updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: "rejected", rejectionReason: "Unavailable" },
      },
      rejectResponse
    ),
    updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: "completed" },
      },
      completeResponse
    ),
  ]);

  assert.equal(rejectResponse.statusCode, 200);
  assert.equal(completeResponse.statusCode, 400);
  assert.equal(booking.status, "rejected");
  assert.deepEqual(notifications.map(({ type }) => type), ["booking_rejected"]);
  assert.equal(getBookingSocketEmits(), 2);
});

test("an unauthorized stale terminal request remains forbidden without side effects", async () => {
  const booking = createMutableBooking({ status: "pending" });
  const { notifications, getBookingSocketEmits } =
    configureConcurrentStatusDependencies(booking);
  const response = createResponse();

  await updateBooking(
    {
      user: { _id: "64b000000000000000000099", role: "client" },
      params: { id: booking._id },
      body: { status: "cancelled", cancelReason: "Not mine" },
    },
    response
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.message, "Only client can cancel booking");
  assert.equal(booking.status, "pending");
  assert.equal(notifications.length, 0);
  assert.equal(getBookingSocketEmits(), 0);
});
