import User from "../../models/User.js";
import { normalizeAuthVersion } from "./accessTokenService.js";

export const RECENT_AUTHENTICATION_WINDOW_MS = 10 * 60 * 1000;

const asValidTimestamp = (value) => {
  if (value === null || value === undefined) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const hasValidRecentAuthentication = (user, { now = Date.now() } = {}) => {
  try {
    const authenticatedAt = asValidTimestamp(user?.recentAuthAt);
    const currentTime = asValidTimestamp(now);
    const recordedVersion = normalizeAuthVersion(user?.recentAuthVersion);
    const currentVersion = normalizeAuthVersion(user?.authVersion, { allowMissing: true });

    return (
      authenticatedAt !== null &&
      currentTime !== null &&
      authenticatedAt <= currentTime &&
      currentTime - authenticatedAt < RECENT_AUTHENTICATION_WINDOW_MS &&
      recordedVersion === currentVersion
    );
  } catch {
    return false;
  }
};

export const recordRecentAuthentication = async (
  user,
  { now = new Date(), UserModel = User } = {}
) => {
  const userId = user?._id;
  const authenticatedAt = asValidTimestamp(now);

  if (!userId || authenticatedAt === null) return null;

  let authVersion;
  try {
    authVersion = normalizeAuthVersion(user.authVersion, { allowMissing: true });
  } catch {
    return null;
  }

  const authVersionCondition =
    authVersion === 0
      ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
      : { authVersion };

  return UserModel.findOneAndUpdate(
    { _id: userId, ...authVersionCondition },
    {
      $set: {
        recentAuthAt: new Date(authenticatedAt),
        recentAuthVersion: authVersion,
      },
    },
    { new: true, runValidators: true }
  );
};
