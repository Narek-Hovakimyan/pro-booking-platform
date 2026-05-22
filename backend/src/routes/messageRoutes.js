import express from "express";
import {
  createMessage,
  getConversation,
  getMyMessages,
  markConversationRead,
} from "../controllers/messageController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createMessage);
router.get("/", protect, getMyMessages);
router.put("/read/:otherUserId", protect, markConversationRead);
router.get("/conversation/:otherUserId", protect, getConversation);
router.get("/:otherUserId", protect, getConversation);

export default router;
