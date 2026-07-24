import express from "express";
import {
  createMessage,
  getConversation,
  getMyMessages,
  markConversationRead,
} from "../../controllers/messaging/messageController.js";
import { protect } from "../../middleware/authMiddleware.js";
import {
  messageMutationLimiter,
  messageReadLimiter,
} from "../../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/", protect, messageMutationLimiter, createMessage);
router.get("/", protect, messageReadLimiter, getMyMessages);
router.put("/read/:otherUserId", protect, messageReadLimiter, markConversationRead);
router.get("/conversation/:otherUserId", protect, messageReadLimiter, getConversation);
router.get("/:otherUserId", protect, messageReadLimiter, getConversation);

export default router;
