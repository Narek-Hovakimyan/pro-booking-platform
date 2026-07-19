import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createReview,
  addReplyToReview,
  deleteReplyFromReview,
} from "./reviews/reviewController.js";
import Booking from "../models/Booking.js";
import Review from "../models/Review.js";

const originalMethods = {
  bookingFindById: Booking.findById,
  reviewCreate: Review.create,
  reviewFindOne: Review.findOne,
  reviewFindById: Review.findById,
  reviewFind: Review.find,
};

const clientId = "64b000000000000000000003";
const barberId = "64b000000000000000000004";
const otherBarberId = "64b000000000000000000007";
const bookingId = "64b000000000000000000005";
const reviewId = "64b000000000000000000006";

afterEach(() => {
  Booking.findById = originalMethods.bookingFindById;
  Review.create = originalMethods.reviewCreate;
  Review.findOne = originalMethods.reviewFindOne;
  Review.findById = originalMethods.reviewFindById;
  Review.find = originalMethods.reviewFind;
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

const mockReviewDependencies = ({ bookingStatus = "completed" } = {}) => {
  Booking.findById = async () => ({
    _id: bookingId,
    barberId,
    clientId,
    status: bookingStatus,
    reviewed: false,
    async save() {
      return this;
    },
  });
  Review.findOne = async () => null;
  Review.create = async (payload) => ({
    _id: reviewId,
    ...payload,
    reply: { message: "", repliedBy: null, updatedAt: null },
    populate: async function populate() {
      return {
        ...this,
        clientId: {
          _id: clientId,
          name: "Client",
        },
      };
    },
  });
};

const createMockReview = (overrides = {}) => {
  const review = {
    _id: reviewId,
    barberId: overrides.barberId || barberId,
    clientId: { _id: clientId, name: "Client" },
    bookingId,
    rating: 5,
    comment: "Great work",
    isVerified: true,
    reply: overrides.reply || { message: "", repliedBy: null, updatedAt: null },
    toObject() {
      return { ...this };
    },
    async save() {
      return this;
    },
    populate: async function () {
      return this;
    },
  };
  return review;
};

// ── Existing tests ──────────────────────────────────────────────────

test("expired booking cannot be reviewed", async () => {
  const res = createResponse();
  mockReviewDependencies({ bookingStatus: "expired" });

  await createReview(
    {
      user: { _id: clientId },
      body: {
        barberId,
        bookingId,
        rating: 5,
        comment: "Too late",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    "Review is allowed only for completed bookings"
  );
});

test("completed booking can still be reviewed", async () => {
  const res = createResponse();
  mockReviewDependencies({ bookingStatus: "completed" });

  await createReview(
    {
      user: { _id: clientId },
      body: {
        barberId,
        bookingId,
        rating: 5,
        comment: "Great",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.barberId, barberId);
  assert.equal(res.body.bookingId, bookingId);
});

test("createReview rejects invalid rating values before DB lookup", async () => {
  for (const rating of [0, -1, 6, "5", null]) {
    const res = createResponse();
    let bookingLookupCount = 0;
    let createCount = 0;

    Booking.findById = async () => {
      bookingLookupCount++;
      return null;
    };
    Review.create = async () => {
      createCount++;
      return {};
    };

    await createReview(
      {
        user: { _id: clientId },
        body: {
          barberId,
          bookingId,
          rating,
          comment: "Great",
        },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Rating must be a number from 1 to 5");
    assert.equal(bookingLookupCount, 0);
    assert.equal(createCount, 0);
  }
});

test("createReview unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Booking.findById = async () => {
    throw new Error("raw database failure");
  };

  await withSilencedConsoleError(async () => {
    await createReview(
      {
        user: { _id: clientId },
        body: {
          barberId,
          bookingId,
          rating: 5,
          comment: "Great",
        },
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create review");
});

// ── Reply tests for barber reviews ──────────────────────────────────

test("barber can add reply to own review", async () => {
  const res = createResponse();
  Review.findById = async () => createMockReview({ barberId });

  await addReplyToReview(
    {
      user: { _id: barberId },
      params: { reviewId },
      body: { message: "Thank you for your feedback!" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply.message, "Thank you for your feedback!");
  assert.equal(res.body.reply.repliedBy, barberId);
  assert.ok(res.body.reply.updatedAt);
});

test("barber can update existing reply", async () => {
  const res = createResponse();
  Review.findById = async () =>
    createMockReview({
      barberId,
      reply: {
        message: "Old reply",
        repliedBy: barberId,
        updatedAt: new Date("2024-01-01"),
      },
    });

  await addReplyToReview(
    {
      user: { _id: barberId },
      params: { reviewId },
      body: { message: "Updated reply" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply.message, "Updated reply");
  assert.equal(res.body.reply.repliedBy, barberId);
  assert.ok(res.body.reply.updatedAt);
});

test("barber can delete reply", async () => {
  const res = createResponse();
  Review.findById = async () =>
    createMockReview({
      barberId,
      reply: {
        message: "Old reply",
        repliedBy: barberId,
        updatedAt: new Date(),
      },
    });

  await deleteReplyFromReview(
    {
      user: { _id: barberId },
      params: { reviewId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, null);
});

test("barber cannot reply to another barber's review", async () => {
  const res = createResponse();
  Review.findById = async () =>
    createMockReview({ barberId: otherBarberId });

  await addReplyToReview(
    {
      user: { _id: barberId },
      params: { reviewId },
      body: { message: "I shouldn't be able to reply" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(
    res.body.message,
    "You can only reply to reviews for your own profile"
  );
});

test("client cannot reply to a barber review", async () => {
  const res = createResponse();
  Review.findById = async () => createMockReview({ barberId });

  await addReplyToReview(
    {
      user: { _id: clientId },
      params: { reviewId },
      body: { message: "I'm a client trying to reply" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(
    res.body.message,
    "You can only reply to reviews for your own profile"
  );
});

test("empty reply message is rejected", async () => {
  const res = createResponse();

  await addReplyToReview(
    {
      user: { _id: barberId },
      params: { reviewId },
      body: { message: "" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Reply message is required");
});

test("review not found returns 404 for add reply", async () => {
  const res = createResponse();
  Review.findById = async () => null;

  await addReplyToReview(
    {
      user: { _id: barberId },
      params: { reviewId },
      body: { message: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Review not found");
});

test("review not found returns 404 for delete reply", async () => {
  const res = createResponse();
  Review.findById = async () => null;

  await deleteReplyFromReview(
    {
      user: { _id: barberId },
      params: { reviewId },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Review not found");
});

test("getReviewsByBarber includes reply field", async () => {
  const { getReviewsByBarber } = await import("./reviews/reviewController.js");
  const res = createResponse();

  // Chainable mock: Review.find().populate().sort()
  Review.find = () => ({
    populate: () => ({
      sort: async () => [
        {
          _id: reviewId,
          barberId,
          clientId: { _id: clientId, name: "Client" },
          bookingId,
          rating: 5,
          comment: "Nice",
          isVerified: true,
          reply: {
            message: "Thanks!",
            repliedBy: barberId,
            updatedAt: new Date(),
          },
          toObject() {
            return { ...this };
          },
        },
      ],
    }),
  });

  await getReviewsByBarber(
    {
      params: { barberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 1);
  assert.ok(res.body[0].reply);
  assert.equal(res.body[0].reply.message, "Thanks!");
});

test("review without reply serializes reply as null", async () => {
  const { getReviewsByBarber } = await import("./reviews/reviewController.js");
  const res = createResponse();

  // Chainable mock for Review.find().populate().sort()
  Review.find = () => ({
    populate: () => ({
      sort: async () => [
        {
          _id: reviewId,
          barberId,
          clientId: { _id: clientId, name: "Client" },
          bookingId,
          rating: 5,
          comment: "Nice",
          isVerified: true,
          toObject() {
            return { ...this };
          },
        },
      ],
    }),
  });

  await getReviewsByBarber(
    {
      params: { barberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].reply, null);
});
