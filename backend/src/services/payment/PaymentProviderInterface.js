export default class PaymentProviderInterface {
  constructor(providerName) {
    this.providerName = providerName;
  }

  async createCustomer() {
    throw new Error("Not implemented");
  }

  async createSubscription() {
    throw new Error("Not implemented");
  }

  async cancelSubscription() {
    throw new Error("Not implemented");
  }

  async getSubscriptionStatus() {
    throw new Error("Not implemented");
  }

  async createPaymentIntent() {
    throw new Error("Not implemented");
  }

  async handleWebhook() {
    throw new Error("Not implemented");
  }
}
