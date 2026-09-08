export const canAccessPlatform = (user) =>
  user?.canAccessPlatform === true;

export const PLATFORM_CAPABILITIES = Object.freeze({
  BILLING_READ: "billing.read",
  BILLING_MANAGE: "billing.manage",
  AUDIT_READ: "audit.read",
});

const knownPlatformCapabilities = new Set(Object.values(PLATFORM_CAPABILITIES));

export const hasPlatformCapability = (user, capability) => {
  if (!knownPlatformCapabilities.has(capability)) return false;

  if (Array.isArray(user?.platformCapabilities)) {
    return canAccessPlatform(user) && user.platformCapabilities.includes(capability);
  }

  return canAccessPlatform(user);
};

export const canReadPlatformBilling = (user) =>
  hasPlatformCapability(user, PLATFORM_CAPABILITIES.BILLING_READ);

export const canManagePlatformBilling = (user) =>
  hasPlatformCapability(user, PLATFORM_CAPABILITIES.BILLING_MANAGE);
