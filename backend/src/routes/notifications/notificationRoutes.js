import express from "express";
import {
  deleteAllNotificationsForUser,
  deleteNotification,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../controllers/notifications/notificationController.js";
import { protect } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMyNotifications);
router.put("/read", protect, markAllNotificationsRead);
router.put("/:id/read", protect, markNotificationRead);
router.delete("/user/all", protect, deleteAllNotificationsForUser);
router.delete("/:id", protect, deleteNotification);

export default router;
