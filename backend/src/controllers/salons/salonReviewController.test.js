import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createSalonReview,
  addReplyToSalonReview,
  deleteReplyFromSalonReview,
} from "./salonReviewController.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import SalonReview from "../../models/SalonReview.js";

const originalMethods = {
  bookingFindById: Booking.findById,
  notificationCreate: Notification.create,
  salonFindById: Salon.findById,
  salonReviewCreate: SalonReview.create,
  salonReviewFindOne: SalonReview.findOne,
  salonReviewFindById: SalonReview.findById,
  salonReviewFind: SalonReview.find,
};

const clientId = "64b000000000000000000003";
const salonId = "64b000000000000000000004";
const bookingId = "64b000000000000000000005";
const otherSalonId = "64b000000000000000000008";
const reviewId = "64b000000000000000000007";
const ownerId = "64b000000000000000000006";
const adminId = "64b000000000000000000009";
const employeeId = "64b00000000000000000000a";
const unrelatedUserId = "64b00000000000000000000b";

afterEach(() => {
  Booking.findById = originalMethods.bookingFindById;
  Notification.create = originalMethods.notificationCreate;
  Salon.findById = originalMethods.salonFindById;
  SalonReview.create = originalMethods.salonReviewCreate;
  SalonReview.findOne = originalMethods.salonReviewFindOne;
  SalonReview.findById = originalMethods.salonReviewFindById;
  SalonReview.find = originalMethods.salonReviewFind;
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

const mockCreateSalonReviewDependencies = ({
  bookingStatus = "completed",
  bookingSalonId = salonId,
} = {}) => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    name: "Salon",
  });
  Booking.findById = async () => ({
    _id: bookingId,
    clientId,
    salonId: bookingSalonId,
    status: bookingStatus,
  });
  SalonReview.findOne = async () => null;
  SalonReview.create = async (payload) => ({
    _id: reviewId,
    ...payload,
    reply: { message: "", repliedBy: null, updatedAt: null },
    populate: async function populate() {
      return {
        ...this,
        clientId: {
          _id: clientId,
          name: "Client",
          avatarUrl: "",
        },
      };
    },
  });
  Notification.create = async (payload) => payload;
};

const makeMockSalonReviewObj = (overrides = {}) => {
  return {
    _id: reviewId,
    salonId: overrides.salonId || salonId,
    clientId: overrides.clientId || {
      _id: clientId,
      name: "Client",
      avatarUrl: "",
    },
    bookingId,
    rating: 5,
    comment: "Great salon",
    isVerified: true,
    reply:
      overrides.reply || { message: "", repliedBy: null, updatedAt: null },
    toObject() {
      return { ...this };
    },
    async save() {
      return this;
    },
  };
};

// ── Existing tests ──────────────────────────────────────────────────

test("salon review works for a completed booking with matching salonId", async () => {
  const res = createResponse();

  mockCreateSalonReviewDependencies();

  await createSalonReview(
    {
      user: {
        _id: clientId,
        name: "Client",
      },
      body: {
        salonId,
        bookingId,
        rating: 5,
        comment: "Great visit",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.salonId, salonId);
  assert.equal(res.body.bookingId, bookingId);
  assert.equal(res.body.rating, 5);
});

test("salon review is rejected when booking is not completed", async () => {
  const res = createResponse();

  mockCreateSalonReviewDependencies({ bookingStatus: "accepted" });

  await createSalonReview(
    {
      user: {
        _id: clientId,
        name: "Client",
      },
      body: {
        salonId,
        bookingId,
        rating: 5,
        comment: "Great visit",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "You can only review completed bookings");
});

test("salon review is rejected when salonId does not match booking", async () => {
  const res = createResponse();

  mockCreateSalonReviewDependencies({ bookingSalonId: otherSalonId });

  await createSalonReview(
    {
      user: {
        _id: clientId,
        name: "Client",
      },
      body: {
        salonId,
        bookingId,
        rating: 5,
        comment: "Great visit",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Salon review must match the booking salon");
});

test("createSalonReview unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  Salon.findById = async () => {
    throw new Error("raw salon db failure");
  };

  await withSilencedConsoleError(async () => {
    await createSalonReview(
      {
        user: {
          _id: clientId,
          name: "Client",
        },
        body: {
          salonId,
          bookingId,
          rating: 5,
          comment: "Great visit",
        },
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not create salon review");
});

// ── Reply tests for salon reviews ───────────────────────────────────

test("salon owner can add reply to salon review", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj();
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });

  await addReplyToSalonReview(
    {
      user: { _id: ownerId },
      params: { reviewId },
      body: { message: "Thank you for visiting!" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply.message, "Thank you for visiting!");
  assert.equal(res.body.reply.repliedBy, ownerId);
  assert.ok(res.body.reply.updatedAt);
});

test("salon owner can update existing reply", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj({
    reply: {
      message: "Old reply",
      repliedBy: ownerId,
      updatedAt: new Date("2024-01-01"),
    },
  });
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });

  await addReplyToSalonReview(
    {
      user: { _id: ownerId },
      params: { reviewId },
      body: { message: "Updated reply from owner" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply.message, "Updated reply from owner");
  assert.equal(res.body.reply.repliedBy, ownerId);
  assert.ok(res.body.reply.updatedAt);
});

test("salon owner can delete reply", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj({
    reply: {
      message: "Old reply",
      repliedBy: ownerId,
      updatedAt: new Date(),
    },
  });
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });

  await deleteReplyFromSalonReview(
    {
      user: { _id: ownerId },
      params: { reviewId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, null);
});

test("salon admin can add reply to salon review", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj();
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [adminId],
  });

  await addReplyToSalonReview(
    {
      user: { _id: adminId },
      params: { reviewId },
      body: { message: "Thanks from admin!" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply.message, "Thanks from admin!");
  assert.equal(res.body.reply.repliedBy, adminId);
  assert.ok(res.body.reply.updatedAt);
});

test("salon admin can delete reply", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj({
    reply: {
      message: "Admin reply",
      repliedBy: adminId,
      updatedAt: new Date(),
    },
  });
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [adminId],
  });

  await deleteReplyFromSalonReview(
    {
      user: { _id: adminId },
      params: { reviewId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, null);
});

test("regular salon employee cannot reply to salon review", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj();
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });

  await addReplyToSalonReview(
    {
      user: { _id: employeeId },
      params: { reviewId },
      body: { message: "I'm an employee trying to reply" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(
    res.body.message,
    "Only salon owner or admin can reply to salon reviews"
  );
});

test("unrelated barber cannot reply to salon review", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj();
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });

  await addReplyToSalonReview(
    {
      user: { _id: unrelatedUserId },
      params: { reviewId },
      body: { message: "I'm unrelated trying to reply" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(
    res.body.message,
    "Only salon owner or admin can reply to salon reviews"
  );
});

test("client cannot reply to salon review", async () => {
  const res = createResponse();

  const mockReview = makeMockSalonReviewObj();
  SalonReview.findById = () => ({
    populate: async () => mockReview,
  });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });

  await addReplyToSalonReview(
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
    "Only salon owner or admin can reply to salon reviews"
  );
});

test("empty reply message rejected for salon review", async () => {
  const res = createResponse();

  await addReplyToSalonReview(
    {
      user: { _id: ownerId },
      params: { reviewId },
      body: { message: "" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Reply message is required");
});

test("salon review not found returns 404 for add reply", async () => {
  const res = createResponse();

  SalonReview.findById = () => ({
    populate: async () => null,
  });

  await addReplyToSalonReview(
    {
      user: { _id: ownerId },
      params: { reviewId },
      body: { message: "Hello" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Review not found");
});

test("salon review not found returns 404 for delete reply", async () => {
  const res = createResponse();

  SalonReview.findById = () => ({
    populate: async () => null,
  });

  await deleteReplyFromSalonReview(
    {
      user: { _id: ownerId },
      params: { reviewId },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Review not found");
});

test("getSalonReviews includes reply field", async () => {
  const { getSalonReviews } = await import("./salonReviewController.js");
  const res = createResponse();

  SalonReview.find = () => ({
    populate: () => ({
      sort: async () => [
        makeMockSalonReviewObj({
          reply: {
            message: "Thanks for coming!",
            repliedBy: ownerId,
            updatedAt: new Date(),
          },
        }),
      ],
    }),
  });

  await getSalonReviews(
    {
      params: { salonId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body.reviews), true);
  assert.equal(res.body.reviews.length, 1);
  assert.ok(res.body.reviews[0].reply);
  assert.equal(res.body.reviews[0].reply.message, "Thanks for coming!");
});

test("salon review without reply serializes reply as null", async () => {
  const { getSalonReviews } = await import("./salonReviewController.js");
  const res = createResponse();

  SalonReview.find = () => ({
    populate: () => ({
      sort: async () => [makeMockSalonReviewObj()],
    }),
  });

  await getSalonReviews(
    {
      params: { salonId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reviews[0].reply, null);
});
