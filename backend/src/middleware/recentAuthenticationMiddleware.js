import User from "../models/User.js";
import { hasValidRecentAuthentication } from "../services/auth/recentAuthenticationService.js";

let dependencies = {
  findUserById: (id) =>
    User.findById(id).select("+authVersion +recentAuthAt +recentAuthVersion"),
  now: () => Date.now(),
};

export const __setRecentAuthenticationMiddlewareDependencies = (overrides = {}) => {
  dependencies = { ...dependencies, ...overrides };
};

export const __resetRecentAuthenticationMiddlewareDependencies = () => {
  dependencies = {
    findUserById: (id) =>
      User.findById(id).select("+authVersion +recentAuthAt +recentAuthVersion"),
    now: () => Date.now(),
  };
};

const recentAuthRequired = (res) =>
  res.status(403).json({
    code: "RECENT_AUTH_REQUIRED",
    message: "Recent authentication is required",
  });

export const requireRecentAuthentication = async (req, res, next) => {
  if (!req.user?._id) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    const user = await dependencies.findUserById(req.user._id);
    if (!user || !hasValidRecentAuthentication(user, { now: dependencies.now() })) {
      return recentAuthRequired(res);
    }
  } catch {
    return recentAuthRequired(res);
  }

  return next();
};
