import PaymentProviderInterface from "./PaymentProviderInterface.js";

export default class ManualPaymentProvider extends PaymentProviderInterface {
  constructor() {
    super("manual");
    this.providerName = "manual";
  }

  async createCustomer({ user } = {}) {
    if (!user?._id && !user?.id) return null;

    return `manual:${user._id || user.id}`;
  }

  async createSubscription({
    customerId,
    plan,
    seatCount,
    ownerType,
    ownerId,
  } = {}) {
    return {
      provider: this.providerName,
      providerSubscriptionId: null,
      customerId: customerId || null,
      status: "manual_activation_required",
      ownerType,
      ownerId,
      planCode: plan?.code || null,
      seatCount: Number(seatCount || 1),
      requiresManualActivation: true,
      message: "Manual payment activation is required.",
    };
  }

  async cancelSubscription({ providerSubscriptionId } = {}) {
    return {
      provider: this.providerName,
      providerSubscriptionId: providerSubscriptionId || null,
      cancelled: false,
      requiresManualAction: true,
      message: "Manual subscription cancellation requires manual processing.",
    };
  }

  async getSubscriptionStatus() {
    return "manual";
  }

  async createPaymentIntent({ amount, currency, metadata } = {}) {
    return {
      provider: this.providerName,
      providerPaymentId: null,
      checkoutUrl: null,
      status: "pending",
      requiresManualActivation: true,
      message: "Manual payment activation is required.",
      amount,
      currency,
      metadata: metadata || {},
    };
  }

  async getPaymentStatus() {
    return "pending";
  }

  async verifyWebhookSignature() {
    const error = new Error("Manual provider does not accept webhook payments");
    error.code = "WEBHOOK_NOT_SUPPORTED";
    error.statusCode = 400;
    throw error;
  }

  async parseWebhookEvent() {
    const error = new Error("Manual provider does not support webhooks");
    error.code = "WEBHOOK_NOT_SUPPORTED";
    error.statusCode = 400;
    throw error;
  }
}
