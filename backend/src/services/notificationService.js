import Notification from "../models/Notification.js";
import { getIO } from "../socket.js";

export const createNotification = async ({ userId, type, message }) => {
  const notification = await Notification.create({ userId, type, message });
  const io = getIO();

  if (io) {
    io.to(`user:${userId}`).emit("notification", notification);
  }

  return notification;
};
