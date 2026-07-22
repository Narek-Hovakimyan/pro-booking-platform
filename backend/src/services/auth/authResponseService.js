import jwt from "jsonwebtoken";

import { isPlatformSuperuser } from "../../middleware/platformMiddleware.js";
import { serializeSpecialistOnboardingState } from "../../utils/specialistOnboardingState.js";

export function signAccessToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
}

export function serializeAuthUser(user) {
  const specialistOnboarding = serializeSpecialistOnboardingState(user);

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
    salons: user.salons || [],
    profession: user.profession || "barber",
    barberType: user.barberType || "",
    specialty: user.specialty || "unisex",
    workHistory: user.workHistory || [],
    favoriteBarbers: user.favoriteBarbers || [],
    favoriteSalons: user.favoriteSalons || [],
    canAccessPlatform: isPlatformSuperuser(user),
    createdAt: user.createdAt,
    ...(specialistOnboarding ? { specialistOnboarding } : {}),
  };
}
