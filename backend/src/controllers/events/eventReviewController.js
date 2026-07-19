import Event from "../../models/Event.js";
import EventRegistration from "../../models/EventRegistration.js";
import EventReview from "../../models/EventReview.js";
import { getEventDateTime } from "../../utils/eventUtils.js";
import { sendControllerError } from "../../utils/controllerError.js";

const serializeEventReview = (review) => {
  const plainReview = review.toObject ? review.toObject() : review;
  const user = plainReview.userId;

  return {
    ...plainReview,
    id: String(plainReview._id),
    eventId: String(plainReview.eventId),
    registrationId: String(plainReview.registrationId),
    userId: user?._id ? String(user._id) : String(user),
    userName: user?.name || "User",
    userAvatarUrl: user?.avatarUrl || "",
    isVerified: plainReview.isVerified !== false,
  };
};

export const getEventReviews = async (req, res) => {
  try {
    const reviews = await EventReview.find({ eventId: req.params.id })
      .populate("userId", "name avatarUrl")
      .sort({ createdAt: -1 });

    return res.json(reviews.map(serializeEventReview));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch event reviews");
  }
};

export const createEventReview = async (req, res) => {
  try {
    const { registrationId, rating, comment = "" } = req.body;

    if (!registrationId || !rating || !comment.trim()) {
      return res.status(400).json({
        message: "registrationId, rating, and comment are required",
      });
    }

    const [event, registration] = await Promise.all([
      Event.findById(req.params.id),
      EventRegistration.findById(registrationId),
    ]);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (!registration || String(registration.eventId) !== String(event._id)) {
      return res.status(404).json({ message: "Registration not found" });
    }

    const registrationUserId = registration.userId || registration.barberId;

    if (String(registrationUserId) !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can review only your own event registration",
      });
    }

    if (registration.status !== "approved") {
      return res.status(400).json({
        message: "Only approved event registrations can be reviewed",
      });
    }

    if (!registration.attended) {
      return res.status(400).json({
        message: "Event review requires verified attendance",
      });
    }

    const eventDateTime = getEventDateTime(event);
    if (!eventDateTime || eventDateTime > new Date()) {
      return res.status(400).json({
        message: "You can review an event only after it has finished",
      });
    }

    const existingReview = await EventReview.findOne({ registrationId });
    if (existingReview) {
      return res.status(400).json({
        message: "This event registration has already been reviewed",
      });
    }

    const review = await EventReview.create({
      eventId: event._id,
      userId: req.user._id,
      registrationId,
      rating,
      comment: comment.trim(),
      isVerified: true,
    });

    const populatedReview = await review.populate("userId", "name avatarUrl");

    return res.status(201).json(serializeEventReview(populatedReview));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "This event registration has already been reviewed",
      });
    }

    return res.status(400).json({
      message: error.message || "Could not create event review",
    });
  }
};
