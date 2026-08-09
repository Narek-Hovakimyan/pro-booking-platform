import BarberProfile from "../../models/BarberProfile.js";
import User, { MAX_PHONE_LENGTH } from "../../models/User.js";
import { sendEmailVerification } from "../auth/emailService.js";
import { sanitizeMediaUrl } from "../../utils/mediaUrl.js";
import {
  createEmailVerificationToken,
  EMAIL_VERIFICATION_EXPIRY_MS,
  isValidEmail,
  normalizeEmail,
} from "../../utils/emailVerification.js";
import {
  BarberProfileConflictError,
  retryBarberProfileUpsertOnDuplicate,
} from "../../utils/barberProfileDuplicateConflict.js";

export class UserProfileUpdateError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "UserProfileUpdateError";
    this.statusCode = statusCode;
  }
}

const normalizePhone = (phone) => (typeof phone === "string" ? phone.trim() : "");
const getUploadedAvatarPath = (file) =>
  file ? `/uploads/avatars/${file.filename}` : "";

const selectQuery = (query, projection) => {
  if (query && typeof query.select === "function") {
    return query.select(projection);
  }

  return query;
};

const buildMediaValues = (body, file) => {
  const uploadedAvatarPath = getUploadedAvatarPath(file);
  const hasUploadedAvatar = Boolean(uploadedAvatarPath);
  const hasBodyAvatarUrl = Object.hasOwn(body, "avatarUrl");
  const hasBodyImageUrl = Object.hasOwn(body, "imageUrl");

  return {
    avatarUrl: hasUploadedAvatar
      ? uploadedAvatarPath
      : hasBodyAvatarUrl
        ? sanitizeMediaUrl(body.avatarUrl)
        : undefined,
    imageUrl: hasUploadedAvatar
      ? uploadedAvatarPath
      : hasBodyImageUrl
        ? sanitizeMediaUrl(body.imageUrl)
        : undefined,
  };
};

const buildProfileUpdates = ({ city, bio, avatarUrl, imageUrl }) => {
  const profileUpdates = {};

  if (city !== undefined) profileUpdates.city = city;
  if (bio !== undefined) profileUpdates.bio = bio;
  if (avatarUrl !== undefined || imageUrl !== undefined) {
    profileUpdates.imageUrl = imageUrl ?? avatarUrl;
  }

  return profileUpdates;
};

export const createUserProfileUpdateService = (dependencies = {}) => {
  const deps = {
    UserModel: dependencies.UserModel || User,
    BarberProfileModel: dependencies.BarberProfileModel || BarberProfile,
    sendEmailVerification: dependencies.sendEmailVerification || sendEmailVerification,
  };

  return async function updateSelfProfile({ user, body = {}, file = null, req }) {
    const {
      name,
      phone,
      city,
      email,
      bio,
    } = body;
    const { avatarUrl, imageUrl } = buildMediaValues(body, file);

    const userUpdates = {};
    const userUnsets = {};
    let verificationToken = null;

    if (name !== undefined) userUpdates.name = name;
    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);

      if (!normalizedPhone) {
        throw new UserProfileUpdateError("Phone is required");
      }

      if (normalizedPhone.length > MAX_PHONE_LENGTH) {
        throw new UserProfileUpdateError(
          `Phone must be ${MAX_PHONE_LENGTH} characters or less`
        );
      }

      userUpdates.phone = normalizedPhone;
    }
    if (city !== undefined) userUpdates.city = city;
    if (avatarUrl !== undefined || imageUrl !== undefined) {
      userUpdates.avatarUrl = avatarUrl ?? imageUrl;
    }

    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      const currentEmail = normalizeEmail(user.email);

      if (normalizedEmail === "") {
        userUnsets.email = "";
        userUnsets.emailVerificationTokenHash = "";
        userUnsets.emailVerificationExpires = "";
        userUnsets.emailVerificationSentAt = "";
        userUpdates.emailVerified = false;
        userUpdates.emailVerifiedAt = null;
      } else if (normalizedEmail === currentEmail) {
        userUpdates.email = normalizedEmail;
      } else {
        if (!isValidEmail(normalizedEmail)) {
          throw new UserProfileUpdateError("Invalid email format");
        }

        const existingUser = await deps.UserModel.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
        });
        if (existingUser) {
          throw new UserProfileUpdateError("Email already in use", 409);
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
        verificationToken = rawToken;
      }
    }

    const updateOperation =
      Object.keys(userUnsets).length > 0
        ? { $set: userUpdates, $unset: userUnsets }
        : userUpdates;

    const savedUser = await selectQuery(
      deps.UserModel.findByIdAndUpdate(user._id, updateOperation, {
        returnDocument: "after",
        runValidators: true,
      }),
      "-password -emailVerificationTokenHash -emailVerificationExpires -emailVerificationSentAt"
    );

    if (verificationToken) {
      await deps.sendEmailVerification({ user: savedUser, token: verificationToken, req });
    }

    let profile = null;
    if (savedUser.role === "barber") {
      const profileUpdates = buildProfileUpdates({ city, bio, avatarUrl, imageUrl });

      profile = await retryBarberProfileUpsertOnDuplicate({
        BarberProfileModel: deps.BarberProfileModel,
        barberId: savedUser._id,
        update: { ...profileUpdates, barberId: savedUser._id },
        options: { returnDocument: "after", runValidators: true, upsert: true },
      });

      if (!profile) throw new BarberProfileConflictError();
    }

    return { user: savedUser, profile };
  };
};

export const updateSelfProfile = createUserProfileUpdateService();
