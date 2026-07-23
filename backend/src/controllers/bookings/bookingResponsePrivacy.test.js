import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createBooking, delayBooking, updateBooking } from "./bookingController.js";
import { markLateCancel, markNoShow } from "./bookingOutcomeController.js";
import { createRescheduleRequest } from "./bookingRescheduleController.js";
import { getClientBookings } from "./bookingReadController.js";
import {
  barber,
  barberId,
  barberWithSalon,
  bookingDate,
  client,
  clientId,
  createMutableBooking,
  createResponse,
  getFutureBookingDateForDay,
  mockBookingFind,
  mockSuccessfulCreateDependencies,
  originalMethods,
  serviceId,
} from "./bookingController.testUtils.js";
import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Schedule from "../../models/Schedule.js";
import User from "../../models/User.js";
import { serializeBookingForResponse } from "../../utils/bookingUtils.js";

const requestedBookingDate = getFutureBookingDateForDay("wed", 14);

const privateFields = (overrides = {}) => ({
  consultation: { hairType: "curly", notes: "client-safe" },
  consent: { accepted: true, textVersion: "v1.0", acceptedAt: new Date("2026-01-01T00:00:00.000Z") },
  referenceImages: ["uploads/booking-references/private-a.jpg"],
  treatmentRecord: { colorFormula: "secret", recordedBy: barberId, recordedAt: new Date("2026-01-02T00:00:00.000Z") },
  paymentTransactionIds: ["64b000000000000000009001"],
  providerPaymentId: "provider-private",
  rawWebhookPayload: { secret: true },
  paymentStatus: "paid",
  paymentProvider: "mock",
  ...overrides,
});

const validSchedule = {
  barberId,
  salonId: "64b000000000000000000004",
  weeklySchedule: {
    sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
    mon: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
    tue: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
    wed: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
    thu: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
    fri: { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
    sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  },
};

afterEach(() => {
  Booking.create = originalMethods.bookingCreate;
  Booking.find = originalMethods.bookingFind;
  Booking.findById = originalMethods.bookingFindById;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
  Schedule.findOne = originalMethods.scheduleFindOne;
  User.findById = originalMethods.userFindById;
});

test("client serializer strips treatmentRecord and raw referenceImages, keeps consultation/consent, and does not mutate plain objects", () => {
  const booking = createMutableBooking(privateFields());
  const original = {
    consultation: booking.consultation,
    consent: booking.consent,
    referenceImages: booking.referenceImages,
    treatmentRecord: booking.treatmentRecord,
    paymentTransactionIds: booking.paymentTransactionIds,
    providerPaymentId: booking.providerPaymentId,
    rawWebhookPayload: booking.rawWebhookPayload,
  };

  const serialized = serializeBookingForResponse(booking, client);

  assert.equal(serialized.treatmentRecord, undefined);
  assert.equal(serialized.referenceImages, undefined);
  assert.deepEqual(serialized.consultation, booking.consultation);
  assert.deepEqual(serialized.consent, booking.consent);
  assert.equal(serialized.paymentTransactionIds, undefined);
  assert.equal(serialized.providerPaymentId, undefined);
  assert.equal(serialized.rawWebhookPayload, undefined);
  assert.deepEqual(
    {
      consultation: booking.consultation,
      consent: booking.consent,
      referenceImages: booking.referenceImages,
      treatmentRecord: booking.treatmentRecord,
      paymentTransactionIds: booking.paymentTransactionIds,
      providerPaymentId: booking.providerPaymentId,
      rawWebhookPayload: booking.rawWebhookPayload,
    },
    original
  );
});

test("assigned barber serializer keeps treatmentRecord for Mongoose-like documents", () => {
  const source = createMutableBooking(privateFields());
  const serialized = serializeBookingForResponse(
    { toObject: () => ({ ...source }) },
    barber
  );

  assert.deepEqual(serialized.treatmentRecord, source.treatmentRecord);
  assert.deepEqual(serialized.referenceImages, source.referenceImages);
  assert.equal(serialized.paymentTransactionIds, undefined);
});

test("unknown or malformed viewers fail closed without mutating the source booking", () => {
  for (const viewer of [{}, { role: "barber" }, [], () => {}]) {
    const booking = createMutableBooking(privateFields());
    const original = {
      consultation: booking.consultation,
      consent: booking.consent,
      referenceImages: booking.referenceImages,
      treatmentRecord: booking.treatmentRecord,
    };

    const serialized = serializeBookingForResponse(booking, viewer);

    assert.equal(serialized.consultation, undefined);
    assert.equal(serialized.consent, undefined);
    assert.equal(serialized.referenceImages, undefined);
    assert.equal(serialized.treatmentRecord, undefined);
    assert.deepEqual(
      {
        consultation: booking.consultation,
        consent: booking.consent,
        referenceImages: booking.referenceImages,
        treatmentRecord: booking.treatmentRecord,
      },
      original
    );
  }
});

test("client-safe responses cover create, cancel, delay, reschedule request, and client list", async () => {
  const createdBookings = [];
  mockSuccessfulCreateDependencies(createdBookings, barberWithSalon);
  const createRes = createResponse();

  await createBooking(
    {
      user: client,
      body: {
        barberId,
        clientId,
        serviceId,
        bookingDate,
        time: "10:00",
        clientName: "Client",
        consultation: { hairType: "curly", notes: "client-safe" },
        consent: { accepted: true, textVersion: "v1.0" },
      },
      files: [{ path: "uploads/booking-references/private-a.jpg" }],
    },
    createRes
  );

  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.treatmentRecord, undefined);
  assert.equal(createRes.body.referenceImages, undefined);
  assert.deepEqual(createRes.body.consultation, { hairType: "curly", notes: "client-safe" });
  assert.equal(createRes.body.consent.accepted, true);

  const cancellableBooking = createMutableBooking({
    status: "accepted",
    ...privateFields(),
  });
  Booking.findById = async () => cancellableBooking;
  const cancelRes = createResponse();

  await updateBooking(
    {
      user: client,
      params: { id: cancellableBooking._id },
      body: { status: "cancelled", cancelReason: "Need to cancel" },
    },
    cancelRes
  );

  assert.equal(cancelRes.statusCode, 200);
  assert.equal(cancelRes.body.treatmentRecord, undefined);
  assert.equal(cancelRes.body.referenceImages, undefined);
  assert.deepEqual(cancelRes.body.consultation, cancellableBooking.consultation);

  const delayedBooking = createMutableBooking({
    status: "accepted",
    delayMinutesTotal: 0,
    delayedAt: null,
    ...privateFields(),
  });
  Booking.findById = async () => delayedBooking;
  Booking.find = mockBookingFind([]);
  Booking.findOneAndUpdate = async () => ({
    ...delayedBooking,
    time: "10:10",
    delayMinutesTotal: 10,
    delayedAt: new Date(),
  });
  User.findById = () => ({ select: async () => barberWithSalon });
  Schedule.findOne = async () => validSchedule;
  Notification.create = async (payload) => payload;
  const delayRes = createResponse();

  await delayBooking(
    {
      user: client,
      params: { id: delayedBooking._id },
      body: { delayMinutes: 10 },
    },
    delayRes
  );

  assert.equal(delayRes.statusCode, 200);
  assert.equal(delayRes.body.treatmentRecord, undefined);
  assert.equal(delayRes.body.referenceImages, undefined);
  assert.equal(delayRes.body.time, "10:10");

  const rescheduleBooking = createMutableBooking({
    status: "accepted",
    ...privateFields(),
  });
  Booking.findById = async () => rescheduleBooking;
  Booking.find = mockBookingFind([]);
  Schedule.findOne = async () => validSchedule;
  User.findById = () => ({ select: async () => barberWithSalon });
  Notification.create = async (payload) => payload;
  const rescheduleRes = createResponse();

  await createRescheduleRequest(
    {
      user: client,
      params: { id: rescheduleBooking._id },
      body: {
        bookingDate: requestedBookingDate,
        dayKey: "wed",
        time: "11:30",
        note: "Please move this",
      },
    },
    rescheduleRes
  );

  assert.equal(rescheduleRes.statusCode, 201);
  assert.equal(rescheduleRes.body.treatmentRecord, undefined);
  assert.equal(rescheduleRes.body.referenceImages, undefined);
  assert.deepEqual(rescheduleRes.body.consultation, rescheduleBooking.consultation);

  Booking.find = () => ({
    select: async () => [createMutableBooking(privateFields())],
  });
  const listRes = createResponse();

  await getClientBookings(
    {
      user: client,
      params: { clientId },
    },
    listRes
  );

  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body[0].treatmentRecord, undefined);
  assert.equal(listRes.body[0].referenceImages, undefined);
  assert.deepEqual(listRes.body[0].consultation, { hairType: "curly", notes: "client-safe" });
  assert.equal(listRes.body[0].consent.accepted, true);
  assert.equal(listRes.body[0].paymentTransactionIds, undefined);
});

test("no-show and late-cancel responses serialize for the authenticated barber viewer", async () => {
  const baseBooking = createMutableBooking({
    status: "accepted",
    bookingDate: "2020-01-15",
    ...privateFields(),
  });

  Booking.findById = async () => baseBooking;
  Booking.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(baseBooking._id)) return null;
    if (String(query.barberId) !== String(barberId)) return null;
    if (query.status !== baseBooking.status) return null;

    Object.assign(baseBooking, update.$set || {});
    return baseBooking;
  };
  Notification.create = async (payload) => payload;

  const noShowRes = createResponse();
  await markNoShow(
    {
      user: barber,
      params: { id: baseBooking._id },
    },
    noShowRes
  );

  assert.equal(noShowRes.statusCode, 200);
  assert.deepEqual(noShowRes.body.treatmentRecord, baseBooking.treatmentRecord);
  assert.deepEqual(noShowRes.body.referenceImages, baseBooking.referenceImages);
  assert.equal(noShowRes.body.paymentTransactionIds, undefined);

  const lateCancelBooking = createMutableBooking({
    status: "accepted",
    bookingDate: "2020-01-15",
    ...privateFields(),
  });

  Booking.findById = async () => lateCancelBooking;
  Booking.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(lateCancelBooking._id)) return null;
    if (String(query.barberId) !== String(barberId)) return null;
    if (query.status !== lateCancelBooking.status) return null;

    Object.assign(lateCancelBooking, update.$set || {});
    return lateCancelBooking;
  };

  const lateCancelRes = createResponse();
  await markLateCancel(
    {
      user: barber,
      params: { id: lateCancelBooking._id },
    },
    lateCancelRes
  );

  assert.equal(lateCancelRes.statusCode, 200);
  assert.deepEqual(lateCancelRes.body.treatmentRecord, lateCancelBooking.treatmentRecord);
  assert.deepEqual(lateCancelRes.body.referenceImages, lateCancelBooking.referenceImages);
  assert.equal(lateCancelRes.body.paymentTransactionIds, undefined);
});
