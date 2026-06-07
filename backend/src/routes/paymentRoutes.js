import express from "express";
import { handlePaymentWebhook } from "../controllers/paymentController.js";
import { webhookLimiter } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/webhook", webhookLimiter, handlePaymentWebhook);

export default router;
