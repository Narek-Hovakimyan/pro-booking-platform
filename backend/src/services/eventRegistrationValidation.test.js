import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Salon from "../models/Salon.js";
import {
  countApprovedRegistrations,
  loadEventOrError,
  loadManageableEventOrError,
  validateApproveTransition,
  validateCancellationPreconditions,
  validateRegistrationRequestPreconditions,
  validateRejectTransition,
  validateWaitlistTransition,
} from "./eventRegistrationValidation.js";

const originalSalonFindById = Salon.findById;

const organizerId = "64b000000000000000000001";
const adminId = "64b000000000000000000002";
const memberId = "64b000000000000000000003";
const eventId = "64b000000000000000000004";
const salonId = "64b000000000000000000005";

afterEach(() => {
  Salon.findById = originalSalonFindById;
});

const createEvent = (overrides = {}) => ({
  _id: eventId,
  organizerId,
  salonId: null,
  status: "upcoming",
  maxParticipants: 2,
  ...overrides,
});

const createRegistration = (overrides = {}) => ({
  _id: "registration-1",
  eventId,
  userId: memberId,
  status: "pending",
  ...overrides,
});

test("loadEventOrError preserves event-not-found behavior", async () => {
  const found = await loadEventOrError({
    eventId,
    EventModel: {
      async findById(id) {
        return String(id) === eventId ? createEvent() : null;
      },
    },
  });
  const missing = await loadEventOrError({
    eventId: "missing",
    EventModel: {
      async findById() {
        return null;
      },
    },
  });

  assert.equal(found.event._id, eventId);
  assert.deepEqual(missing, { error: "Event not found", code: 404 });
});

test("loadManageableEventOrError preserves organizer and salon-manager access matrix", async () => {
  const event = createEvent({ salonId });
  const EventModel = {
    async findById() {
      return event;
    },
  };

  Salon.findById = async () => ({
    _id: salonId,
    ownerId: organizerId,
    admins: [adminId],
  });

  const organizerAccess = await loadManageableEventOrError({
    eventId,
    user: { _id: organizerId, role: "barber" },
    unauthorizedMessage: "Nope",
    EventModel,
  });
  const adminAccess = await loadManageableEventOrError({
    eventId,
    user: { _id: adminId, role: "barber" },
    unauthorizedMessage: "Nope",
    EventModel,
  });
  const deniedAccess = await loadManageableEventOrError({
    eventId,
    user: { _id: memberId, role: "barber" },
    unauthorizedMessage: "Nope",
    EventModel,
  });

  assert.equal(organizerAccess.event._id, eventId);
  assert.equal(adminAccess.event._id, eventId);
  assert.deepEqual(deniedAccess, { error: "Nope", code: 403 });
});

test("validateRegistrationRequestPreconditions preserves participant transition matrix and capacity boundaries", () => {
  assert.deepEqual(
    validateRegistrationRequestPreconditions({
      event: createEvent({ status: "cancelled" }),
      userId: memberId,
      existingRegistration: null,
      approvedCount: 0,
    }),
    { error: "Event is not open for registration", code: 400 }
  );

  assert.deepEqual(
    validateRegistrationRequestPreconditions({
      event: createEvent(),
      userId: organizerId,
      existingRegistration: null,
      approvedCount: 0,
    }),
    { error: "Organizer cannot register for their own event", code: 400 }
  );

  for (const [status, message] of [
    ["pending", "Registration already pending"],
    ["approved", "You are already approved for this event"],
    ["rejected", "Your registration was already rejected for this event"],
    ["waitlisted", "You are already on the waiting list for this event"],
  ]) {
    assert.deepEqual(
      validateRegistrationRequestPreconditions({
        event: createEvent(),
        userId: memberId,
        existingRegistration: createRegistration({ status }),
        approvedCount: 0,
      }),
      { error: message, code: 400 }
    );
  }

  assert.deepEqual(
    validateRegistrationRequestPreconditions({
      event: createEvent({ maxParticipants: 1 }),
      userId: memberId,
      existingRegistration: createRegistration({ status: "cancelled" }),
      approvedCount: 1,
    }),
    { shouldWaitlist: true }
  );

  assert.deepEqual(
    validateRegistrationRequestPreconditions({
      event: createEvent({ maxParticipants: 0 }),
      userId: memberId,
      existingRegistration: null,
      approvedCount: 99,
    }),
    { shouldWaitlist: false }
  );
});

test("registration and approval guards can defer capacity checks without new coercion", () => {
  const hostileMaxParticipants = {
    valueOf() {
      throw new Error("maxParticipants should not be coerced yet");
    },
  };

  assert.deepEqual(
    validateRegistrationRequestPreconditions({
      event: createEvent({ maxParticipants: hostileMaxParticipants }),
      userId: memberId,
      existingRegistration: null,
      includeCapacity: false,
    }),
    { allowed: true }
  );

  assert.deepEqual(
    validateApproveTransition({
      registration: createRegistration({ status: "pending" }),
      maxParticipants: hostileMaxParticipants,
      includeCapacity: false,
    }),
    { allowed: true }
  );
});

test("validateCancellationPreconditions preserves fail-closed participant cancellation behavior", () => {
  assert.deepEqual(
    validateCancellationPreconditions({
      registration: createRegistration(),
      approvedRegistration: null,
    }),
    { allowed: true }
  );

  assert.deepEqual(
    validateCancellationPreconditions({
      registration: null,
      approvedRegistration: createRegistration({ status: "approved" }),
    }),
    {
      error: "Approved registration cannot be cancelled by participant",
      code: 400,
    }
  );

  assert.deepEqual(
    validateCancellationPreconditions({
      registration: null,
      approvedRegistration: null,
    }),
    { error: "Registration not found", code: 404 }
  );
});

test("validate waitlist, approve, and reject transitions preserve invalid-transition behavior", () => {
  assert.deepEqual(validateWaitlistTransition(createRegistration({ status: "pending" })), {
    allowed: true,
  });
  assert.deepEqual(
    validateWaitlistTransition(createRegistration({ status: "cancelled" })),
    {
      error: "Only pending or approved registrations can be waitlisted",
      code: 400,
    }
  );

  assert.deepEqual(
    validateApproveTransition({
      registration: createRegistration({ status: "approved" }),
      approvedCount: 0,
      maxParticipants: 2,
    }),
    { error: "Registration is already approved", code: 400 }
  );
  assert.deepEqual(
    validateApproveTransition({
      registration: createRegistration({ status: "rejected" }),
      approvedCount: 0,
      maxParticipants: 2,
    }),
    {
      error: "Only pending or waitlisted registrations can be approved",
      code: 400,
    }
  );
  assert.deepEqual(
    validateApproveTransition({
      registration: createRegistration({ status: "waitlisted" }),
      approvedCount: 1,
      maxParticipants: 1,
    }),
    { error: "Event is full", code: 400 }
  );
  assert.deepEqual(
    validateApproveTransition({
      registration: createRegistration({ status: "waitlisted" }),
      approvedCount: 0,
      maxParticipants: 0,
    }),
    { allowed: true }
  );

  assert.deepEqual(
    validateRejectTransition(createRegistration({ status: "rejected" })),
    { error: "Registration is already rejected", code: 400 }
  );
  assert.deepEqual(
    validateRejectTransition(createRegistration({ status: "cancelled" })),
    {
      error: "Only pending or waitlisted registrations can be rejected",
      code: 400,
    }
  );
  assert.deepEqual(
    validateRejectTransition(createRegistration({ status: "pending" })),
    { allowed: true }
  );
});

test("countApprovedRegistrations preserves approved-only counting", async () => {
  let capturedQuery = null;

  const count = await countApprovedRegistrations(eventId, {
    EventRegistrationModel: {
      async countDocuments(query) {
        capturedQuery = query;
        return 3;
      },
    },
  });

  assert.equal(count, 3);
  assert.deepEqual(capturedQuery, {
    eventId,
    status: "approved",
  });
});
