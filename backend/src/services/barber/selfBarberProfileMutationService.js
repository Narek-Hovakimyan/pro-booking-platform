import BarberProfile from "../../models/BarberProfile.js";
import User from "../../models/User.js";
import { serializePrivateSelfBarberProfile } from "../../utils/privateSelfBarberProfileSerializer.js";

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

const hasUpdates = (updates) => Object.keys(updates || {}).length > 0;

const selectQuery = (query, projection) => {
  if (query && typeof query.select === "function") return query.select(projection);
  return query;
};

const readTrustedUser = (UserModel, userFilter) =>
  selectQuery(UserModel.findOne(userFilter), userProjection);

const readSelfProfile = (BarberProfileModel, trustedBarberId) =>
  selectQuery(BarberProfileModel.findOne({ barberId: trustedBarberId }), profileProjection);

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
    let user;

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

    let profile;
    try {
      if (hasProfileUpdates) {
        profile = await selectQuery(
          deps.BarberProfileModel.findOneAndUpdate(
            { barberId: trustedBarberId },
            {
              $set: { ...profileUpdates },
              $setOnInsert: { barberId: trustedBarberId },
            },
            { returnDocument: "after", runValidators: true, upsert: true }
          ),
          profileProjection
        );
      } else {
        profile = await readSelfProfile(deps.BarberProfileModel, trustedBarberId);
      }
    } catch {
      throw new SelfBarberProfileMutationError(
        "BARBER_PROFILE_MUTATION_FAILED",
        "Could not save barber profile"
      );
    }

    return deps.serialize({ user, profile });
  };
};

export const mutateSelfBarberProfile = createSelfBarberProfileMutationService();
