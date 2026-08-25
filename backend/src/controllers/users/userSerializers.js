import { serializeAuthUser } from "../../services/auth/authResponseService.js";

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

export const serializeUserData = (user) => serializeAuthUser(user);

export const serializeMyProfileResponse = ({
  user,
  profile = null,
  salonsData = [],
}) => {
  const authUser = serializeUserData(user);

  return {
    ...authUser,
    // Keep the auth-session membership contract intact. Enriched salon data is
    // exposed separately below for profile rendering.
    salons: authUser.salons,
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
  };
};
