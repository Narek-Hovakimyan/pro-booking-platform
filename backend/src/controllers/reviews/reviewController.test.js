import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createReview,
  addReplyToReview,
  deleteReplyFromReview,
} from "./reviewController.js";
import Booking from "../../models/Booking.js";
import Review from "../../models/Review.js";
import {
  __reviewCreationServiceTestHooks,
} from "../../services/reviews/reviewCreationService.js";

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

const installTransactionStub = () => {
  __reviewCreationServiceTestHooks.setStartSession(async () => ({
    async withTransaction(task) {
      return task();
    },
    async endSession() {},
  }));
};

installTransactionStub();

afterEach(() => {
  Booking.findById = originalMethods.bookingFindById;
  Review.create = originalMethods.reviewCreate;
  Review.findOne = originalMethods.reviewFindOne;
  Review.findById = originalMethods.reviewFindById;
  Review.find = originalMethods.reviewFind;
  installTransactionStub();
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
  Review.create = async ([payload]) => [
    {
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
    },
  ];
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

test("createReview rejects malformed IDs before DB lookup", async () => {
  const hostileId = {
    toString() {
      throw new Error("coercion should not run");
    },
    valueOf() {
      throw new Error("valueOf should not run");
    },
  };

  for (const ids of [
    { barberId: "not-an-id", bookingId },
    { barberId, bookingId: "not-an-id" },
    { barberId: hostileId, bookingId },
  ]) {
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
          ...ids,
          rating: 5,
          comment: "Great",
        },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "barberId and bookingId must be valid IDs");
    assert.equal(bookingLookupCount, 0);
    assert.equal(createCount, 0);
  }
});

test("createReview rejects malformed comments before DB lookup", async () => {
  const hostileComment = {
    toString() {
      throw new Error("coercion should not run");
    },
    valueOf() {
      throw new Error("valueOf should not run");
    },
  };

  for (const comment of [hostileComment, [], 5, false, Symbol("comment")]) {
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
          rating: 5,
          comment,
        },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Comment must be a string");
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

test("reply rejects non-string message without coercion", async () => {
  const res = createResponse();
  let reviewLookupCount = 0;
  Review.findById = async () => {
    reviewLookupCount++;
    return createMockReview({ barberId });
  };

  await addReplyToReview(
    {
      user: { _id: barberId },
      params: { reviewId },
      body: {
        message: {
          trim() {
            throw new Error("trim should not run");
          },
        },
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Reply message is required");
  assert.equal(reviewLookupCount, 0);
});

test("reply mutations reject malformed review IDs before DB lookup", async () => {
  const hostileReviewId = {
    toString() {
      throw new Error("coercion should not run");
    },
  };

  for (const action of [addReplyToReview, deleteReplyFromReview]) {
    const res = createResponse();
    let reviewLookupCount = 0;
    Review.findById = async () => {
      reviewLookupCount++;
      return createMockReview({ barberId });
    };

    await action(
      {
        user: { _id: barberId },
        params: { reviewId: hostileReviewId },
        body: { message: "Hello" },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid review ID");
    assert.equal(reviewLookupCount, 0);
  }
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
  const { getReviewsByBarber } = await import("./reviewController.js");
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

test("getReviewsByBarber rejects malformed barberId before DB lookup", async () => {
  const { getReviewsByBarber } = await import("./reviewController.js");
  const res = createResponse();
  let findCount = 0;
  Review.find = () => {
    findCount++;
    return { populate: () => ({ sort: async () => [] }) };
  };

  await getReviewsByBarber(
    {
      params: { barberId: "not-an-id" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid barber ID");
  assert.equal(findCount, 0);
});

test("review without reply serializes reply as null", async () => {
  const { getReviewsByBarber } = await import("./reviewController.js");
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
