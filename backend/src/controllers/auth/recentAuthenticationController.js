import bcrypt from "bcrypt";
import User from "../../models/User.js";
import { verifyGoogleIdToken } from "../../services/auth/googleAuthService.js";
import { recordRecentAuthentication } from "../../services/auth/recentAuthenticationService.js";

const RECENT_AUTHENTICATION_FAILED = "Recent authentication failed";

let dependencies = {
  comparePassword: bcrypt.compare,
  findUserById: (id) =>
    User.findById(id).select(
      "+password +googleId +authVersion +recentAuthAt +recentAuthVersion"
    ),
  now: () => new Date(),
  recordRecentAuthentication,
  verifyGoogleIdToken,
};

export const __setRecentAuthenticationControllerDependencies = (overrides = {}) => {
  dependencies = { ...dependencies, ...overrides };
};

export const __resetRecentAuthenticationControllerDependencies = () => {
  dependencies = {
    comparePassword: bcrypt.compare,
    findUserById: (id) =>
      User.findById(id).select(
        "+password +googleId +authVersion +recentAuthAt +recentAuthVersion"
      ),
    now: () => new Date(),
    recordRecentAuthentication,
    verifyGoogleIdToken,
  };
};

const failed = (res) => res.status(403).json({ message: RECENT_AUTHENTICATION_FAILED });

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const accountSupportsPassword = (user) =>
  Array.isArray(user?.authProviders) && user.authProviders.includes("password");

const isGoogleOnlyAccount = (user) =>
  Array.isArray(user?.authProviders) &&
  user.authProviders.includes("google") &&
  !user.authProviders.includes("password");

export const confirmRecentAuthentication = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || !req.user?._id) {
      return failed(res);
    }

    const user = await dependencies.findUserById(req.user._id);
    if (!user) return failed(res);

    if (accountSupportsPassword(user)) {
      if (!isNonEmptyString(req.body.currentPassword) || !user.password) return failed(res);
      const passwordMatches = await dependencies.comparePassword(
        req.body.currentPassword,
        user.password
      );
      if (!passwordMatches) return failed(res);
    } else if (isGoogleOnlyAccount(user)) {
      if (!isNonEmptyString(req.body.googleCredential) || !isNonEmptyString(user.googleId)) {
        return failed(res);
      }
      const googlePayload = await dependencies.verifyGoogleIdToken(req.body.googleCredential);
      if (googlePayload?.googleId !== user.googleId) return failed(res);
    } else {
      return failed(res);
    }

    const recorded = await dependencies.recordRecentAuthentication(user, {
      now: dependencies.now(),
    });
    if (!recorded) return failed(res);

    return res.status(204).end();
  } catch {
    return failed(res);
  }
};
