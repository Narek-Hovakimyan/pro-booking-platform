import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createEventReview, getEventReviews } from "./eventReviewController.js";
import Event from "../../models/Event.js";
import EventRegistration from "../../models/EventRegistration.js";
import EventReview from "../../models/EventReview.js";
import Salon from "../../models/Salon.js";

const originalMethods = {
  eventFindById: Event.findById,
  registrationFindById: EventRegistration.findById,
  reviewCreate: EventReview.create,
  reviewFindOne: EventReview.findOne,
  reviewFind: EventReview.find,
  reviewCountDocuments: EventReview.countDocuments,
  registrationFindOne: EventRegistration.findOne,
  salonFindById: Salon.findById,
};

afterEach(() => {
  Event.findById = originalMethods.eventFindById;
  EventRegistration.findById = originalMethods.registrationFindById;
  EventReview.create = originalMethods.reviewCreate;
  EventReview.findOne = originalMethods.reviewFindOne;
  EventReview.find = originalMethods.reviewFind;
  EventReview.countDocuments = originalMethods.reviewCountDocuments;
  EventRegistration.findOne = originalMethods.registrationFindOne;
  Salon.findById = originalMethods.salonFindById;
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

const eventId = "64b000000000000000000010";
const registrationId = "64b000000000000000000011";
const userId = "64b000000000000000000012";
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

const baseEvent = {
  _id: eventId,
  title: "Masterclass",
  date: yesterday,
  time: "10:00",
};

const baseRegistration = {
  _id: registrationId,
  eventId,
  userId,
  status: "approved",
  attended: true,
};

const mockReviewDependencies = ({
  event = baseEvent,
  registration = baseRegistration,
  existingReview = null,
} = {}) => {
  Event.findById = async () => event;
  EventRegistration.findById = async () => registration;
  EventReview.findOne = async () => existingReview;
  EventReview.create = async (payload) => ({
    _id: "64b000000000000000000013",
    ...payload,
    populate: async function populate() {
      return {
        ...this,
        userId: {
          _id: userId,
          name: "Guest",
          avatarUrl: "",
        },
      };
    },
  });
};

const review = {
  _id: "64b000000000000000000014",
  eventId,
  registrationId,
  userId: {
    _id: userId,
    name: "Reviewer",
    avatarUrl: "/avatars/reviewer.png",
    email: "not-selected@example.com",
    phone: "+37400000000",
    platformRole: "internal",
  },
  rating: 5,
  comment: "Helpful event",
  isVerified: true,
};

const reviewQuery = (reviews = [review]) => ({
  populate() { return this; },
  sort: async () => reviews,
});

const mockGetReviews = ({ event = baseEvent, registrations = [], salon = null, reviews = [review] } = {}) => {
  Event.findById = async () => event;
  EventRegistration.findOne = async (query) =>
    registrations.find((registration) =>
      String(registration.eventId) === String(query.eventId) &&
      registration.status === query.status &&
      [registration.userId, registration.barberId].filter(Boolean).some(
        (id) => String(id) === String(query.$or?.[0]?.userId || query.$or?.[1]?.barberId)
      )
    ) || null;
  Salon.findById = async () => salon;
  EventReview.find = () => reviewQuery(reviews);
};

test("approved attended past event can be reviewed", async () => {
  const res = createResponse();
  mockReviewDependencies({
    event: { ...baseEvent, date: yesterday, time: "10:00" },
  });

  await createEventReview(
    {
      params: { id: eventId },
      user: { _id: userId },
      body: { registrationId, rating: 5, comment: "Great class" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.eventId, eventId);
});

test("duplicate event review is blocked", async () => {
  const res = createResponse();
  mockReviewDependencies({
    event: { ...baseEvent, date: yesterday, time: "10:00" },
    existingReview: { _id: "existing" },
  });

  await createEventReview(
    {
      params: { id: eventId },
      user: { _id: userId },
      body: { registrationId, rating: 5, comment: "Again" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "This event registration has already been reviewed");
});

test("pending, rejected, cancelled, and waitlisted registrations cannot be reviewed", async () => {
  for (const status of ["pending", "rejected", "cancelled", "waitlisted"]) {
    const res = createResponse();
    mockReviewDependencies({
      event: { ...baseEvent, date: yesterday, time: "10:00" },
      registration: { ...baseRegistration, status },
    });

    await createEventReview(
      {
        params: { id: eventId },
        user: { _id: userId },
        body: { registrationId, rating: 4, comment: "Blocked" },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Only approved event registrations can be reviewed");
  }
});

test("future event cannot be reviewed", async () => {
  const res = createResponse();
  mockReviewDependencies({
    event: { ...baseEvent, date: tomorrow, time: "10:00" },
  });

  await createEventReview(
    {
      params: { id: eventId },
      user: { _id: userId },
      body: { registrationId, rating: 5, comment: "Too early" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "You can review an event only after it has finished");
});

test("public event reviews preserve anonymous and authenticated response shape", async () => {
  for (const user of [undefined, { _id: "other-user", role: "client" }]) {
    const res = createResponse();
    mockGetReviews();

    await getEventReviews({ params: { id: eventId }, user }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].userId, userId);
    assert.equal(res.body[0].userName, "Reviewer");
    assert.equal(res.body[0].userAvatarUrl, "/avatars/reviewer.png");
    assert.equal(res.body[0].comment, "Helpful event");
    assert.equal("email" in res.body[0], false);
    assert.equal("phone" in res.body[0], false);
    assert.equal("platformRole" in res.body[0], false);
  }
});

test("private event rejects anonymous and unauthorized identities before any review query", async () => {
  for (const user of [
    undefined,
    { _id: "unrelated", role: "client" },
    { _id: "pending", role: "client" },
    { _id: "waitlisted", role: "client" },
    { _id: "rejected", role: "client" },
  ]) {
    const res = createResponse();
    let reviewFindCalled = false;
    let reviewCountCalled = false;
    mockGetReviews({
      event: { ...baseEvent, visibility: "private" },
      registrations: [
        { eventId, userId: "pending", status: "pending" },
        { eventId, userId: "waitlisted", status: "waitlisted" },
        { eventId, userId: "rejected", status: "rejected" },
      ],
    });
    EventReview.find = () => {
      reviewFindCalled = true;
      throw new Error("review query must not run");
    };
    EventReview.countDocuments = async () => {
      reviewCountCalled = true;
      throw new Error("review count must not run");
    };

    await getEventReviews({ params: { id: eventId }, user }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Event not found" });
    assert.equal(reviewFindCalled, false);
    assert.equal(reviewCountCalled, false);
  }
});

test("private approved participant can read reviews without reviewer identity", async () => {
  const res = createResponse();
  mockGetReviews({
    event: { ...baseEvent, visibility: "private" },
    registrations: [{ eventId, userId: "approved-user", status: "approved" }],
  });

  await getEventReviews(
    { params: { id: eventId }, user: { _id: "approved-user", role: "client" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].userId, null);
  assert.equal(res.body[0].userName, "User");
  assert.equal(res.body[0].userAvatarUrl, "");
  assert.equal(res.body[0].comment, "Helpful event");
  for (const privateField of ["email", "phone", "platformRole", "salon", "salons"]) {
    assert.equal(privateField in res.body[0], false);
  }
});

test("private organizer and salon manager receive full reviews", async () => {
  for (const config of [
    {
      user: { _id: userId, role: "barber" },
      event: { ...baseEvent, visibility: "private", organizerId: userId },
    },
    {
      user: { _id: "salon-manager", role: "barber" },
      event: { ...baseEvent, visibility: "private", salonId: "salon-1" },
      salon: { _id: "salon-1", ownerId: "owner", admins: ["salon-manager"] },
    },
  ]) {
    const res = createResponse();
    mockGetReviews({ event: { ...baseEvent, visibility: "private", ...config.event }, salon: config.salon });

    await getEventReviews({ params: { id: eventId }, user: config.user }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].userId, userId);
    assert.equal(res.body[0].userName, "Reviewer");
  }
});

test("private known-ID and nonexistent events have identical not-found responses", async () => {
  const privateRes = createResponse();
  mockGetReviews({ event: { ...baseEvent, visibility: "private" } });
  await getEventReviews({ params: { id: eventId } }, privateRes);

  const missingRes = createResponse();
  mockGetReviews({ event: null });
  await getEventReviews({ params: { id: "missing-event" } }, missingRes);

  assert.equal(privateRes.statusCode, 404);
  assert.deepEqual(privateRes.body, missingRes.body);
});
