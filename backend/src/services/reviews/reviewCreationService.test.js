import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Review from "../../models/Review.js";
import Salon from "../../models/Salon.js";
import SalonReview from "../../models/SalonReview.js";
import {
  __reviewCreationServiceTestHooks,
  createBarberReview,
  createSalonReview,
} from "./reviewCreationService.js";

const ids = {
  barber: "64b000000000000000000001",
  booking: "64b000000000000000000002",
  client: "64b000000000000000000003",
  salon: "64b000000000000000000004",
};

const original = {
  bookingFindById: Booking.findById,
  notificationCreate: Notification.create,
  reviewCreate: Review.create,
  reviewFindOne: Review.findOne,
  salonFindById: Salon.findById,
  salonReviewCreate: SalonReview.create,
  salonReviewFindOne: SalonReview.findOne,
};

const session = {
  async withTransaction(task) {
    return task();
  },
  async endSession() {},
};

const installSession = () =>
  __reviewCreationServiceTestHooks.setStartSession(async () => session);

const completedBooking = (overrides = {}) => ({
  _id: ids.booking,
  barberId: ids.barber,
  clientId: ids.client,
  salonId: ids.salon,
  status: "completed",
  reviewed: false,
  async save(options) {
    assert.deepEqual(options, { session });
    this.reviewed = true;
    return this;
  },
  ...overrides,
});

afterEach(() => {
  Booking.findById = original.bookingFindById;
  Notification.create = original.notificationCreate;
  Review.create = original.reviewCreate;
  Review.findOne = original.reviewFindOne;
  Salon.findById = original.salonFindById;
  SalonReview.create = original.salonReviewCreate;
  SalonReview.findOne = original.salonReviewFindOne;
  installSession();
});

installSession();

test("barber review writes review and booking flag with one session", async () => {
  const booking = completedBooking();
  const review = { _id: "review-1", bookingId: ids.booking };
  Booking.findById = async (_id, _projection, options) => {
    assert.equal(_id, ids.booking);
    assert.deepEqual(options, { session });
    return booking;
  };
  Review.findOne = async (_filter, _projection, options) => {
    assert.deepEqual(options, { session });
    return null;
  };
  Review.create = async ([payload], options) => {
    assert.deepEqual(options, { session });
    assert.equal(payload.clientId, ids.client);
    return [review];
  };

  assert.equal(
    await createBarberReview({
      barberId: ids.barber,
      bookingId: ids.booking,
      clientId: ids.client,
      comment: "Great",
      rating: 5,
    }),
    review
  );
  assert.equal(booking.reviewed, true);
});

test("barber review propagates booking flag failure for transaction rollback", async () => {
  const booking = completedBooking({
    async save(options) {
      assert.deepEqual(options, { session });
      throw new Error("booking flag failed");
    },
  });
  Booking.findById = async () => booking;
  Review.findOne = async () => null;
  Review.create = async (_payload, options) => {
    assert.deepEqual(options, { session });
    return [{ _id: "review-rollback" }];
  };

  await assert.rejects(
    createBarberReview({
      barberId: ids.barber,
      bookingId: ids.booking,
      clientId: ids.client,
      comment: "Great",
      rating: 5,
    }),
    /booking flag failed/
  );
});

test("duplicate barber review is rejected before a second write", async () => {
  Booking.findById = async () => completedBooking();
  Review.findOne = async () => ({ _id: "existing" });
  Review.create = async () => assert.fail("duplicate review must not be created");

  await assert.rejects(
    createBarberReview({
      barberId: ids.barber,
      bookingId: ids.booking,
      clientId: ids.client,
      comment: "Great",
      rating: 5,
    }),
    { message: "This booking has already been reviewed", statusCode: 400 }
  );
});

test("salon review persists required notification with the same session", async () => {
  const booking = completedBooking();
  Booking.findById = async (_id, _projection, options) => {
    assert.deepEqual(options, { session });
    return booking;
  };
  Salon.findById = async (_id, _projection, options) => {
    assert.deepEqual(options, { session });
    return { _id: ids.salon, ownerId: ids.barber, name: "Salon" };
  };
  SalonReview.findOne = async () => null;
  SalonReview.create = async (_payload, options) => {
    assert.deepEqual(options, { session });
    return [{ _id: "salon-review-1" }];
  };
  Notification.create = async (_payload, options) => {
    assert.deepEqual(options, { session });
    return { _id: "notification-1" };
  };

  const review = await createSalonReview({
    bookingId: ids.booking,
    clientId: ids.client,
    clientName: "Client",
    comment: "Great",
    rating: 5,
    salonId: ids.salon,
  });
  assert.equal(review._id, "salon-review-1");
});

test("salon notification failure propagates for transaction rollback", async () => {
  Booking.findById = async () => completedBooking();
  Salon.findById = async () => ({
    _id: ids.salon,
    ownerId: ids.barber,
    name: "Salon",
  });
  SalonReview.findOne = async () => null;
  SalonReview.create = async () => [{ _id: "salon-review-rollback" }];
  Notification.create = async () => {
    throw new Error("notification failed");
  };

  await assert.rejects(
    createSalonReview({
      bookingId: ids.booking,
      clientId: ids.client,
      clientName: "Client",
      comment: "Great",
      rating: 5,
      salonId: ids.salon,
    }),
    /notification failed/
  );
});
