import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import path from "path";

import {
  delayBooking,
  getReferenceImage,
  updateBooking,
  updateTreatmentRecord,
} from "./bookingController.js";
import { getBarberBookings } from "./bookingReadController.js";
import { serializeAvailabilityBooking } from "../utils/bookingUtils.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import LoyaltyProgram from "../models/LoyaltyProgram.js";
import LoyaltyProgress from "../models/LoyaltyProgress.js";
import mongoose from "mongoose";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  barber,
  barberId,
  barberWithSalon,
  bookingDate,
  client,
  clientId,
  createMutableBooking,
  createResponse,
  originalMethods,
  otherClient,
  salonId,
} from "./bookingController.testUtils.js";

const originalConsoleError = console.error;

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Salon.exists = originalMethods.salonExists;
  Salon.findById = originalMethods.salonFindById;
  Schedule.findOne = originalMethods.scheduleFindOne;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
  console.error = originalConsoleError;
});

const bookingReferenceDir = path.resolve(process.cwd(), "uploads", "booking-references");

const createSendFileResponse = ({ sendFileError, headersSent = false } = {}) => ({
  ...createResponse(),
  headersSent,
  sentFile: "",
  sendFile(filePath, callback) {
    this.sentFile = filePath;
    if (typeof callback === "function") {
      callback(sendFileError);
    }
    return this;
  },
});

// ── Plain object validation tests ──────────────────────────────────

test("barber sees their own booking list", async () => {
  const booking = createMutableBooking();
  const res = createResponse();

  Booking.find = async (query) => {
    assert.equal(String(query.barberId), barberId);
    return [booking];
  };

  await getBarberBookings(
    {
      user: barber,
      params: { barberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [booking]);
});

test("delayBooking rejects invalid bookingDate or time before grace bypass", async () => {
  for (const overrides of [
    { bookingDate: "not-a-date", expectedMessage: "bookingDate must be YYYY-MM-DD" },
    { time: "not-a-time", expectedMessage: "Booking time is invalid" },
  ]) {
    const booking = createMutableBooking({
      status: "accepted",
      ...overrides,
    });
    const res = createResponse();
    let slotValidationFinds = 0;
    let updateAttempts = 0;

    Booking.findById = async () => booking;
    Booking.find = async () => {
      slotValidationFinds++;
      return [];
    };
    Booking.findOneAndUpdate = async () => {
      updateAttempts++;
      return booking;
    };

    await delayBooking(
      {
        user: client,
        params: { id: booking._id },
        body: { delayMinutes: 10 },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, overrides.expectedMessage);
    assert.equal(slotValidationFinds, 0);
    assert.equal(updateAttempts, 0);
  }
});

test("delayBooking unexpected error returns 500", async () => {
  const res = createResponse();
  console.error = () => {};
  Booking.findById = async () => {
    throw new Error("database unavailable");
  };

  await delayBooking(
    {
      user: client,
      params: { id: "booking-1" },
      body: { delayMinutes: 10 },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not delay booking");
});

test("GET reference image unauthenticated returns 401", async () => {
  const res = createResponse();
  let nextCalled = false;

  await protect(
    { headers: {} },
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("GET reference image by booking client returns 200", async () => {
  const imageName = "ref-owned.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  const res = createSendFileResponse();

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.sentFile, path.join(bookingReferenceDir, imageName));
});

test("GET reference image missing on disk returns 404 without leaking path", async () => {
  const imageName = "ref-missing-on-disk.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  console.error = () => {};
  const res = createSendFileResponse({
    sendFileError: Object.assign(
      new Error(`ENOENT: no such file, open ${path.join(bookingReferenceDir, imageName)}`),
      { code: "ENOENT" }
    ),
  });

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Image file not found");
  assert.equal(res.body.message.includes(bookingReferenceDir), false);
});

test("GET reference image sendFile error returns 500 without leaking raw message", async () => {
  const imageName = "ref-sendfile-error.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  console.error = () => {};
  const res = createSendFileResponse({
    sendFileError: new Error(`raw filesystem failure at ${bookingReferenceDir}`),
  });

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not serve reference image");
  assert.equal(res.body.message.includes("raw filesystem failure"), false);
  assert.equal(res.body.message.includes(bookingReferenceDir), false);
});

test("GET reference image unexpected lookup error returns 500 without leaking raw message", async () => {
  const imageName = "ref-lookup-error.jpg";
  Booking.findById = async () => {
    throw new Error("raw booking lookup failure");
  };
  console.error = () => {};
  const res = createResponse();

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not serve reference image");
  assert.equal(res.body.message.includes("raw booking lookup failure"), false);
});

test("GET reference image by assigned barber returns 200", async () => {
  const imageName = "ref-barber.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  const res = createSendFileResponse();

  await getReferenceImage(
    {
      user: barber,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.sentFile, path.join(bookingReferenceDir, imageName));
});

test("GET reference image allows booking salon owner", async () => {
  const imageName = "ref-salon-owner.jpg";
  const ownerId = "64b000000000000000000021";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId,
    });
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: salonId, ownerId, admins: [] }),
    }),
  });
  const res = createSendFileResponse();

  await getReferenceImage(
    {
      user: { _id: ownerId, role: "barber" },
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.sentFile, path.join(bookingReferenceDir, imageName));
});

test("GET reference image denies owner/admin of a different salon", async () => {
  const imageName = "ref-wrong-salon.jpg";
  const wrongSalonOwnerId = "64b000000000000000000022";
  const wrongSalonAdminId = "64b000000000000000000023";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId,
    });
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: salonId,
        ownerId: "64b000000000000000000024",
        admins: ["64b000000000000000000025"],
      }),
    }),
  });

  for (const userId of [wrongSalonOwnerId, wrongSalonAdminId]) {
    const res = createResponse();

    await getReferenceImage(
      {
        user: { _id: userId, role: "barber" },
        params: { bookingId: barberId, imageName },
      },
      res
    );

    assert.equal(res.statusCode, 403);
  }
});

test("GET reference image by unrelated user returns 403", async () => {
  const imageName = "ref-unrelated.jpg";
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: [`uploads/booking-references/${imageName}`],
      salonId: null,
    });
  const res = createResponse();

  await getReferenceImage(
    {
      user: otherClient,
      params: { bookingId: barberId, imageName },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("GET reference image with traversal returns 400", async () => {
  Booking.findById = async () => {
    throw new Error("should not load booking for invalid image name");
  };
  const res = createResponse();

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName: "..\\secret.jpg" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("GET reference image not listed on booking returns 404", async () => {
  Booking.findById = async () =>
    createMutableBooking({
      _id: barberId,
      referenceImages: ["uploads/booking-references/ref-listed.jpg"],
    });
  const res = createResponse();

  await getReferenceImage(
    {
      user: client,
      params: { bookingId: barberId, imageName: "ref-missing.jpg" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
});

// ── Consultation / Consent Tests ────────────────────────────────────

test("public/non-owner serialized booking does not include consultation", async () => {
  const booking = createMutableBooking({
    consultation: {
      hairType: "coily",
      chemicalTreatments: "color",
      allergies: "sulfates",
    },
    consent: {
      accepted: true,
      acceptedAt: new Date(),
      textVersion: "v1.0",
    },
  });

  const serialized = serializeAvailabilityBooking(booking, "unrelated-user");

  assert.equal(serialized.consultation, undefined);
  assert.equal(serialized.consent, undefined);
});

test("public/non-owner serialized booking does not include consent", async () => {
  const booking = createMutableBooking({
    consent: {
      accepted: true,
      acceptedAt: new Date(),
      textVersion: "v2.0",
    },
  });

  const serialized = serializeAvailabilityBooking(booking, null);

  assert.equal(serialized.consent, undefined);
});

// =========================================================================
// Phase 9 — Loyalty / punch-card automation
// =========================================================================

test("completing accepted booking with active loyalty program creates punch progress for client", async () => {
  const savedProgresses = [];
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  LoyaltyProgram.findOne = async () => ({
    _id: "loyalty-prog-1",
    ownerType: "barber",
    ownerId: barberId,
    title: "Frequent Visit",
    requiredVisits: 5,
    rewardText: "Free haircut",
    active: true,
  });
  LoyaltyProgress.findOne = async () => null;
  LoyaltyProgress.create = async (payload) => {
    const doc = {
      ...payload,
      _id: "loyalty-progress-1",
      async save() { return this; },
    };
    savedProgresses.push(doc);
    return doc;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(savedProgresses.length, 1);
  assert.equal(savedProgresses[0].programId, "loyalty-prog-1");
  assert.equal(savedProgresses[0].clientId, clientId);
  assert.equal(savedProgresses[0].punchCount, 1);
  assert.equal(savedProgresses[0].punchBookingIds.length, 1);
  assert.equal(String(savedProgresses[0].punchBookingIds[0]), String(booking._id));
  assert.equal(savedProgresses[0].rewardsEarned, 0);
});

test("duplicate punch for same booking is skipped (punchBookingIds dedup)", async () => {
  let savedProgress = {
    _id: "loyalty-progress-2",
    programId: "loyalty-prog-1",
    clientId,
    punchBookingIds: [new mongoose.Types.ObjectId("000000000000000000000001")],
    punchCount: 0,
    rewardsEarned: 0,
  };
  let saveCalled = false;
  const notifications = [];

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  LoyaltyProgram.findOne = async () => ({
    _id: "loyalty-prog-1",
    ownerType: "barber",
    ownerId: barberId,
    title: "Frequent Visit",
    requiredVisits: 5,
    rewardText: "Free haircut",
    active: true,
  });
  LoyaltyProgress.findOne = async () => savedProgress;
  LoyaltyProgress.create = async () => { throw new Error("should not create"); };

  const booking = createMutableBooking({
    _id: "000000000000000000000001",
    status: "accepted"
  });
  const res = createResponse();
  Booking.findById = async () => booking;

  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Override save to capture call
  Object.defineProperty(savedProgress, "save", {
    value: async function () { saveCalled = true; },
    writable: true,
  });

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  // save should not be called because the booking was already punched
  assert.equal(saveCalled, false);
  assert.equal(savedProgress.punchCount, 0); // unchanged
  assert.equal(savedProgress.punchBookingIds.length, 1); // unchanged
  // No loyalty_reward_earned notification
  const rewardNotifs = notifications.filter((n) => n.type === "loyalty_reward_earned");
  assert.equal(rewardNotifs.length, 0);
});

test("reward notification created when punchCount reaches requiredVisits threshold", async () => {
  let savedProgress = {
    _id: "loyalty-progress-3",
    programId: "loyalty-prog-1",
    clientId,
    punchBookingIds: [],
    punchCount: 4,
    rewardsEarned: 0,
    save: async function () { /* mock */ },
  };
  const notifications = [];

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  LoyaltyProgram.findOne = async () => ({
    _id: "loyalty-prog-1",
    ownerType: "barber",
    ownerId: barberId,
    title: "Frequent Visit",
    requiredVisits: 5,
    rewardText: "Free haircut",
    active: true,
  });
  LoyaltyProgress.findOne = async () => savedProgress;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);

  const rewardNotifs = notifications.filter((n) => n.type === "loyalty_reward_earned");
  assert.equal(rewardNotifs.length, 1);
  assert.equal(rewardNotifs[0].userId, clientId);
  assert.ok(rewardNotifs[0].message.includes("Free haircut"));
  assert.ok(rewardNotifs[0].data.programId);
  assert.ok(rewardNotifs[0].data.bookingId);
  assert.ok(rewardNotifs[0].data.barberId);
});

test("no active loyalty program means no loyalty progress or reward notification", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  LoyaltyProgram.findOne = async () => null;
  let progressFindCalled = false;
  LoyaltyProgress.findOne = async () => {
    progressFindCalled = true;
    return null;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  // Should not have queried progress at all since no active program
  assert.equal(progressFindCalled, false);
  const rewardNotifs = notifications.filter((n) => n.type === "loyalty_reward_earned");
  assert.equal(rewardNotifs.length, 0);
});

test("non-completion status changes do not create loyalty progress", async () => {
  const notifications = [];
  let loyaltyProgramFindCallCount = 0;

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  LoyaltyProgram.findOne = async () => {
    loyaltyProgramFindCallCount++;
    return null;
  };
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  for (const statusChange of [
    { from: "pending", to: "accepted" },
    { from: "pending", to: "rejected", rejectionReason: "Unavailable" },
    { from: "accepted", to: "rejected", rejectionReason: "Unavailable" },
  ]) {
    const booking = createMutableBooking({ status: statusChange.from });
    const res = createResponse();
    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: statusChange.to, ...(statusChange.rejectionReason ? { rejectionReason: statusChange.rejectionReason } : {}) },
      },
      res
    );

    assert.equal(res.statusCode, 200);
  }

  // LoyaltyProgram.findOne should not have been called for non-completion changes
  assert.equal(loyaltyProgramFindCallCount, 0);
  const rewardNotifs = notifications.filter((n) => n.type === "loyalty_reward_earned");
  assert.equal(rewardNotifs.length, 0);
});

test("existing Phase 7 and Phase 8 tests still pass after loyalty punch addition", async () => {
  let notificationCounter = 0;
  const notifications = [];
  Notification.create = async (payload) => {
    const doc = { _id: `notif-${++notificationCounter}`, ...payload };
    notifications.push(doc);
    return doc;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  LoyaltyProgram.findOne = async () => null;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Test: barber completes the accepted booking
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(booking.status, "completed");
  assert.ok(booking.completedAt);

  // review_request still created
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 1);

  // book_again_reminder still created
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 1);

  // loyalty notifications not created
  const rewardNotifs = notifications.filter((n) => n.type === "loyalty_reward_earned");
  assert.equal(rewardNotifs.length, 0);
});

// ── Contract/integration tests: frontend-shaped payload ──────────────

// ── FormData multipart serialization tests ─────────────────────────

// ── Treatment Record Tests ─────────────────────────────────────────

test("assigned barber creates treatmentRecord for accepted booking", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        colorFormula: "6.3 gold blonde",
        tonerFormula: "9.1 ice toner",
        developer: "20 vol",
        processingTime: "35 min",
        productsUsed: "Wella Koleston, Olaplex",
        techniqueNotes: "Balayage with foils",
        outcomeNotes: "Good lift, even tone",
        reactionNotes: "No irritation",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.treatmentRecord);
  assert.equal(res.body.treatmentRecord.colorFormula, "6.3 gold blonde");
  assert.equal(res.body.treatmentRecord.tonerFormula, "9.1 ice toner");
  assert.equal(res.body.treatmentRecord.developer, "20 vol");
  assert.equal(res.body.treatmentRecord.processingTime, "35 min");
  assert.equal(res.body.treatmentRecord.productsUsed, "Wella Koleston, Olaplex");
  assert.equal(res.body.treatmentRecord.techniqueNotes, "Balayage with foils");
  assert.equal(res.body.treatmentRecord.outcomeNotes, "Good lift, even tone");
  assert.equal(res.body.treatmentRecord.reactionNotes, "No irritation");
  assert.equal(String(res.body.treatmentRecord.recordedBy), barberId);
  assert.ok(res.body.treatmentRecord.recordedAt instanceof Date);
  assert.ok(res.body.treatmentRecord.updatedAt instanceof Date);
  assert.equal(booking.saveCalled, true);
});

test("assigned barber updates treatmentRecord for completed booking", async () => {
  const previousRecordedAt = new Date("2026-01-01T00:00:00.000Z");
  const booking = createMutableBooking({
    _id: barberId,
    status: "completed",
    treatmentRecord: {
      colorFormula: "old color",
      tonerFormula: "",
      developer: "",
      processingTime: "",
      productsUsed: "",
      techniqueNotes: "",
      outcomeNotes: "",
      reactionNotes: "",
      recordedBy: barberId,
      recordedAt: previousRecordedAt,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        colorFormula: "7.1 ash blonde",
        outcomeNotes: "Client very satisfied",
        productsUsed: "Schwarzkopf, Redken",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.treatmentRecord.colorFormula, "7.1 ash blonde");
  assert.equal(res.body.treatmentRecord.outcomeNotes, "Client very satisfied");
  assert.equal(res.body.treatmentRecord.productsUsed, "Schwarzkopf, Redken");
  // Preserved from previous
  assert.equal(res.body.treatmentRecord.tonerFormula, "");
  assert.equal(res.body.treatmentRecord.developer, "");
  assert.equal(res.body.treatmentRecord.processingTime, "");
  assert.equal(res.body.treatmentRecord.techniqueNotes, "");
  assert.equal(res.body.treatmentRecord.reactionNotes, "");
  // recordedBy and recordedAt preserved
  assert.equal(String(res.body.treatmentRecord.recordedBy), barberId);
  assert.equal(res.body.treatmentRecord.recordedAt.getTime(), previousRecordedAt.getTime());
  assert.ok(res.body.treatmentRecord.updatedAt > previousRecordedAt);
});

test("unrelated barber gets 403 for treatmentRecord", async () => {
  const unrelatedBarber = { _id: "64b000000000000000000099", role: "barber" };
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId: null });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: unrelatedBarber,
      params: { id: booking._id },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

test("client gets 403 for treatmentRecord", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId: null });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: client,
      params: { id: booking._id },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(booking.saveCalled, false);
});

test("salon owner can update treatmentRecord for booking in their salon", async () => {
  const ownerId = "64b000000000000000000031";
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId });
  const res = createResponse();

  Booking.findById = async () => booking;
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: salonId, ownerId, admins: [] }),
    }),
  });

  await updateTreatmentRecord(
    {
      user: { _id: ownerId, role: "barber" },
      params: { id: booking._id },
      body: { techniqueNotes: "Salon owner notes" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.treatmentRecord.techniqueNotes, "Salon owner notes");
  assert.equal(booking.saveCalled, true);
});

test("wrong-salon owner/admin gets 403 for treatmentRecord", async () => {
  const wrongOwnerId = "64b000000000000000000032";
  const wrongAdminId = "64b000000000000000000033";
  const booking = createMutableBooking({ _id: barberId, status: "accepted", salonId });
  Booking.findById = async () => booking;
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: salonId,
        ownerId: "64b000000000000000000034",
        admins: ["64b000000000000000000035"],
      }),
    }),
  });

  for (const userId of [wrongOwnerId, wrongAdminId]) {
    const res = createResponse();
    await updateTreatmentRecord(
      {
        user: { _id: userId, role: "barber" },
        params: { id: booking._id },
        body: { techniqueNotes: "Should not save" },
      },
      res
    );
    assert.equal(res.statusCode, 403);
  }
});

test("pending booking returns 400 for treatmentRecord", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "pending" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("accepted or completed"));
  assert.equal(booking.saveCalled, false);
});

test("cancelled/rejected booking returns 400 for treatmentRecord", async () => {
  for (const status of ["cancelled", "rejected", "no_show", "late_cancelled", "expired"]) {
    const booking = createMutableBooking({ _id: barberId, status });
    const res = createResponse();

    Booking.findById = async () => booking;

    await updateTreatmentRecord(
      {
        user: barber,
        params: { id: booking._id },
        body: { colorFormula: "test" },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes("accepted or completed"));
    assert.equal(booking.saveCalled, false);
  }
});

test("malformed booking id returns 400 for treatmentRecord", async () => {
  const res = createResponse();

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: "not-a-valid-id" },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid booking ID");
});

test("unsafe fields from client are ignored in treatmentRecord", async () => {
  const booking = createMutableBooking({ _id: barberId, status: "accepted" });
  const res = createResponse();

  Booking.findById = async () => booking;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: booking._id },
      body: {
        colorFormula: "valid formula",
        recordedBy: "64b000000000000000000099",
        recordedAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
        clientId: "should-be-ignored",
        barberId: "should-be-ignored",
        status: "completed",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  // Color formula was provided on whitelist - should persist
  assert.equal(res.body.treatmentRecord.colorFormula, "valid formula");
  // Unsafe fields must be set server-side, not from client
  assert.equal(String(res.body.treatmentRecord.recordedBy), barberId);
  assert.ok(res.body.treatmentRecord.recordedAt instanceof Date);
  assert.ok(res.body.treatmentRecord.recordedAt > new Date("2020-01-01T00:00:00.000Z"));
  assert.equal(booking.status, "accepted"); // status should not have changed
  assert.equal(booking.saveCalled, true);
});

test("booking not found returns 404 for treatmentRecord", async () => {
  const res = createResponse();

  Booking.findById = async () => null;

  await updateTreatmentRecord(
    {
      user: barber,
      params: { id: "64b000000000000000000099" },
      body: { colorFormula: "test" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
});

test("client booking read excludes treatmentRecord", async () => {
  const { getClientBookingsForRequester } = await import("../services/bookingReadService.js");

  const booking = createMutableBooking({
    treatmentRecord: { colorFormula: "secret", recordedBy: barberId, recordedAt: new Date() },
  });

  // Mock Booking.find to return a chainable with .select()
  Booking.find = () => ({
    select: async (fields) => {
      assert.equal(fields, "-treatmentRecord");
      // Mongoose select removes fields; simulate by deleting treatmentRecord
      const result = { ...booking };
      delete result.treatmentRecord;
      return [result];
    },
  });

  const result = await getClientBookingsForRequester({
    clientId,
    requester: client,
  });

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  // treatmentRecord should not appear in the returned client booking
  assert.equal(result[0].treatmentRecord, undefined);
});

test("public/non-owner serialized booking excludes treatmentRecord", async () => {
  const booking = createMutableBooking({
    treatmentRecord: { colorFormula: "trade-secret", recordedBy: barberId, recordedAt: new Date() },
  });

  const serialized = serializeAvailabilityBooking(booking, "unrelated-viewer");

  assert.equal(serialized.treatmentRecord, undefined);
});

// ── Review Request Automation Tests ────────────────────────────────

test("completing accepted booking creates one review_request notification for client", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "completed");

  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 1);
  assert.equal(reviewRequests[0].userId, clientId);
  assert.equal(reviewRequests[0].message, "How was your visit? Leave a review for your specialist.");
  assert.ok(reviewRequests[0].data.bookingId);
  assert.ok(reviewRequests[0].data.barberId);
});

test("completion does not create review_request if booking.reviewed === true", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted", reviewed: true });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("completion does not create review_request if Review.exists returns true", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => true;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("completion does not create duplicate review_request if notification already exists", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => ({ _id: "existing-notification" });
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("non-completion status changes do not create review_request", async () => {
  const notifications = [];
  let notificationFindOneCallCount = 0;

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => {
    notificationFindOneCallCount++;
    return null;
  };
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  for (const statusChange of [
    { from: "pending", to: "accepted" },
    { from: "pending", to: "rejected", rejectionReason: "Unavailable" },
    { from: "accepted", to: "rejected", rejectionReason: "Unavailable" },
  ]) {
    const booking = createMutableBooking({ status: statusChange.from });
    const res = createResponse();
    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: statusChange.to, ...(statusChange.rejectionReason ? { rejectionReason: statusChange.rejectionReason } : {}) },
      },
      res
    );

    assert.equal(res.statusCode, 200);
  }

  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
  // Non-completion paths should not query Notification.findOne for review_request
  assert.equal(notificationFindOneCallCount, 0);
});

test("re-sending completed status when already completed does not create duplicate request", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Start with already completed booking — status won't change
  // Controller returns 400: "Only accepted bookings can be completed"
  const booking = createMutableBooking({ status: "completed", completedAt: new Date() });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Only accepted bookings can be completed");
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 0);
});

test("review_request notification data contains only safe fields: bookingId, barberId", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reviewRequest = notifications.find((n) => n.type === "review_request");
  assert.ok(reviewRequest);
  const dataKeys = Object.keys(reviewRequest.data);
  assert.equal(dataKeys.length, 2);
  assert.ok(dataKeys.includes("bookingId"));
  assert.ok(dataKeys.includes("barberId"));
  // Ensure no private fields leaked
  assert.equal(dataKeys.includes("clientName"), false);
  assert.equal(dataKeys.includes("clientPhone"), false);
  assert.equal(dataKeys.includes("phone"), false);
  assert.equal(dataKeys.includes("consultation"), false);
  assert.equal(dataKeys.includes("consent"), false);
  assert.equal(dataKeys.includes("referenceImages"), false);
  assert.equal(dataKeys.includes("treatmentRecord"), false);
});

test("existing completion/status tests still pass after review_request addition", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Test: barber accepts a booking
  const acceptBooking = createMutableBooking({ status: "pending" });
  const acceptRes = createResponse();
  Booking.findById = async () => acceptBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: acceptBooking._id },
      body: { status: "accepted" },
    },
    acceptRes
  );

  assert.equal(acceptRes.statusCode, 200);
  assert.equal(acceptRes.body.status, "accepted");

  // Test: barber completes the accepted booking
  const completeBooking = createMutableBooking({ status: "accepted" });
  const completeRes = createResponse();
  Booking.findById = async () => completeBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: completeBooking._id },
      body: { status: "completed" },
    },
    completeRes
  );

  assert.equal(completeRes.statusCode, 200);
  assert.equal(completeRes.body.status, "completed");
  assert.ok(completeRes.body.completedAt);

  // Test: barber rejects a pending booking
  const rejectBooking = createMutableBooking({ status: "pending" });
  const rejectRes = createResponse();
  Booking.findById = async () => rejectBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: rejectBooking._id },
      body: { status: "rejected", rejectionReason: "Unavailable" },
    },
    rejectRes
  );

  assert.equal(rejectRes.statusCode, 200);
  assert.equal(rejectRes.body.status, "rejected");
  assert.equal(rejectRes.body.rejectionReason, "Unavailable");
});

// =========================================================================
// Phase 8 — Book again retention automation
// =========================================================================

test("completing accepted booking creates one book_again_reminder notification for client", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 1);
});

test("completion does not create duplicate book_again_reminder if one already exists", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async (query) => {
    if (query.type === "book_again_reminder") return { _id: "existing-reminder" };
    return null;
  };
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 0);
});

test("non-completion status changes do not create book_again_reminder", async () => {
  const notifications = [];
  let notificationFindOneCallCount = 0;

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => {
    notificationFindOneCallCount++;
    return null;
  };
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  for (const statusChange of [
    { from: "pending", to: "accepted" },
    { from: "pending", to: "rejected", rejectionReason: "Unavailable" },
    { from: "accepted", to: "rejected", rejectionReason: "Unavailable" },
  ]) {
    const booking = createMutableBooking({ status: statusChange.from });
    const res = createResponse();
    Booking.findById = async () => booking;

    await updateBooking(
      {
        user: barber,
        params: { id: booking._id },
        body: { status: statusChange.to, ...(statusChange.rejectionReason ? { rejectionReason: statusChange.rejectionReason } : {}) },
      },
      res
    );

    assert.equal(res.statusCode, 200);
  }

  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 0);
  // Non-completion paths should not query Notification.findOne for book_again_reminder
  assert.equal(notificationFindOneCallCount, 0);
});

test("re-sending completed status when already completed does not create duplicate reminder", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Start with already completed booking — status won't change
  // Controller returns 400: "Only accepted bookings can be completed"
  const booking = createMutableBooking({ status: "completed", completedAt: new Date() });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Only accepted bookings can be completed");
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 0);
});

test("book_again_reminder notification payload contains only safe fields: bookingId, barberId, salonId", async () => {
  const notifications = [];
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  const reminder = notifications.find((n) => n.type === "book_again_reminder");
  assert.ok(reminder);
  const dataKeys = Object.keys(reminder.data);
  assert.ok(dataKeys.includes("bookingId"));
  assert.ok(dataKeys.includes("barberId"));
  assert.ok(dataKeys.includes("salonId"));
  // Ensure no private fields leaked
  assert.equal(dataKeys.includes("clientName"), false);
  assert.equal(dataKeys.includes("clientPhone"), false);
  assert.equal(dataKeys.includes("phone"), false);
  assert.equal(dataKeys.includes("consultation"), false);
  assert.equal(dataKeys.includes("consent"), false);
  assert.equal(dataKeys.includes("referenceImages"), false);
  assert.equal(dataKeys.includes("treatmentRecord"), false);
});

test("existing Phase 7 review_request tests still pass after book_again_reminder addition", async () => {
  let notificationCounter = 0;
  const notifications = [];
  Notification.create = async (payload) => {
    const doc = { _id: `notif-${++notificationCounter}`, ...payload };
    notifications.push(doc);
    return doc;
  };
  Notification.findOne = async () => null;
  Review.exists = async () => false;
  User.findById = () => ({
    select: async () => ({ name: "Barber" }),
  });

  // Test: barber completes the accepted booking
  const booking = createMutableBooking({ status: "accepted" });
  const res = createResponse();
  Booking.findById = async () => booking;

  await updateBooking(
    {
      user: barber,
      params: { id: booking._id },
      body: { status: "completed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(booking.status, "completed");
  assert.ok(booking.completedAt);

  // review_request still created
  const reviewRequests = notifications.filter((n) => n.type === "review_request");
  assert.equal(reviewRequests.length, 1);

  // book_again_reminder also created
  const bookAgainReminders = notifications.filter((n) => n.type === "book_again_reminder");
  assert.equal(bookAgainReminders.length, 1);

  // Ensure they are independent notifications
  assert.notEqual(reviewRequests[0]._id, bookAgainReminders[0]._id);

  // Test: barber rejects a pending booking (should not create any notification)
  const rejectBooking = createMutableBooking({ status: "pending" });
  const rejectRes = createResponse();
  Booking.findById = async () => rejectBooking;

  await updateBooking(
    {
      user: barber,
      params: { id: rejectBooking._id },
      body: { status: "rejected", rejectionReason: "Unavailable" },
    },
    rejectRes
  );

  assert.equal(rejectRes.statusCode, 200);
  assert.equal(rejectRes.body.status, "rejected");
  assert.equal(rejectRes.body.rejectionReason, "Unavailable");
});
