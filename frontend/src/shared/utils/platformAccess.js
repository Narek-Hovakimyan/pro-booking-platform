export const canAccessPlatform = (user) =>
  user?.canAccessPlatform === true || user?.platformRole === "superuser";
