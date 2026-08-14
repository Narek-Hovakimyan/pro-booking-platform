import BarberProfile from "../../models/BarberProfile.js";
import User from "../../models/User.js";
import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";
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

const deleteIfReplaced = (previousPath, nextPath) => {
  if (!previousPath || previousPath === nextPath) return;
  deleteUploadedFile(previousPath);
};

export const createSelfBarberProfileMutationService = (dependencies = {}) => {
  const deps = {
    UserModel: dependencies.UserModel || User,
    BarberProfileModel: dependencies.BarberProfileModel || BarberProfile,
    serialize:
      dependencies.serializePrivateSelfBarberProfile || serializePrivateSelfBarberProfile,
  };

  return async function mutateSelfBarberProfile({
    trustedBarberId,
    userUpdates = {},
    profileUpdates = {},
  }) {
    const userFilter = { _id: trustedBarberId, role: "barber" };
    const hasUserUpdates = hasUpdates(userUpdates);
    const hasProfileUpdates = hasUpdates(profileUpdates);
    const uploadedAvatarPath =
      typeof userUpdates.avatarUrl === "string" &&
      userUpdates.avatarUrl.startsWith(avatarUploadPrefix)
        ? userUpdates.avatarUrl
        : "";
    const previousUser = uploadedAvatarPath
      ? await readTrustedUser(deps.UserModel, userFilter)
      : null;
    const previousProfile = uploadedAvatarPath
      ? await readSelfProfile(deps.BarberProfileModel, trustedBarberId)
      : null;
    const previousUserAvatarUrl =
      typeof previousUser?.avatarUrl === "string" ? previousUser.avatarUrl : "";
    const previousProfileImageUrl =
      typeof previousProfile?.imageUrl === "string" ? previousProfile.imageUrl : "";
    let user;
    let avatarPersisted = false;

    try {
      if (hasUserUpdates) {
        user = await selectQuery(
          deps.UserModel.findOneAndUpdate(
            userFilter,
            { $set: { ...userUpdates } },
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

    avatarPersisted = Boolean(
      uploadedAvatarPath && userUpdates.avatarUrl === uploadedAvatarPath
    );

    try {
      let profile;
      try {
        if (hasProfileUpdates) {
          profile = await retryBarberProfileUpsertOnDuplicate({
            BarberProfileModel: deps.BarberProfileModel,
            barberId: trustedBarberId,
            update: {
              $set: { ...profileUpdates },
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

      if (uploadedAvatarPath) {
        deleteIfReplaced(previousUserAvatarUrl, uploadedAvatarPath);
        deleteIfReplaced(previousProfileImageUrl, uploadedAvatarPath);
      }

      return deps.serialize({ user, profile });
    } catch (error) {
      if (uploadedAvatarPath && !avatarPersisted) {
        deleteUploadedFile(uploadedAvatarPath);
      }
      if (uploadedAvatarPath && avatarPersisted) {
        error.preserveUploadedFile = true;
      }
      throw error;
    }
  };
};

export const mutateSelfBarberProfile = createSelfBarberProfileMutationService();
