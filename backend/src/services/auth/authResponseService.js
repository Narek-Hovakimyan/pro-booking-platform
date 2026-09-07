import {
  isPlatformSuperuser,
  resolvePlatformCapabilities,
} from "../../middleware/platformMiddleware.js";
import { serializeSpecialistOnboardingState } from "../../utils/specialistOnboardingState.js";
import { signAccessTokenForUser } from "./accessTokenService.js";

export function signAccessToken(user) {
  if (user && typeof user === "object" && !Array.isArray(user)) {
    return signAccessTokenForUser(user);
  }

  return signAccessTokenForUser({ _id: user, authVersion: 0 });
}

const getRawSalonMemberships = (user) => {
  if (Array.isArray(user.salons) && user.salons.length > 0) {
    return user.salons;
  }

  if (user.role === "barber" && user.salonStatus === "approved" && user.salon) {
    return [{
      salon: user.salon,
      status: "approved",
      isPrimary: true,
    }];
  }

  return [];
};

export function serializeAuthUser(user) {
  const specialistOnboarding = serializeSpecialistOnboardingState(user);
  const platformCapabilities = resolvePlatformCapabilities(user);

  return {
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
    salons: getRawSalonMemberships(user),
    profession: user.profession || "barber",
    barberType: user.barberType || "",
    specialty: user.specialty || "unisex",
    workHistory: user.workHistory || [],
    favoriteBarbers: user.favoriteBarbers || [],
    favoriteSalons: user.favoriteSalons || [],
    canAccessPlatform: isPlatformSuperuser(user),
    platformCapabilities,
    createdAt: user.createdAt,
    ...(specialistOnboarding ? { specialistOnboarding } : {}),
  };
}
