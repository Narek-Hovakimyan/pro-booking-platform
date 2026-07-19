import express from "express";
import {
  createMessage,
  getConversation,
  getMyMessages,
  markConversationRead,
} from "../controllers/messaging/messageController.js";
import { protect } from "../middleware/authMiddleware.js";
import { messageLimiter } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/", protect, messageLimiter, createMessage);
router.get("/", protect, getMyMessages);
router.put("/read/:otherUserId", protect, markConversationRead);
router.get("/conversation/:otherUserId", protect, getConversation);
router.get("/:otherUserId", protect, getConversation);

export default router;
