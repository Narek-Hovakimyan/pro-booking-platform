import Message from "../models/Message.js";
import { createNotification } from "./notificationController.js";
import { getIO } from "../socket.js";

const userFields = "name phone role avatarUrl";

const parseLimit = (queryLimit) => {
  const limit = Number(queryLimit);
  if (!Number.isFinite(limit) || limit < 1) return 100;
  return Math.min(limit, 200);
};

export const getMyMessages = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const limit = parseLimit(req.query.limit);

    const messages = await Message.find({
      $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
    })
      .populate("senderId", userFields)
      .populate("receiverId", userFields)
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json([...messages].reverse());
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch messages",
    });
  }
};

export const getConversation = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const currentUserId = req.user.id;
    const limit = parseLimit(req.query.limit);

    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    })
      .populate("senderId", userFields)
      .populate("receiverId", userFields)
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json([...messages].reverse());
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch conversation",
    });
  }
};

export const markConversationRead = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const currentUserId = req.user.id;

    const result = await Message.updateMany(
      {
        senderId: otherUserId,
        receiverId: currentUserId,
        isRead: false,
      },
      { isRead: true }
    );

    return res.json({
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not mark messages as read",
    });
  }
};

export const createMessage = async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    const senderId = req.user.id;

    if (!receiverId || !text?.trim()) {
      return res.status(400).json({ message: "receiverId and text are required" });
    }

    if (String(receiverId) === String(senderId)) {
      return res.status(400).json({ message: "Cannot send message to yourself" });
    }

    const message = await Message.create({
      senderId,
      receiverId,
      text: text.trim(),
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", userFields)
      .populate("receiverId", userFields);
    await createNotification({
      userId: receiverId,
      type: "message_received",
      message: `${populatedMessage.senderId.name || "Someone"} sent you a message`,
    });

    const io = getIO();
    const rooms = new Set([
      `user:${String(populatedMessage.senderId._id)}`,
      `user:${String(populatedMessage.receiverId._id)}`,
    ]);

    rooms.forEach((room) => {
      io?.to(room).emit("newMessage", populatedMessage);
    });

    return res.status(201).json(populatedMessage);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not send message",
    });
  }
};
