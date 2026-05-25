import { createNotification } from "./notificationController.js";
import { getBookingNotificationData } from "../utils/bookingNotificationData.js";
import {
  markBookingLateCancel,
  markBookingNoShow,
} from "../services/bookingOutcomeService.js";
import {
  emitBookingUpdated,
  notifyWaitlistForReleasedBookingSlot,
} from "../services/bookingSideEffectsService.js";

export const markNoShow = async (req, res) => {
  try {
    const updatedBooking = await markBookingNoShow({
      bookingId: req.params.id,
      requester: req.user,
    });

    // Notify client
    if (updatedBooking.clientId) {
      await createNotification({
        userId: updatedBooking.clientId,
        type: "booking_no_show",
        message: "Your booking was marked as no-show.",
        data: getBookingNotificationData(updatedBooking),
      });
    }

    notifyWaitlistForReleasedBookingSlot(updatedBooking);

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(updatedBooking);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || "Could not mark no-show",
    });
  }
};

export const markLateCancel = async (req, res) => {
  try {
    const updatedBooking = await markBookingLateCancel({
      bookingId: req.params.id,
      requester: req.user,
    });

    // Notify client
    if (updatedBooking.clientId) {
      await createNotification({
        userId: updatedBooking.clientId,
        type: "booking_late_cancelled",
        message: "Your booking was marked as late cancellation.",
        data: getBookingNotificationData(updatedBooking),
      });
    }

    notifyWaitlistForReleasedBookingSlot(updatedBooking);

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(updatedBooking);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || "Could not mark late cancellation",
    });
  }
};
