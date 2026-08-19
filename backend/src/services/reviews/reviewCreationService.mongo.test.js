import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import Notification from "../../models/Notification.js";
import Review from "../../models/Review.js";
import Salon from "../../models/Salon.js";
import SalonReview from "../../models/SalonReview.js";
import {
  createBarberReview,
  createSalonReview,
} from "./reviewCreationService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true";
const originalBookingSave = Booking.prototype.save;
const originalNotificationCreate = Notification.create;

const connectIsolatedDb = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI");
  const isolated = new URL(uri);
  const database = isolated.pathname.replace(/^\/+|\/+$/g, "") || "hairbook_ci_test";
  isolated.pathname = `/${database}_review_creation_${process.pid}`;
  await mongoose.connect(isolated.toString(), { serverSelectionTimeoutMS: 5000 });
};

afterEach(async () => {
  Booking.prototype.save = originalBookingSave;
  Notification.create = originalNotificationCreate;
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
});

const makeBooking = ({ barberId, clientId, salonId }) =>
  Booking.create({
    barberId,
    clientId,
    salonId,
    serviceId: new mongoose.Types.ObjectId(),
    dayKey: "2026-12-15",
    bookingDate: "2026-12-15",
    time: "10:00",
    duration: 30,
    price: 100,
    status: "completed",
  });

const prepareDatabase = async () => {
  await connectIsolatedDb();
  await Promise.all([
    Booking.deleteMany({}),
    Notification.deleteMany({}),
    Review.deleteMany({}),
    Salon.deleteMany({}),
    SalonReview.deleteMany({}),
  ]);
  await Promise.all([
    Review.createIndexes(),
    SalonReview.createIndexes(),
    Notification.createIndexes(),
  ]);
};

const createReviewActors = async () => {
  const barberId = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const salonId = new mongoose.Types.ObjectId();
  await Salon.create({ _id: salonId, name: "Salon", ownerId: barberId });
  return { barberId, clientId, salonId };
};

test("real Mongo barber review commits review and booking flag", { skip: !enabled }, async () => {
  await prepareDatabase();
  const { barberId, clientId, salonId } = await createReviewActors();
  const booking = await makeBooking({ barberId, clientId, salonId });

  await createBarberReview({
    barberId,
    bookingId: booking._id,
    clientId,
    comment: "Great",
    rating: 5,
  });

  assert.equal((await Review.countDocuments({ bookingId: booking._id })), 1);
  assert.equal((await Booking.findById(booking._id)).reviewed, true);
});

test("real Mongo concurrent duplicate barber reviews create one canonical review", { skip: !enabled }, async () => {
  await prepareDatabase();
  const { barberId, clientId, salonId } = await createReviewActors();
  const booking = await makeBooking({ barberId, clientId, salonId });

  const results = await Promise.allSettled([
    createBarberReview({ barberId, bookingId: booking._id, clientId, comment: "A", rating: 5 }),
    createBarberReview({ barberId, bookingId: booking._id, clientId, comment: "B", rating: 4 }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await Review.countDocuments({ bookingId: booking._id })), 1);
});

test("real Mongo barber booking-flag failure rolls back and retry succeeds", { skip: !enabled }, async () => {
  await prepareDatabase();
  const { barberId, clientId, salonId } = await createReviewActors();
  const booking = await makeBooking({ barberId, clientId, salonId });

  Booking.prototype.save = async function saveWithFailure(...args) {
    if (String(this._id) === String(booking._id)) {
      throw new Error("booking flag failed");
    }
    return originalBookingSave.apply(this, args);
  };
  await assert.rejects(
    createBarberReview({ barberId, bookingId: booking._id, clientId, comment: "Retry", rating: 5 }),
    /booking flag failed/
  );
  Booking.prototype.save = originalBookingSave;
  assert.equal((await Review.countDocuments({ bookingId: booking._id })), 0);
  assert.equal((await Booking.findById(booking._id)).reviewed, false);
  await createBarberReview({ barberId, bookingId: booking._id, clientId, comment: "Retry", rating: 5 });
  assert.equal((await Review.countDocuments({ bookingId: booking._id })), 1);
});

test("real Mongo salon notification failure rolls back and retry succeeds", { skip: !enabled }, async () => {
  await prepareDatabase();
  const { barberId, clientId, salonId } = await createReviewActors();
  const booking = await makeBooking({ barberId, clientId, salonId });
  Notification.create = async () => {
    throw new Error("notification failed");
  };
  await assert.rejects(
    createSalonReview({
      bookingId: booking._id,
      clientId,
      clientName: "Client",
      comment: "Great salon",
      rating: 5,
      salonId,
    }),
    /notification failed/
  );
  Notification.create = originalNotificationCreate;
  assert.equal((await SalonReview.countDocuments({ bookingId: booking._id })), 0);
  await createSalonReview({
    bookingId: booking._id,
    clientId,
    clientName: "Client",
    comment: "Great salon",
    rating: 5,
    salonId,
  });
  assert.equal((await SalonReview.countDocuments({ bookingId: booking._id })), 1);
  assert.equal((await Notification.countDocuments({ type: "salon_review_created" })), 1);
});
