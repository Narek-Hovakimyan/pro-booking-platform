import PaymentProviderInterface from "./PaymentProviderInterface.js";

export default class MockPaymentProvider extends PaymentProviderInterface {
  constructor(providerName = "mock") {
    super(providerName);
    this.providerName = providerName;
  }

  async createPaymentIntent({ amount, currency, metadata } = {}) {
    const providerPaymentId = `${this.providerName}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    return {
      provider: this.providerName,
      providerPaymentId,
      checkoutUrl: `/mock-payments/${providerPaymentId}`,
      status: "requires_action",
      message: "Mock checkout created for development testing only.",
      amount,
      currency,
      metadata: metadata || {},
    };
  }

  async getPaymentStatus() {
    return "pending";
  }

  async verifyWebhookSignature(_rawBody, headers = {}) {
    const configuredSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    const providedSecret =
      headers["x-payment-webhook-secret"] || headers["X-Payment-Webhook-Secret"];

    if (configuredSecret && providedSecret !== configuredSecret) {
      const error = new Error("Invalid webhook signature");
      error.code = "INVALID_WEBHOOK_SIGNATURE";
      error.statusCode = 401;
      throw error;
    }

    return true;
  }

  async parseWebhookEvent(rawBody, headers = {}) {
    await this.verifyWebhookSignature(rawBody, headers);

    const bodyText = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : String(rawBody || "{}");
    const event = JSON.parse(bodyText || "{}");

    return {
      id: event.id || event.eventId || null,
      type: event.type,
      providerPaymentId:
        event.providerPaymentId ||
        event.provider_payment_id ||
        event.data?.providerPaymentId ||
        event.data?.provider_payment_id ||
        null,
      status: event.status || event.data?.status || null,
      raw: event,
    };
  }
}
