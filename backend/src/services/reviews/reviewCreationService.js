import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import Review from "../../models/Review.js";
import Salon from "../../models/Salon.js";
import SalonReview from "../../models/SalonReview.js";
import { createNotification } from "../notification/notificationService.js";

export class ReviewCreationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ReviewCreationError";
    this.statusCode = statusCode;
  }
}

const reviewCreationHooks = {
  startSession: () => mongoose.connection.startSession(),
};

const withReviewCreationTransaction = async (task) => {
  const session = await reviewCreationHooks.startSession();
  let result;
  let afterCommitCallbacks = [];

  try {
    await session.withTransaction(async () => {
      const attemptCallbacks = [];
      result = await task({
        session,
        afterCommit(callback) {
          if (typeof callback === "function") attemptCallbacks.push(callback);
        },
      });
      afterCommitCallbacks = attemptCallbacks;
    });
  } finally {
    await session.endSession().catch(() => {});
  }

  await Promise.allSettled(afterCommitCallbacks.map((callback) => callback()));
  return result;
};

const getSessionOptions = (session) => (session ? { session } : undefined);

const assertCompletedBookingForClient = ({
  booking,
  bookingId,
  clientId,
  completedMessage,
  ownBookingMessage,
}) => {
  if (!booking) {
    throw new ReviewCreationError(404, "Booking not found");
  }

  if (booking.status !== "completed") {
    throw new ReviewCreationError(400, completedMessage);
  }

  if (String(booking.clientId) !== String(clientId)) {
    throw new ReviewCreationError(403, ownBookingMessage);
  }

  return bookingId;
};

export const createBarberReview = async ({
  barberId,
  bookingId,
  clientId,
  comment,
  rating,
}) =>
  withReviewCreationTransaction(async ({ session }) => {
    const booking = await Booking.findById(bookingId, null, getSessionOptions(session));
    assertCompletedBookingForClient({
      booking,
      bookingId,
      clientId,
      completedMessage: "Review is allowed only for completed bookings",
      ownBookingMessage: "You can review only your own booking",
    });

    if (String(booking.barberId) !== String(barberId)) {
      throw new ReviewCreationError(
        400,
        "Review barber must match the completed booking"
      );
    }

    if (await Review.findOne({ bookingId }, null, getSessionOptions(session))) {
      throw new ReviewCreationError(400, "This booking has already been reviewed");
    }

    const [review] = await Review.create(
      [
        {
        barberId,
        bookingId,
        rating,
        comment,
        isVerified: true,
        clientId,
        },
      ],
      getSessionOptions(session)
    );

    booking.reviewed = true;
    await booking.save(getSessionOptions(session));
    return review;
  });

export const createSalonReview = async ({
  bookingId,
  clientId,
  clientName,
  comment,
  rating,
  salonId,
}) =>
  withReviewCreationTransaction(async ({ session, afterCommit }) => {
    const salon = await Salon.findById(
      salonId,
      null,
      getSessionOptions(session)
    );
    const booking = await Booking.findById(
      bookingId,
      null,
      getSessionOptions(session)
    );

    if (!salon) {
      throw new ReviewCreationError(404, "Salon not found");
    }

    assertCompletedBookingForClient({
      booking,
      bookingId,
      clientId,
      completedMessage: "You can only review completed bookings",
      ownBookingMessage: "You can only review your own bookings",
    });

    const bookingSalonId = booking.salonId ? String(booking.salonId) : "";
    if (!bookingSalonId) {
      throw new ReviewCreationError(400, "This booking is not connected to a salon");
    }

    if (bookingSalonId !== String(salonId)) {
      throw new ReviewCreationError(400, "Salon review must match the booking salon");
    }

    if (
      await SalonReview.findOne(
        { bookingId, salonId, clientId },
        null,
        getSessionOptions(session)
      )
    ) {
      throw new ReviewCreationError(
        400,
        "You have already reviewed this salon for this booking"
      );
    }

    const [review] = await SalonReview.create(
      [
        {
        salonId,
        bookingId,
        rating,
        comment,
        isVerified: true,
        clientId,
        },
      ],
      getSessionOptions(session)
    );

    await createNotification({
      userId: salon.ownerId,
      type: "salon_review_created",
      message: `${clientName} left a review for ${salon.name}`,
      session,
      afterCommit,
    });

    return review;
  });

export const __reviewCreationServiceTestHooks = {
  setStartSession(startSession) {
    reviewCreationHooks.startSession =
      startSession || (() => mongoose.connection.startSession());
  },
  resetStartSession() {
    reviewCreationHooks.startSession = () => mongoose.connection.startSession();
  },
};
