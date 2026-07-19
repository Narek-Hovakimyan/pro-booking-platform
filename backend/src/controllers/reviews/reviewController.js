import Booking from "../../models/Booking.js";
import Review from "../../models/Review.js";
import { createCrudController } from "../crudController.js";
import { sendControllerError } from "../../utils/controllerError.js";

export const reviewController = createCrudController(Review, "Review");

const serializeReply = (reply) => {
  if (!reply || !reply.message) return null;
  return {
    message: reply.message,
    repliedBy: reply.repliedBy ? String(reply.repliedBy) : null,
    updatedAt: reply.updatedAt || null,
  };
};

const serializeReview = (review) => {
  const plainReview = review.toObject ? review.toObject() : review;
  const client = plainReview.clientId;

  return {
    ...plainReview,
    id: String(plainReview._id),
    barberId: String(plainReview.barberId),
    clientId: client?._id ? String(client._id) : String(client),
    clientName: client?.name || "Client",
    isVerified: plainReview.isVerified !== false,
    reply: serializeReply(plainReview.reply),
  };
};

export const getReviewsByBarber = async (req, res) => {
  try {
    const reviews = await Review.find({ barberId: req.params.barberId })
      .populate("clientId", "name")
      .sort({ createdAt: -1 });

    return res.json(reviews.map(serializeReview));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch reviews");
  }
};

export const createReview = async (req, res) => {
  try {
    const { barberId, bookingId, rating, comment = "" } = req.body;

    if (!barberId || !bookingId || rating === undefined) {
      return res.status(400).json({
        message: "barberId, bookingId, and rating are required",
      });
    }

    if (
      typeof rating !== "number" ||
      !Number.isFinite(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        message: "Rating must be a number from 1 to 5",
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        message: "Review is allowed only for completed bookings",
      });
    }

    if (String(booking.barberId) !== String(barberId)) {
      return res.status(400).json({
        message: "Review barber must match the completed booking",
      });
    }

    if (String(booking.clientId) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can review only your own booking",
      });
    }

    const existingReview = await Review.findOne({ bookingId });

    if (existingReview) {
      return res.status(400).json({
        message: "This booking has already been reviewed",
      });
    }

    const review = await Review.create({
      barberId,
      bookingId,
      rating,
      comment,
      isVerified: true,
      clientId: req.user._id,
    });

    booking.reviewed = true;
    await booking.save();

    const populatedReview = await review.populate("clientId", "name");

    return res.status(201).json(serializeReview(populatedReview));
  } catch (error) {
    return sendControllerError(res, error, "Could not create review", {
      duplicateKeyMessage: "This booking has already been reviewed",
      duplicateKeyStatus: 400,
    });
  }
};

export const addReplyToReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Reply message is required",
      });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Only the barber who owns the reviewed barberId can reply
    if (String(review.barberId) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only reply to reviews for your own profile",
      });
    }

    review.reply = {
      message: message.trim(),
      repliedBy: req.user._id,
      updatedAt: new Date(),
    };

    await review.save();

    const populatedReview = await review.populate("clientId", "name");

    return res.json(serializeReview(populatedReview));
  } catch (error) {
    return sendControllerError(res, error, "Could not add reply");
  }
};

export const deleteReplyFromReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Only the barber who owns the reviewed barberId can delete reply
    if (String(review.barberId) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only delete replies from reviews for your own profile",
      });
    }

    review.reply = {
      message: "",
      repliedBy: null,
      updatedAt: null,
    };

    await review.save();

    const populatedReview = await review.populate("clientId", "name");

    return res.json(serializeReview(populatedReview));
  } catch (error) {
    return sendControllerError(res, error, "Could not delete reply");
  }
};
