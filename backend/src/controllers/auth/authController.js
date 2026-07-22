import bcrypt from "bcrypt";
import crypto from "node:crypto";
import User, { MAX_PHONE_LENGTH } from "../../models/User.js";
import { sendPasswordResetEmail } from "../../services/auth/emailService.js";
import { verifyGoogleIdToken } from "../../services/auth/googleAuthService.js";
import {
  issueAuthSession,
} from "../../services/auth/authSessionIssuanceService.js";
import { createTrialSubscription } from "../../services/subscriptionService.js";
import { isValidEmail, normalizeEmail } from "../../utils/emailVerification.js";
import { createInitialSpecialistOnboardingState } from "../../utils/specialistOnboardingState.js";
import { getLogger, safeErrorSerializer } from "../../config/logger.js";

const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

let dependencies = { issueAuthSession };

export function __setAuthControllerDependencies(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function __resetAuthControllerDependencies() {
  dependencies = { issueAuthSession };
}

const getAuthLogger = () => getLogger().child({ component: "auth" });

const logAuthError = (event, error, metadata = {}) => {
  getAuthLogger().error(
    { event, err: safeErrorSerializer(error), ...metadata },
    "Authentication operation failed"
  );
};

const getPasswordResetClientUrl = () => {
  const [clientUrl] = String(process.env.CLIENT_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (clientUrl) {
    return clientUrl.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return "";
  }

  return "http://localhost:5173";
};

const addAuthProvider = (user, provider) => {
  const providers = Array.isArray(user.authProviders) ? user.authProviders : [];

  if (!providers.includes(provider)) {
    user.authProviders = [...providers, provider];
    return true;
  }

  return false;
};

const applyGoogleLink = (user, googlePayload) => {
  let changed = false;

  if (!user.googleId) {
    user.googleId = googlePayload.googleId;
    changed = true;
  }

  if (addAuthProvider(user, "google")) {
    changed = true;
  }

  if (
    user.emailVerified !== true &&
    normalizeEmail(user.email) === googlePayload.email
  ) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    changed = true;
  }

  if (!user.avatarUrl && googlePayload.picture) {
    user.avatarUrl = googlePayload.picture;
    changed = true;
  }

  return changed;
};

const getGoogleDisplayName = ({ name, email }) => {
  const fallback = email.split("@")[0] || "Google User";
  return name || fallback;
};

export const registerUser = async (req, res) => {
  try {
    const { name, password, role = "client" } = req.body;
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const email = normalizeEmail(req.body.email);

    if (!name || !phone || !email || !password) {
      return res.status(400).json({ message: "Name, phone, email, and password are required" });
    }

    if (phone.length > MAX_PHONE_LENGTH) {
      return res.status(400).json({
        message: `Phone must be ${MAX_PHONE_LENGTH} characters or less`,
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    if (!["client", "barber"].includes(role)) {
      return res.status(400).json({ message: "Role must be client or barber" });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    const existingEmailUser = await User.findOne({ email });

    if (existingEmailUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
      role,
      ...(role === "barber"
        ? { specialistOnboarding: createInitialSpecialistOnboardingState() }
        : {}),
    });

    if (role === "barber") {
      try {
        await createTrialSubscription({
          ownerType: "barber",
          ownerId: user._id,
          payerId: user._id,
          seatCount: 1,
        });
      } catch (subscriptionError) {
        await User.findByIdAndDelete(user._id).catch(() => {});
        logAuthError("auth.registration_failed", subscriptionError, {
          operation: "trial_subscription",
          userId: String(user._id),
        });
        return res.status(500).json({ message: "Registration failed" });
      }
    }

    const authResponse = await dependencies.issueAuthSession({ req, res, user });

    return res.status(201).json(authResponse);
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.email || error.keyValue?.email) {
        return res.status(400).json({ message: "Email already in use" });
      }

      return res.status(400).json({ message: "Phone already exists" });
    }

    logAuthError("auth.registration_failed", error);
    return res.status(500).json({ message: "Registration failed" });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { password } = req.body;
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password are required" });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    if (!user.password) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const authResponse = await dependencies.issueAuthSession({ req, res, user });

    return res.json(authResponse);
  } catch (error) {
    logAuthError("auth.login_failed", error);
    return res.status(500).json({ message: "Login failed" });
  }
};

export const googleAuth = async (req, res) => {
  try {
    const credential = req.body?.credential || req.body?.idToken;

    if (!credential || typeof credential !== "string") {
      return res.status(400).json({ message: "Google credential is required" });
    }

    let googlePayload;

    try {
      googlePayload = await verifyGoogleIdToken(credential);
    } catch {
      return res.status(401).json({ message: "Invalid Google credential" });
    }

    const existingGoogleUser = await User.findOne({
      googleId: googlePayload.googleId,
    }).select("+googleId");

    if (existingGoogleUser) {
      if (applyGoogleLink(existingGoogleUser, googlePayload)) {
        await existingGoogleUser.save();
      }

      const authResponse = await dependencies.issueAuthSession({
        req,
        res,
        user: existingGoogleUser,
      });
      return res.json(authResponse);
    }

    const existingEmailUser = await User.findOne({
      email: googlePayload.email,
    }).select("+googleId");

    if (existingEmailUser) {
      if (
        existingEmailUser.googleId &&
        existingEmailUser.googleId !== googlePayload.googleId
      ) {
        return res.status(409).json({ message: "Google account conflict" });
      }

      if (applyGoogleLink(existingEmailUser, googlePayload)) {
        await existingEmailUser.save();
      }

      const authResponse = await dependencies.issueAuthSession({
        req,
        res,
        user: existingEmailUser,
      });
      return res.json(authResponse);
    }

    const { role } = req.body || {};
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    const missingFields = [];

    if (!role) missingFields.push("role");
    if (!phone) missingFields.push("phone");

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Additional information required",
        requiresProfileCompletion: true,
        fields: missingFields,
      });
    }

    if (!["client", "barber"].includes(role)) {
      return res.status(400).json({ message: "Role must be client or barber" });
    }

    if (phone.length > MAX_PHONE_LENGTH) {
      return res.status(400).json({
        message: `Phone must be ${MAX_PHONE_LENGTH} characters or less`,
      });
    }

    const existingPhoneUser = await User.findOne({ phone });

    if (existingPhoneUser) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    const user = await User.create({
      name: getGoogleDisplayName(googlePayload),
      phone,
      email: googlePayload.email,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      googleId: googlePayload.googleId,
      authProviders: ["google"],
      role,
      avatarUrl: googlePayload.picture || "",
      ...(role === "barber"
        ? { specialistOnboarding: createInitialSpecialistOnboardingState() }
        : {}),
    });

    if (role === "barber") {
      try {
        await createTrialSubscription({
          ownerType: "barber",
          ownerId: user._id,
          payerId: user._id,
          seatCount: 1,
        });
      } catch (subscriptionError) {
        await User.findByIdAndDelete(user._id).catch(() => {});
        logAuthError("auth.registration_failed", subscriptionError, {
          operation: "google_trial_subscription",
          userId: String(user._id),
        });
        return res.status(500).json({ message: "Google registration failed" });
      }
    }

    const authResponse = await dependencies.issueAuthSession({ req, res, user });
    return res.status(201).json(authResponse);
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.googleId || error.keyValue?.googleId) {
        return res.status(409).json({ message: "Google account conflict" });
      }

      if (error.keyPattern?.email || error.keyValue?.email) {
        return res.status(400).json({ message: "Email already in use" });
      }

      return res.status(400).json({ message: "Phone already exists" });
    }

    logAuthError("auth.registration_failed", error, { operation: "google_auth" });
    return res.status(500).json({ message: "Google authentication failed" });
  }
};

/**
 * POST /api/auth/forgot-password
 * Accepts phone. Returns generic response always.
 * Stores SHA-256 hashed reset token with 15 min expiry.
 * In production, sends email when configured. Development never exposes reset URLs in logs.
 */
export const forgotPassword = async (req, res) => {
  try {
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";

    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    // Always return generic success to avoid user enumeration
    const genericMessage = "If an account exists, password reset instructions have been sent.";

    // Find user without exposing existence
    const user = await User.findOne({ phone }).select("+resetPasswordTokenHash +resetPasswordExpires +resetPasswordSentAt");
    getAuthLogger().info(
      { event: "auth.password_reset_requested" },
      "Password reset request processed"
    );
    if (!user) {
      return res.json({ message: genericMessage });
    }

    // Generate random token and store SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
    user.resetPasswordSentAt = new Date();
    await user.save();

    const resetClientUrl = getPasswordResetClientUrl();
    const resetUrl = resetClientUrl ? `${resetClientUrl}/reset-password?token=${rawToken}` : "";

    if (user.email && resetUrl) {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        appName: "HairBook",
      });
    }

    return res.json({ message: genericMessage });
  } catch (error) {
    logAuthError("auth.password_reset_delivery_failed", error);
    // Always return generic on error too
    return res.json({
      message: "If an account exists, password reset instructions have been sent.",
    });
  }
};

/**
 * POST /api/auth/reset-password
 * Accepts token + password. Validates hash + expiry, updates password.
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const resetToken = typeof token === "string" ? token.trim() : "";

    if (!resetToken || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    // Hash incoming token and find matching user
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordTokenHash +resetPasswordExpires +resetPasswordSentAt");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetPasswordTokenHash = "";
    user.resetPasswordExpires = null;
    user.resetPasswordSentAt = null;
    await user.save();

    return res.json({ message: "Password has been reset successfully." });
  } catch (error) {
    logAuthError("auth.password_reset_failed", error);
    return res.status(500).json({ message: "Could not reset password" });
  }
};
