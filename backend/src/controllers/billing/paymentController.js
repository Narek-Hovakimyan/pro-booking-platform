import { processPaymentWebhook } from "../../services/payment/paymentAttemptService.js";
import {
  getControllerErrorStatusCode,
  sendControllerError,
} from "../../utils/controllerError.js";

export const handlePaymentWebhook = async (req, res) => {
  try {
    const result = await processPaymentWebhook({
      rawBody: req.body,
      headers: req.headers,
    });

    return res.json(result);
  } catch (error) {
    const status = getControllerErrorStatusCode(error);
    if (status === 500) {
      return sendControllerError(res, error, "Could not process payment webhook");
    }

    return res.status(status).json({
      code: error.code,
      message: error.message || "Could not process payment webhook",
    });
  }
};
