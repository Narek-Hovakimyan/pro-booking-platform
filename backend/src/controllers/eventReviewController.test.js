import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createEventReview } from "./eventReviewController.js";
import Event from "../models/Event.js";
import EventRegistration from "../models/EventRegistration.js";
import EventReview from "../models/EventReview.js";

const originalMethods = {
  eventFindById: Event.findById,
  registrationFindById: EventRegistration.findById,
  reviewCreate: EventReview.create,
  reviewFindOne: EventReview.findOne,
};

afterEach(() => {
  Event.findById = originalMethods.eventFindById;
  EventRegistration.findById = originalMethods.registrationFindById;
  EventReview.create = originalMethods.reviewCreate;
  EventReview.findOne = originalMethods.reviewFindOne;
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
