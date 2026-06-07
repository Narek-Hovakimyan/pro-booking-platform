import express from "express";
import { handlePaymentWebhook } from "../controllers/paymentController.js";

const router = express.Router();

router.post("/webhook", handlePaymentWebhook);

export default router;
