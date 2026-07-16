import { sanitizeMediaUrl } from "../utils/mediaUrl.js";
import BarberProfile from "../models/BarberProfile.js";
import Salon from "../models/Salon.js";
import User, { MAX_PHONE_LENGTH } from "../models/User.js";
import {
  createEmailVerificationToken,
  EMAIL_VERIFICATION_EXPIRY_MS,
  EMAIL_VERIFICATION_RESEND_THROTTLE_MS,
  hashEmailVerificationToken,
  isValidEmail,
  normalizeEmail,
} from "../utils/emailVerification.js";
import { sendEmailVerification } from "../services/auth/emailService.js";
import { sendControllerError } from "../utils/controllerError.js";
import { getPaidAccessByBarberIds } from "../services/subscriptionService.js";
import { isPlatformSuperuser } from "../middleware/platformMiddleware.js";
import { serializePublicBarberDirectory } from "../utils/publicBarberSerializer.js";

const getUserData = (user) => ({
  id: user._id,
  name: user.name,
  phone: user.phone,
  email: user.email || "",
  emailVerified: user.emailVerified || false,
  emailVerifiedAt: user.emailVerifiedAt || null,
  city: user.city || "",
  avatarUrl: user.avatarUrl || "",
  role: user.role,
  salon: user.salon || null,
  salonStatus: user.salonStatus || "none",
  salons: user.salons || [],
  profession: user.profession || "barber",
  barberType: user.barberType || "",
  specialty: user.specialty || "unisex",
  workHistory: user.workHistory || [],
  favoriteBarbers: user.favoriteBarbers || [],
  favoriteSalons: user.favoriteSalons || [],
  canAccessPlatform: isPlatformSuperuser(user),
  createdAt: user.createdAt,
});

const normalizePhone = (phone) =>
  typeof phone === "string" ? phone.trim() : "";

const defaultScheduleFallback = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

const getDefaultSchedule = (profile) => ({

  ...defaultScheduleFallback,
  ...(profile?.defaultSchedule || {}),
});

const getUploadedAvatarPath = (file) =>
  file ? `/uploads/avatars/${file.filename}` : "";

/**
 * Build enriched salon objects from the barber's salons array.
 */
const buildSalonsData = async (barber) => {
  if (!Array.isArray(barber.salons) || barber.salons.length === 0) {
    // Fallback to legacy single salon
    if (barber.salonStatus === "approved" && barber.salon) {
      const salon = await Salon.findById(barber.salon).select(
        "name city address phone image averageRating totalReviews"
      );
      if (salon) {
        return [
          {
            ...salon.toObject(),
            id: salon._id,
            status: "approved",
            isPrimary: true,
            joinedAt: barber.createdAt || new Date(),
          },
        ];
      }
    }
    return [];
  }

  const salonIds = barber.salons.map((s) => s.salon);
  const salons = await Salon.find({ _id: { $in: salonIds } }).select(
    "name city address phone image averageRating totalReviews"
  );
  const salonsById = new Map(salons.map((s) => [String(s._id), s]));

  return barber.salons.map((entry) => {
    const salonData = salonsById.get(String(entry.salon));
    return {
      ...(salonData ? salonData.toObject() : { _id: entry.salon, id: entry.salon }),
      id: entry.salon,
      status: entry.status,
      isPrimary: entry.isPrimary,
      joinedAt: entry.joinedAt,
    };
  });
};

export const getBarbers = async (_req, res) => {
  try {
    const barbers = await User.find({ role: "barber" }).select("-password");
    const paidAccessByBarberId = await getPaidAccessByBarberIds(
      barbers.map((barber) => barber._id)
    );
    const paidBarbers = barbers.filter((barber) =>
      paidAccessByBarberId.get(String(barber._id))
    );
    const profiles = await BarberProfile.find({
      barberId: { $in: paidBarbers.map((barber) => barber._id) },
    });
    const profilesByBarberId = new Map(
      profiles.map((profile) => [String(profile.barberId), profile])
    );

    // Collect all salon IDs from both new salons array and legacy fields
    const allSalonIds = new Set();
    paidBarbers.forEach((barber) => {
      if (Array.isArray(barber.salons)) {
        barber.salons.forEach((s) => {
          if (s.salon) allSalonIds.add(String(s.salon));
        });
      }
      if (barber.salon) allSalonIds.add(String(barber.salon));
    });

    const salons = await Salon.find({ _id: { $in: [...allSalonIds] } });
    const salonsById = new Map(
      salons.map((salon) => [String(salon._id), salon])
    );

    const enrichedBarbers = await Promise.all(
      paidBarbers.map(async (barber) => {
        const profile = profilesByBarberId.get(String(barber._id));

        // Get approved salons from new array
        let approvedSalon = null;
        let approvedSalons = [];

        if (Array.isArray(barber.salons) && barber.salons.length > 0) {
          const approvedEntries = barber.salons.filter(
            (s) => s.status === "approved"
          );
          const primaryEntry =
            approvedEntries.find((s) => s.isPrimary) || approvedEntries[0];

          if (primaryEntry?.salon) {
            approvedSalon = salonsById.get(String(primaryEntry.salon)) || null;
          }

          approvedSalons = approvedEntries
            .map((entry) => {
              const salon = salonsById.get(String(entry.salon));
              return salon
                ? {
                    ...salon.toObject(),
                    id: salon._id,
                    status: entry.status,
                    isPrimary: entry.isPrimary,
                    joinedAt: entry.joinedAt,
                  }
                : null;
            })
            .filter(Boolean);
        }

        // Fallback to legacy
        if (!approvedSalon && barber.salonStatus === "approved" && barber.salon) {
          approvedSalon = salonsById.get(String(barber.salon)) || null;
          if (approvedSalon) {
            approvedSalons = [
              {
                ...approvedSalon.toObject(),
                id: approvedSalon._id,
                status: "approved",
                isPrimary: true,
                joinedAt: barber.createdAt || new Date(),
              },
            ];
          }
        }

        return serializePublicBarberDirectory({
          barber,
          profile,
          salonName: approvedSalon?.name || "",
          salon: approvedSalon,
          salons: approvedSalons,
          approvedSalons,
          primarySalon: approvedSalon,
        });
      })
    );

    return res.json(enrichedBarbers);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch barbers");
  }
};

export const getMyProfile = async (req, res) => {
  try {
    let profile = null;

    if (req.user.role === "barber") {
      profile = await BarberProfile.findOne({ barberId: req.user._id });
    }

    const salonsData = await buildSalonsData(req.user);

    return res.json({
      ...getUserData(req.user),
      salon: req.user.salon || null,
      salonStatus: req.user.salonStatus || "none",
      salons: salonsData,
      approvedSalons: salonsData.filter((s) => s.status === "approved"),
      primarySalon: salonsData.find((s) => s.isPrimary && s.status === "approved") ||
        salonsData.find((s) => s.status === "approved") || null,
      salonName: profile?.salonName || "",
      bio: profile?.bio || "",
      city: profile?.city || req.user.city || "",
      address: profile?.address || "",
      instagram: profile?.instagram || "",
      imageUrl: profile?.imageUrl || req.user.avatarUrl || "",
      galleryImages: profile?.galleryImages || [],
      defaultSchedule: getDefaultSchedule(profile),
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch profile");
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const {
      name,
      phone,
      city,
      email,
      avatarUrl: bodyAvatarUrl,
      imageUrl: bodyImageUrl,
      bio,
    } = req.body;
    const uploadedAvatarPath = getUploadedAvatarPath(req.file);
    const hasUploadedAvatar = Boolean(uploadedAvatarPath);
    const hasBodyAvatarUrl = Object.hasOwn(req.body, "avatarUrl");
    const hasBodyImageUrl = Object.hasOwn(req.body, "imageUrl");
    const avatarUrl = hasUploadedAvatar
      ? uploadedAvatarPath
      : hasBodyAvatarUrl
        ? sanitizeMediaUrl(bodyAvatarUrl)
        : undefined;
    const imageUrl = hasUploadedAvatar
      ? uploadedAvatarPath
      : hasBodyImageUrl
        ? sanitizeMediaUrl(bodyImageUrl)
        : undefined;

    const userUpdates = {};
    const userUnsets = {};

    if (name !== undefined) userUpdates.name = name;
    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);

      if (!normalizedPhone) {
        return res.status(400).json({ message: "Phone is required" });
      }

      if (normalizedPhone.length > MAX_PHONE_LENGTH) {
        return res.status(400).json({
          message: `Phone must be ${MAX_PHONE_LENGTH} characters or less`,
        });
      }

      userUpdates.phone = normalizedPhone;
    }
    if (city !== undefined) userUpdates.city = city;
    if (avatarUrl !== undefined || imageUrl !== undefined) {
      userUpdates.avatarUrl = avatarUrl ?? imageUrl;
    }

    // Handle email change
    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      const currentEmail = normalizeEmail(req.user.email);

      if (normalizedEmail === "") {
        // Clearing email — remove all verification state
        userUnsets.email = "";
        userUnsets.emailVerificationTokenHash = "";
        userUnsets.emailVerificationExpires = "";
        userUnsets.emailVerificationSentAt = "";
        userUpdates.emailVerified = false;
        userUpdates.emailVerifiedAt = null;
      } else if (normalizedEmail === currentEmail) {
        userUpdates.email = normalizedEmail;
      } else {
        // Validate format
        if (!isValidEmail(normalizedEmail)) {
          return res.status(400).json({ message: "Invalid email format" });
        }

        // Check duplicate email (exclude current user)
        const existingUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: req.user._id },
        });
        if (existingUser) {
          return res.status(409).json({ message: "Email already in use" });
        }

        const { rawToken, tokenHash } = createEmailVerificationToken();
        userUpdates.email = normalizedEmail;
        userUpdates.emailVerified = false;
        userUpdates.emailVerifiedAt = null;
        userUpdates.emailVerificationTokenHash = tokenHash;
        userUpdates.emailVerificationExpires = new Date(
          Date.now() + EMAIL_VERIFICATION_EXPIRY_MS
        );
        userUpdates.emailVerificationSentAt = new Date();

        const user = await User.findByIdAndUpdate(req.user._id, userUpdates, {
          returnDocument: "after",
          runValidators: true,
        }).select("-password -emailVerificationTokenHash -emailVerificationExpires -emailVerificationSentAt");

        // Send verification email
        await sendEmailVerification({ user, token: rawToken, req });

        // Reload profile/barber data
        let profile = null;
        if (user.role === "barber") {
          const profileUpdates = {};
          if (city !== undefined) profileUpdates.city = city;
          if (bio !== undefined) profileUpdates.bio = bio;
          if (avatarUrl !== undefined || imageUrl !== undefined) {
            profileUpdates.imageUrl = imageUrl ?? avatarUrl;
          }
      profile = await BarberProfile.findOneAndUpdate(
        { barberId: user._id },
        { ...profileUpdates, barberId: user._id },
        { returnDocument: "after", runValidators: true, upsert: true }
      );
        }

        const salonsData = await buildSalonsData(user);
        return res.json({
          ...getUserData(user),
          salon: user.salon || null,
          salonStatus: user.salonStatus || "none",
          salons: salonsData,
          approvedSalons: salonsData.filter((s) => s.status === "approved"),
          primarySalon: salonsData.find((s) => s.isPrimary && s.status === "approved") ||
            salonsData.find((s) => s.status === "approved") || null,
          salonName: profile?.salonName || "",
          bio: profile?.bio || "",
          city: profile?.city || user.city || "",
          address: profile?.address || "",
          instagram: profile?.instagram || "",
          imageUrl: profile?.imageUrl || user.avatarUrl || "",
          galleryImages: profile?.galleryImages || [],
          defaultSchedule: getDefaultSchedule(profile),
        });
      }
    }

    const updateOperation = Object.keys(userUnsets).length > 0
      ? { $set: userUpdates, $unset: userUnsets }
      : userUpdates;

    const user = await User.findByIdAndUpdate(req.user._id, updateOperation, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password -emailVerificationTokenHash -emailVerificationExpires -emailVerificationSentAt");

    let profile = null;

    if (user.role === "barber") {
      const profileUpdates = {};

      if (city !== undefined) profileUpdates.city = city;
      if (bio !== undefined) profileUpdates.bio = bio;
      if (avatarUrl !== undefined || imageUrl !== undefined) {
        profileUpdates.imageUrl = imageUrl ?? avatarUrl;
      }

      profile = await BarberProfile.findOneAndUpdate(
        { barberId: user._id },
        { ...profileUpdates, barberId: user._id },
        { returnDocument: "after", runValidators: true, upsert: true }
      );
    }

    const salonsData = await buildSalonsData(user);

    return res.json({
      ...getUserData(user),
      salon: user.salon || null,
      salonStatus: user.salonStatus || "none",
      salons: salonsData,
      approvedSalons: salonsData.filter((s) => s.status === "approved"),
      primarySalon: salonsData.find((s) => s.isPrimary && s.status === "approved") ||
        salonsData.find((s) => s.status === "approved") || null,
      salonName: profile?.salonName || "",
      bio: profile?.bio || "",
      city: profile?.city || user.city || "",
      address: profile?.address || "",
      instagram: profile?.instagram || "",
      imageUrl: profile?.imageUrl || user.avatarUrl || "",
      galleryImages: profile?.galleryImages || [],
      defaultSchedule: getDefaultSchedule(profile),
    });
  } catch (error) {
    if (error.code === 11000) {
      // Determine if duplicate email or phone
      const keyPattern = error.keyPattern || {};
      if (keyPattern.email) {
        return res.status(409).json({ message: "Email already in use" });
      }
      return res.status(400).json({ message: "Phone already exists" });
    }

    return res.status(400).json({
      message: error.message || "Could not update profile",
    });
  }
};

/**
 * POST /users/me/email/verification
 * Resend email verification.
 */
export const sendEmailVerificationController = async (req, res) => {
  try {
    // Re-fetch user with select:false fields for throttle check
    const user = await User.findById(req.user._id).select(
      "-password +emailVerificationSentAt +emailVerificationExpires"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
      return res.status(400).json({ message: "No email to verify" });
    }

    if (user.emailVerified) {
      return res.status(200).json({ message: "Email already verified" });
    }

    // Resend throttle check
    if (user.emailVerificationSentAt) {
      const elapsed = Date.now() - new Date(user.emailVerificationSentAt).getTime();
      if (elapsed < EMAIL_VERIFICATION_RESEND_THROTTLE_MS) {
        const remaining = Math.ceil(
          (EMAIL_VERIFICATION_RESEND_THROTTLE_MS - elapsed) / 1000
        );
        return res.status(429).json({
          message: `Please wait ${remaining} seconds before requesting a new verification email`,
        });
      }
    }

    const { rawToken, tokenHash } = createEmailVerificationToken();

    await User.findByIdAndUpdate(user._id, {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS),
      emailVerificationSentAt: new Date(),
    });

    await sendEmailVerification({ user, token: rawToken, req });

    return res.json({ message: "Verification email sent" });
  } catch (error) {
    return sendControllerError(res, error, "Could not send verification email");
  }
};

/**
 * GET /users/me/email/verify?token=...
 * Verify email via token (no auth required — email links must work from browsers).
 */
export const verifyEmailController = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Verification token is required" });
    }

    const tokenHash = hashEmailVerificationToken(token);

    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: { $gt: new Date() },
    }).select("-password -emailVerificationTokenHash -emailVerificationExpires -emailVerificationSentAt");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification token" });
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = "";
    user.emailVerificationExpires = null;
    // Keep emailVerificationSentAt as record of when last sent
    await user.save();

    return res.json({
      message: "Email verified successfully",
      user: getUserData(user),
    });
  } catch (error) {
    return sendControllerError(res, error, "Verification failed");
  }
};
