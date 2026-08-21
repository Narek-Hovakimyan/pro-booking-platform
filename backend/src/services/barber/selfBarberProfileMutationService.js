import BarberProfile from "../../models/BarberProfile.js";
import User from "../../models/User.js";
import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";
import {
  clearBarberProfileAvatarAtomically,
  replaceBarberProfileAvatarAtomically,
} from "../media/profileMediaService.js";
import { serializePrivateSelfBarberProfile } from "../../utils/privateSelfBarberProfileSerializer.js";
import {
  BarberProfileConflictError,
  retryBarberProfileUpsertOnDuplicate,
} from "../../utils/barberProfileDuplicateConflict.js";

export class SelfBarberProfileMutationError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = "SelfBarberProfileMutationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const userProjection = "name phone city profession barberType specialty avatarUrl role";
const profileProjection = "barberId bio city address instagram imageUrl galleryImages defaultSchedule";
const avatarUploadPrefix = "/uploads/avatars/";

const hasUpdates = (updates) => Object.keys(updates || {}).length > 0;

const selectQuery = (query, projection) => {
  if (query && typeof query.select === "function") return query.select(projection);
  return query;
};

const readTrustedUser = (UserModel, userFilter) =>
  selectQuery(UserModel.findOne(userFilter), userProjection);

const readSelfProfile = (BarberProfileModel, trustedBarberId) =>
  selectQuery(BarberProfileModel.findOne({ barberId: trustedBarberId }), profileProjection);

const withoutAvatar = (updates) => {
  const { avatarUrl, imageUrl, ...rest } = updates;
  return rest;
};

export const createSelfBarberProfileMutationService = (dependencies = {}) => {
  const deps = {
    UserModel: dependencies.UserModel || User,
    BarberProfileModel: dependencies.BarberProfileModel || BarberProfile,
    replaceBarberProfileAvatarAtomically:
      dependencies.replaceBarberProfileAvatarAtomically || replaceBarberProfileAvatarAtomically,
    clearBarberProfileAvatarAtomically:
      dependencies.clearBarberProfileAvatarAtomically || clearBarberProfileAvatarAtomically,
    serialize:
      dependencies.serializePrivateSelfBarberProfile || serializePrivateSelfBarberProfile,
  };

  return async function mutateSelfBarberProfile({
    trustedBarberId,
    userUpdates = {},
    profileUpdates = {},
    uploadFile = null,
  }) {
    const userFilter = { _id: trustedBarberId, role: "barber" };
    const hasUserUpdates = hasUpdates(userUpdates);
    const hasProfileUpdates = hasUpdates(profileUpdates);
    const requestedAvatarPath =
      typeof userUpdates.avatarUrl === "string" &&
      userUpdates.avatarUrl.startsWith(avatarUploadPrefix)
        ? userUpdates.avatarUrl
        : "";
    const hasTrustedUpload = Boolean(uploadFile?.path || Buffer.isBuffer(uploadFile?.buffer));
    const transactionalAvatar = Boolean(
      requestedAvatarPath && hasTrustedUpload && deps.UserModel.db?.readyState === 1
    );
    const transactionalClear = Boolean(
      !requestedAvatarPath &&
      (userUpdates.avatarUrl === "" || profileUpdates.imageUrl === "") &&
      deps.UserModel.db?.readyState === 1
    );
    const previousUser = (transactionalAvatar || transactionalClear)
      ? await readTrustedUser(deps.UserModel, userFilter)
      : null;
    const previousProfile = (transactionalAvatar || transactionalClear)
      ? await readSelfProfile(deps.BarberProfileModel, trustedBarberId)
      : null;
    const previousUserAvatarUrl =
      typeof previousUser?.avatarUrl === "string" ? previousUser.avatarUrl : "";
    const previousProfileImageUrl =
      typeof previousProfile?.imageUrl === "string" ? previousProfile.imageUrl : "";
    let user;
    let avatarPersisted = false;

    if (requestedAvatarPath && !hasTrustedUpload) {
      throw new SelfBarberProfileMutationError(
        "BARBER_PROFILE_MEDIA_INVALID",
        "Invalid barber profile media",
        400
      );
    }

    try {
      if (hasUserUpdates) {
        user = await selectQuery(
          deps.UserModel.findOneAndUpdate(
            userFilter,
            { $set: { ...(transactionalAvatar || transactionalClear ? withoutAvatar(userUpdates) : userUpdates) } },
            { returnDocument: "after", runValidators: true }
          ),
          userProjection
        );
      } else {
        user = await readTrustedUser(deps.UserModel, userFilter);
      }
    } catch {
      throw new SelfBarberProfileMutationError(
        "BARBER_PROFILE_MUTATION_FAILED",
        "Could not save barber profile"
      );
    }

    if (!user) {
      throw new SelfBarberProfileMutationError(
        "BARBER_PROFILE_NOT_FOUND",
        "Barber profile not found",
        404
      );
    }

    try {
      let profile;
      try {
        if (hasProfileUpdates) {
          profile = await retryBarberProfileUpsertOnDuplicate({
            BarberProfileModel: deps.BarberProfileModel,
            barberId: trustedBarberId,
            update: {
              $set: { ...(transactionalAvatar || transactionalClear ? withoutAvatar(profileUpdates) : profileUpdates) },
              $setOnInsert: { barberId: trustedBarberId },
            },
            options: { returnDocument: "after", runValidators: true, upsert: true },
            projection: profileProjection,
          });

          if (!profile) throw new BarberProfileConflictError();
        } else {
          profile = await readSelfProfile(deps.BarberProfileModel, trustedBarberId);
        }
      } catch (error) {
        if (error instanceof BarberProfileConflictError) {
          throw new SelfBarberProfileMutationError(
            "BARBER_PROFILE_CONFLICT",
            "Could not save barber profile",
            409
          );
        }

        throw new SelfBarberProfileMutationError(
          "BARBER_PROFILE_MUTATION_FAILED",
          "Could not save barber profile"
        );
      }

      if (transactionalAvatar) {
        ({ user, profile } = await deps.replaceBarberProfileAvatarAtomically({
          ownerId: trustedBarberId,
          expectedUserAvatarUrl: previousUserAvatarUrl,
          expectedProfileImageUrl: previousProfileImageUrl,
          file: uploadFile,
        }));
        avatarPersisted = true;
        deleteUploadedFile(uploadFile.path);
      } else if (transactionalClear) {
        ({ user, profile } = await deps.clearBarberProfileAvatarAtomically({
          ownerId: trustedBarberId,
          expectedUserAvatarUrl: previousUserAvatarUrl,
          expectedProfileImageUrl: previousProfileImageUrl,
        }));
      }

      return deps.serialize({ user, profile });
    } catch (error) {
      const commitOutcomeUnknown = Boolean(error?.profileMediaCommitOutcomeUnknown);
      if (requestedAvatarPath && !avatarPersisted && !commitOutcomeUnknown) {
        deleteUploadedFile(uploadFile?.path || requestedAvatarPath);
      }
      if (requestedAvatarPath && (avatarPersisted || commitOutcomeUnknown)) {
        error.preserveUploadedFile = true;
      }
      throw error;
    }
  };
};

export const mutateSelfBarberProfile = createSelfBarberProfileMutationService();
