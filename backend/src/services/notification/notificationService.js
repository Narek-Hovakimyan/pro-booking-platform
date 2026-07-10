import Notification from "../models/Notification.js";
import { getIO } from "../socket.js";

let getIOForNotifications = getIO;

export const createNotification = async ({ userId, type, message, data }) => {
  const payload = { userId, type, message };

  if (data && typeof data === "object") {
    payload.data = data;
  }

  const notification = await Notification.create(payload);
  const io = getIOForNotifications();

  if (io) {
    io.to(`user:${userId}`).emit("notification", notification);
  }

  return notification;
};

export const __notificationServiceTestHooks = {
  setGetIO(nextGetIO) {
    getIOForNotifications = nextGetIO || getIO;
  },
  resetGetIO() {
    getIOForNotifications = getIO;
  },
};
