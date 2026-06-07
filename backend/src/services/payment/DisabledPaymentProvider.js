import PaymentProviderInterface from "./PaymentProviderInterface.js";

export default class DisabledPaymentProvider extends PaymentProviderInterface {
  constructor() {
    super("disabled");
    this.providerName = "disabled";
  }

  async createPaymentIntent({ amount, currency, metadata } = {}) {
    return {
      provider: this.providerName,
      providerPaymentId: null,
      checkoutUrl: null,
      status: "pending",
      paymentDisabled: true,
      message: "Online payment is not enabled yet.",
      amount,
      currency,
      metadata: metadata || {},
    };
  }

  async getPaymentStatus() {
    return "pending";
  }

  async verifyWebhookSignature() {
    const error = new Error("Payments are disabled");
    error.code = "PAYMENTS_DISABLED";
    error.statusCode = 400;
    throw error;
  }

  async parseWebhookEvent() {
    const error = new Error("Payments are disabled");
    error.code = "PAYMENTS_DISABLED";
    error.statusCode = 400;
    throw error;
  }
}
