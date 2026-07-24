import express from "express";
import { handlePaymentWebhook } from "../../controllers/billing/paymentController.js";
import { webhookFailureLimiter } from "../../middleware/rateLimitMiddleware.js";

const router = express.Router();

router.post("/webhook", webhookFailureLimiter, handlePaymentWebhook);

export default router;
