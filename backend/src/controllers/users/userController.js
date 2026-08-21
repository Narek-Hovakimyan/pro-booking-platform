import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import {
  createEmailVerificationToken,
  EMAIL_VERIFICATION_EXPIRY_MS,
  EMAIL_VERIFICATION_RESEND_THROTTLE_MS,
  hashEmailVerificationToken,
} from "../../utils/emailVerification.js";
import { sendEmailVerification } from "../../services/auth/emailService.js";
import { sendControllerError } from "../../utils/controllerError.js";
import { getPaidAccessByBarberIds } from "../../services/subscriptionService.js";
import { serializePublicBarberDirectory } from "../../utils/publicBarberSerializer.js";
import { getPublicBarberReadinessByIds } from "../../services/barber/publicBarberReadinessService.js";
import {
  BarberProfileConflictError,
  BarberProfileWriteError,
} from "../../utils/barberProfileDuplicateConflict.js";
import { serializeMyProfileResponse, serializeUserData } from "./userSerializers.js";
import { buildSalonsData } from "../../services/users/userSalonProfileService.js";
import {
  UserProfileUpdateError,
  updateSelfProfile,
} from "../../services/users/userProfileUpdateService.js";
import { parseOptionalPagination } from "../../utils/requestValidation.js";
import { findPublicBarberDirectoryPage } from "../../services/users/publicBarberDirectoryQueryService.js";

export const getBarbers = async (req, res) => {
  try {
    const pagination = parseOptionalPagination(req.query);
    if (!pagination.ok) {
      return res.status(400).json({ message: pagination.error });
    }

    let paidBarbers;
    let readinessByBarberId;
    if (pagination.value.enabled) {
      paidBarbers = await findPublicBarberDirectoryPage(pagination.value);
      readinessByBarberId = new Map(paidBarbers.map((barber) => [
        String(barber._id),
        { publicReady: true, eligibleSalonIds: new Set((barber._eligibleSalonIds || []).map(String)) },
      ]));
    } else {
      const barbers = await User.find({ role: "barber" })
        .sort({ createdAt: 1, _id: 1 })
        .select("-password");
      const paidAccessByBarberId = await getPaidAccessByBarberIds(
        barbers.map((barber) => barber._id)
      );
      paidBarbers = barbers.filter((barber) =>
        paidAccessByBarberId.get(String(barber._id))
      );
      readinessByBarberId = await getPublicBarberReadinessByIds(paidBarbers.map((barber) => barber._id));
      paidBarbers = paidBarbers.filter((barber) => readinessByBarberId.get(String(barber._id))?.publicReady);
    }
    const profiles = await BarberProfile.find({
      barberId: { $in: paidBarbers.map((barber) => barber._id) },
    });
    const profilesByBarberId = new Map(
      profiles.map((profile) => [String(profile.barberId), profile])
    );

    // Collect only canonical salon IDs that passed public readiness eligibility.
    const allSalonIds = new Set();
    paidBarbers.forEach((barber) => {
      const readiness = readinessByBarberId.get(String(barber._id));
      readiness?.eligibleSalonIds?.forEach((salonId) => allSalonIds.add(String(salonId)));
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

        const readiness = readinessByBarberId.get(String(barber._id));
        const eligibleSalonIds = readiness?.eligibleSalonIds || new Set();

        if (Array.isArray(barber.salons) && barber.salons.length > 0) {
          const approvedEntries = barber.salons.filter(
            (s) => s.status === "approved" && eligibleSalonIds.has(String(s.salon))
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

    return res.json(serializeMyProfileResponse({ user: req.user, profile, salonsData }));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch profile");
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const { user, profile } = await updateSelfProfile({
      user: req.user,
      body: req.body,
      file: req.file,
      req,
    });

    const salonsData = await buildSalonsData(user);
    return res.json(serializeMyProfileResponse({ user, profile, salonsData }));
  } catch (error) {
    if (error instanceof UserProfileUpdateError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    if (error instanceof BarberProfileConflictError) {
      return res.status(409).json({
        code: "BARBER_PROFILE_CONFLICT",
        message: "Could not save barber profile",
      });
    }

    if (error instanceof BarberProfileWriteError) {
      return res.status(500).json({ message: "Could not update profile" });
    }

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
      user: serializeUserData(user),
    });
  } catch (error) {
    return sendControllerError(res, error, "Verification failed");
  }
};
