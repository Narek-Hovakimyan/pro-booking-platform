import DisabledPaymentProvider from "./DisabledPaymentProvider.js";
import ManualPaymentProvider from "./ManualPaymentProvider.js";
import MockPaymentProvider from "./MockPaymentProvider.js";

const providers = {
  disabled: DisabledPaymentProvider,
  manual: ManualPaymentProvider,
  mock: MockPaymentProvider,
  test: MockPaymentProvider,
};

export const getConfiguredPaymentProviderName = () =>
  String(process.env.PAYMENT_PROVIDER || "manual").toLowerCase();

export const getPaymentProvider = (providerName = getConfiguredPaymentProviderName()) => {
  const normalizedProviderName = String(
    providerName || getConfiguredPaymentProviderName()
  ).toLowerCase();

  if (
    process.env.NODE_ENV === "production" &&
    ["mock", "test"].includes(normalizedProviderName)
  ) {
    const error = new Error(
      `${normalizedProviderName} payment provider is disabled in production`
    );
    error.code = "PAYMENT_PROVIDER_DISABLED_IN_PRODUCTION";
    error.statusCode = 403;
    throw error;
  }

  const Provider = providers[normalizedProviderName];

  if (!Provider) {
    const error = new Error(
      `Unsupported payment provider: ${normalizedProviderName}`
    );
    error.code = "UNSUPPORTED_PAYMENT_PROVIDER";
    error.statusCode = 400;
    throw error;
  }

  return new Provider(normalizedProviderName);
};
