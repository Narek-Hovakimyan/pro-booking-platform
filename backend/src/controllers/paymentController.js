import { processPaymentWebhook } from "../services/payment/paymentAttemptService.js";

export const handlePaymentWebhook = async (req, res) => {
  try {
    const result = await processPaymentWebhook({
      rawBody: req.body,
      headers: req.headers,
    });

    return res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      code: error.code,
      message: error.message || "Could not process payment webhook",
    });
  }
};
