import { isPlatformSuperuser } from "../../middleware/platformMiddleware.js";

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

export const serializeUserData = (user) => ({
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

export const serializeMyProfileResponse = ({
  user,
  profile = null,
  salonsData = [],
}) => ({
  ...serializeUserData(user),
  salon: user.salon || null,
  salonStatus: user.salonStatus || "none",
  salons: salonsData,
  approvedSalons: salonsData.filter((s) => s.status === "approved"),
  primarySalon:
    salonsData.find((s) => s.isPrimary && s.status === "approved") ||
    salonsData.find((s) => s.status === "approved") ||
    null,
  salonName: profile?.salonName || "",
  bio: profile?.bio || "",
  city: profile?.city || user.city || "",
  address: profile?.address || "",
  instagram: profile?.instagram || "",
  imageUrl: profile?.imageUrl || user.avatarUrl || "",
  galleryImages: profile?.galleryImages || [],
  defaultSchedule: getDefaultSchedule(profile),
});
