export const canAccessPlatform = (user) =>
  user?.canAccessPlatform === true;

const knownPlatformCapabilities = new Set([
  "billing.read",
  "billing.manage",
  "audit.read",
]);

export const hasPlatformCapability = (user, capability) => {
  if (!knownPlatformCapabilities.has(capability)) return false;

  if (Array.isArray(user?.platformCapabilities)) {
    return user.platformCapabilities.includes(capability);
  }

  return canAccessPlatform(user);
};
