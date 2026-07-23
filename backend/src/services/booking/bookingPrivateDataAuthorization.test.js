import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { resolveReferenceImageRequest } from "./bookingReferenceImageService.js";
import { updateBookingTreatmentRecord } from "./bookingTreatmentRecordService.js";

const originalBookingFindById = Booking.findById;
const originalSalonFindById = Salon.findById;
const originalUserFindById = User.findById;

const bookingId = "64b000000000000000000101";
const salonId = "64b000000000000000000102";
const clientId = "64b000000000000000000103";
const barberId = "64b000000000000000000104";
const ownerId = "64b000000000000000000105";
const imageName = "private-reference.jpg";

afterEach(() => {
  Booking.findById = originalBookingFindById;
  Salon.findById = originalSalonFindById;
  User.findById = originalUserFindById;
});

const createBooking = (overrides = {}) => ({
  _id: bookingId,
  barberId,
  clientId,
  salonId,
  status: "accepted",
  referenceImages: [`uploads/booking-references/${imageName}`],
  saveCalled: false,
  async save() {
    this.saveCalled = true;
    return this;
  },
  ...overrides,
});

const mockBooking = (booking) => {
  Booking.findById = async () => booking;
};

const mockSalonOwner = () => {
  Salon.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: salonId, ownerId, admins: [] }),
    }),
  });
};

const mockBarberMembership = (membership) => {
  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      role: "barber",
      salon: null,
      salonStatus: "none",
      salons: membership ? [{ salon: salonId, status: "approved", ...membership }] : [],
    }),
  });
};

test("salon owner cannot view chair-renter reference images", async () => {
  mockBooking(createBooking());
  mockSalonOwner();
  mockBarberMembership({ relationshipType: "chair_renter" });

  const result = await resolveReferenceImageRequest({
    bookingId,
    imageName,
    user: { _id: ownerId, role: "barber" },
  });

  assert.deepEqual(result, {
    status: 403,
    error: "Not authorized to view these images",
  });
  assert.equal(result.absolutePath, undefined);
});

test("salon owner cannot mutate chair-renter treatment records", async () => {
  const booking = createBooking();
  mockBooking(booking);
  mockSalonOwner();
  mockBarberMembership({ relationshipType: "chair_renter" });

  const result = await updateBookingTreatmentRecord({
    bookingId,
    body: { techniqueNotes: "manager note" },
    user: { _id: ownerId, role: "barber" },
  });

  assert.equal(result.status, 403);
  assert.equal(result.error, "Not authorized to modify treatment record");
  assert.equal(booking.saveCalled, false);
  assert.equal(booking.treatmentRecord, undefined);
});

test("salon owner can access staff booking private data", async () => {
  const booking = createBooking();
  mockBooking(booking);
  mockSalonOwner();
  mockBarberMembership({
    relationshipType: "staff",
    relationshipStatus: "accepted",
  });

  const imageResult = await resolveReferenceImageRequest({
    bookingId,
    imageName,
    user: { _id: ownerId, role: "barber" },
  });
  const treatmentResult = await updateBookingTreatmentRecord({
    bookingId,
    body: { techniqueNotes: "staff booking note" },
    user: { _id: ownerId, role: "barber" },
  });

  assert.equal(imageResult.absolutePath.endsWith(imageName), true);
  assert.equal(treatmentResult.success, true);
  assert.equal(booking.saveCalled, true);
});

test("legacy approved membership resolves as staff for salon owner access", async () => {
  const booking = createBooking();
  mockBooking(booking);
  mockSalonOwner();
  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      role: "barber",
      salon: salonId,
      salonStatus: "approved",
      salons: [],
    }),
  });

  const result = await updateBookingTreatmentRecord({
    bookingId,
    body: { techniqueNotes: "legacy staff note" },
    user: { _id: ownerId, role: "barber" },
  });

  assert.equal(result.success, true);
  assert.equal(booking.saveCalled, true);
});

test("pending staff relationship denies salon owner private-data access", async () => {
  const booking = createBooking();
  mockBooking(booking);
  mockSalonOwner();
  mockBarberMembership({
    relationshipType: "staff",
    relationshipStatus: "pending",
  });

  const imageResult = await resolveReferenceImageRequest({
    bookingId,
    imageName,
    user: { _id: ownerId, role: "barber" },
  });
  const treatmentResult = await updateBookingTreatmentRecord({
    bookingId,
    body: { techniqueNotes: "pending staff note" },
    user: { _id: ownerId, role: "barber" },
  });

  assert.deepEqual(imageResult, {
    status: 403,
    error: "Not authorized to view these images",
  });
  assert.equal(treatmentResult.status, 403);
  assert.equal(treatmentResult.error, "Not authorized to modify treatment record");
  assert.equal(booking.saveCalled, false);
});

test("rejected staff relationship denies salon owner private-data access", async () => {
  const booking = createBooking();
  mockBooking(booking);
  mockSalonOwner();
  mockBarberMembership({
    relationshipType: "staff",
    relationshipStatus: "rejected",
  });

  const imageResult = await resolveReferenceImageRequest({
    bookingId,
    imageName,
    user: { _id: ownerId, role: "barber" },
  });
  const treatmentResult = await updateBookingTreatmentRecord({
    bookingId,
    body: { techniqueNotes: "rejected staff note" },
    user: { _id: ownerId, role: "barber" },
  });

  assert.deepEqual(imageResult, {
    status: 403,
    error: "Not authorized to view these images",
  });
  assert.equal(treatmentResult.status, 403);
  assert.equal(treatmentResult.error, "Not authorized to modify treatment record");
  assert.equal(booking.saveCalled, false);
});

test("unresolved booking barber relationship fails closed without saving", async () => {
  const booking = createBooking();
  mockBooking(booking);
  mockSalonOwner();
  User.findById = () => ({
    select: async () => ({
      _id: barberId,
      role: "barber",
      salon: null,
      salonStatus: "none",
      salons: [],
    }),
  });

  const result = await updateBookingTreatmentRecord({
    bookingId,
    body: { techniqueNotes: "manager note" },
    user: { _id: ownerId, role: "barber" },
  });

  assert.equal(result.status, 403);
  assert.equal(booking.saveCalled, false);
});

test("assigned barber and booking client reference-image access remain valid", async () => {
  mockBooking(createBooking());
  mockSalonOwner();
  mockBarberMembership({ relationshipType: "chair_renter" });

  const barberResult = await resolveReferenceImageRequest({
    bookingId,
    imageName,
    user: { _id: barberId, role: "barber" },
  });
  const clientResult = await resolveReferenceImageRequest({
    bookingId,
    imageName,
    user: { _id: clientId, role: "client" },
  });

  assert.equal(barberResult.absolutePath.endsWith(imageName), true);
  assert.equal(clientResult.absolutePath.endsWith(imageName), true);
});

test("assigned barber treatment mutation remains valid for chair-renter booking", async () => {
  const booking = createBooking();
  mockBooking(booking);
  mockSalonOwner();
  mockBarberMembership({ relationshipType: "chair_renter" });

  const result = await updateBookingTreatmentRecord({
    bookingId,
    body: { techniqueNotes: "assigned barber note" },
    user: { _id: barberId, role: "barber" },
  });

  assert.equal(result.success, true);
  assert.equal(booking.saveCalled, true);
});
