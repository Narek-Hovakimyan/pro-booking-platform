import Notification from "../../models/Notification.js";
import { createNotification } from "../../services/notification/notificationService.js";
import { sendControllerError } from "../../utils/controllerError.js";

export { createNotification };

export const getMyNotifications = async (req, res) => {
  try {
    const DEFAULT_LIMIT = 100;
    const MAX_LIMIT = 200;
    const query = req.query || {};
    const rawLimit = parseInt(query.limit, 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;

    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json(notifications);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch notifications");
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true },
      { returnDocument: "after" }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.json(notification);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not mark notification as read",
    });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true }
    );

    return res.json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not mark notifications as read",
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.json({ message: "Notification deleted" });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not delete notification",
    });
  }
};

export const deleteAllNotificationsForUser = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ userId: req.user.id });

    return res.json({ deletedCount: result.deletedCount });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not clear notifications",
    });
  }
};
