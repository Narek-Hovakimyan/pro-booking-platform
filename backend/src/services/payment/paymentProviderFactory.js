import ManualPaymentProvider from "./ManualPaymentProvider.js";

const providers = {
  manual: ManualPaymentProvider,
};

export const getPaymentProvider = (providerName = "manual") => {
  const normalizedProviderName = String(providerName || "manual").toLowerCase();
  const Provider = providers[normalizedProviderName];

  if (!Provider) {
    const error = new Error(
      `Unsupported payment provider: ${normalizedProviderName}`
    );
    error.code = "UNSUPPORTED_PAYMENT_PROVIDER";
    error.statusCode = 400;
    throw error;
  }

  return new Provider();
};
