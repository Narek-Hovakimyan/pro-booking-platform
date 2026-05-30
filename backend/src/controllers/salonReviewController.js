import Booking from "../models/Booking.js";
import Salon from "../models/Salon.js";
import SalonReview from "../models/SalonReview.js";
import { createNotification } from "./notificationController.js";
import { canManageSalonRequest } from "../utils/salonPermissions.js";
import { sendControllerError } from "../utils/controllerError.js";

const serializeReply = (reply) => {
  if (!reply || !reply.message) return null;
  return {
    message: reply.message,
    repliedBy: reply.repliedBy ? String(reply.repliedBy) : null,
    updatedAt: reply.updatedAt || null,
  };
};

const serializeSalonReview = (review) => {
  const plainReview = review.toObject ? review.toObject() : review;
  const client = plainReview.clientId;

  return {
    ...plainReview,
    id: String(plainReview._id),
    salonId: String(plainReview.salonId),
    bookingId: String(plainReview.bookingId),
    clientId: client?._id
      ? {
          _id: client._id,
          id: String(client._id),
          name: client.name || "Client",
          avatarUrl: client.avatarUrl || "",
        }
      : String(client),
    client: client?._id
      ? {
          id: String(client._id),
          name: client.name || "Client",
          avatarUrl: client.avatarUrl || "",
        }
      : undefined,
    clientName: client?.name || "Client",
    clientAvatarUrl: client?.avatarUrl || "",
    isVerified: plainReview.isVerified !== false,
    reply: serializeReply(plainReview.reply),
  };
};

export const getSalonReviewStats = async (salonIds, { latestLimit = 3 } = {}) => {
  const ids = (Array.isArray(salonIds) ? salonIds : [salonIds]).filter(Boolean);

  if (ids.length === 0) return new Map();

  const [stats, latestReviews] = await Promise.all([
    SalonReview.aggregate([
      { $match: { salonId: { $in: ids } } },
      {
        $group: {
          _id: "$salonId",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]),
    SalonReview.find({ salonId: { $in: ids } })
      .populate("clientId", "name avatarUrl")
      .sort({ createdAt: -1 }),
  ]);
  const statsBySalonId = new Map(
    stats.map((item) => [
      String(item._id),
      {
        averageRating: Number(Number(item.averageRating || 0).toFixed(1)),
        totalReviews: item.totalReviews || 0,
        reviewsCount: item.totalReviews || 0,
        latestReviews: [],
      },
    ])
  );

  ids.forEach((id) => {
    const salonId = String(id);

    if (!statsBySalonId.has(salonId)) {
      statsBySalonId.set(salonId, {
        averageRating: 0,
        totalReviews: 0,
        reviewsCount: 0,
        latestReviews: [],
      });
    }
  });

  latestReviews.forEach((review) => {
    const salonId = String(review.salonId);
    const statsForSalon = statsBySalonId.get(salonId);

    if (!statsForSalon) return;
    if (statsForSalon.latestReviews.length >= latestLimit) return;

    statsForSalon.latestReviews.push(serializeSalonReview(review));
  });

  return statsBySalonId;
};

export const checkSalonReview = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const review = await SalonReview.findOne({
      bookingId,
      clientId: req.user._id,
    }).populate("clientId", "name avatarUrl");

    return res.json({
      alreadyReviewed: Boolean(review),
      review: review ? serializeSalonReview(review) : null,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not check salon review",
    });
  }
};

export const getSalonReviews = async (req, res) => {
  try {
    const reviews = await SalonReview.find({ salonId: req.params.salonId })
      .populate("clientId", "name avatarUrl")
      .sort({ createdAt: -1 });
    const serializedReviews = reviews.map(serializeSalonReview);
    const totalReviews = serializedReviews.length;
    const averageRating =
      totalReviews > 0
        ? Number(
            (
              serializedReviews.reduce(
                (sum, review) => sum + Number(review?.rating || 0),
                0
              ) / totalReviews
            ).toFixed(1)
          )
        : 0;

    return res.json({
      reviews: serializedReviews,
      averageRating,
      totalReviews,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch salon reviews",
    });
  }
};

export const getSalonReviewsLegacy = async (req, res) => {
  try {
    const reviews = await SalonReview.find({ salonId: req.params.salonId })
      .populate("clientId", "name avatarUrl")
      .sort({ createdAt: -1 });

    return res.json(reviews.map(serializeSalonReview));
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch salon reviews",
    });
  }
};

export const createSalonReview = async (req, res) => {
  try {
    const { salonId, bookingId } = req.body;
    const rating = Number(req.body.rating);
    const comment = (req.body.comment || "").trim();

    if (!salonId || !bookingId || !Number.isFinite(rating) || !comment) {
      return res.status(400).json({
        message: "salonId, bookingId, rating, and comment are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5",
      });
    }

    if (comment.length > 500) {
      return res.status(400).json({
        message: "Comment must be 500 characters or less",
      });
    }

    const [salon, booking] = await Promise.all([
      Salon.findById(salonId),
      Booking.findById(bookingId),
    ]);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        message: "You can only review completed bookings",
      });
    }

    if (String(booking.clientId) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only review your own bookings",
      });
    }

    const bookingSalonId = booking?.salonId ? String(booking.salonId) : "";

    if (!bookingSalonId) {
      return res.status(400).json({
        message: "This booking is not connected to a salon",
      });
    }

    if (bookingSalonId !== String(salonId)) {
      return res.status(400).json({
        message: "Salon review must match the booking salon",
      });
    }

    const existingReview = await SalonReview.findOne({
      bookingId,
      salonId,
      clientId: req.user._id,
    });

    if (existingReview) {
      return res.status(400).json({
        message: "You have already reviewed this salon for this booking",
      });
    }

    const review = await SalonReview.create({
      salonId,
      bookingId,
      rating,
      comment,
      isVerified: true,
      clientId: req.user._id,
    });

    await createNotification({
      userId: salon.ownerId,
      type: "salon_review_created",
      message: `${req.user.name} left a review for ${salon.name}`,
    });

    const populatedReview = await review.populate("clientId", "name avatarUrl");

    return res.status(201).json(serializeSalonReview(populatedReview));
  } catch (error) {
    return sendControllerError(res, error, "Could not create salon review", {
      duplicateKeyMessage: "You have already reviewed this salon for this booking",
      duplicateKeyStatus: 400,
    });
  }
};

export const addReplyToSalonReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Reply message is required",
      });
    }

    const review = await SalonReview.findById(reviewId).populate(
      "clientId",
      "name avatarUrl"
    );

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Fetch the salon to check permissions
    const salon = await Salon.findById(review.salonId);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    if (!canManageSalonRequest(salon, req.user._id)) {
      return res.status(403).json({
        message: "Only salon owner or admin can reply to salon reviews",
      });
    }

    review.reply = {
      message: message.trim(),
      repliedBy: req.user._id,
      updatedAt: new Date(),
    };

    await review.save();

    return res.json(serializeSalonReview(review));
  } catch (error) {
    return sendControllerError(res, error, "Could not add reply");
  }
};

export const deleteReplyFromSalonReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await SalonReview.findById(reviewId).populate(
      "clientId",
      "name avatarUrl"
    );

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Fetch the salon to check permissions
    const salon = await Salon.findById(review.salonId);

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    if (!canManageSalonRequest(salon, req.user._id)) {
      return res.status(403).json({
        message: "Only salon owner or admin can delete replies from salon reviews",
      });
    }

    review.reply = {
      message: "",
      repliedBy: null,
      updatedAt: null,
    };

    await review.save();

    return res.json(serializeSalonReview(review));
  } catch (error) {
    return sendControllerError(res, error, "Could not delete reply");
  }
};
