/**
 * Pure helper functions and constants for salon logic.
 * No req, res, database queries, database writes, or external mutations.
 */

// ─── Constants ───
export const timeKeyPattern = /^\d{2}:\d{2}$/;

// ─── Time helper ───
export const timeToMinutes = (time) => {
  if (typeof time !== "string" || !timeKeyPattern.test(time)) return null;

  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
};

const stripStaffPaymentFromSalons = (salons = []) =>
  (Array.isArray(salons) ? salons : []).map((entry) => {
    const rawEntry = entry?.toObject ? entry.toObject() : entry;
    if (!rawEntry) return rawEntry;
    const { staffPayment, ...safeEntry } = rawEntry;
    return safeEntry;
  });

const toPlainObject = (value) => (value?.toObject ? value.toObject() : value);

export const serializePublicSalon = (salon) => {
  if (!salon) return null;

  const rawSalon = toPlainObject(salon);

  return {
    _id: rawSalon._id,
    id: rawSalon.id || rawSalon._id,
    name: rawSalon.name || "",
    city: rawSalon.city || "",
    address: rawSalon.address || "",
    phone: rawSalon.phone || "",
    imageUrl: rawSalon.imageUrl || rawSalon.image || "",
    image: rawSalon.image || rawSalon.imageUrl || "",
  };
};

export const serializePublicBarber = ({ barber, profile = null, salon = null }) => {
  if (!barber) return null;

  const rawBarber = toPlainObject(barber);

  return {
    _id: rawBarber._id,
    id: rawBarber.id || rawBarber._id,
    name: rawBarber.name || "",
    role: rawBarber.role || "barber",
    city: profile?.city || rawBarber.city || "",
    avatarUrl: rawBarber.avatarUrl || "",
    imageUrl: profile?.imageUrl || rawBarber.avatarUrl || rawBarber.imageUrl || "",
    profession: rawBarber.profession || "barber",
    barberType: rawBarber.barberType || "",
    specialty: rawBarber.specialty || "unisex",
    bio: profile?.bio || "",
    galleryImages: profile?.galleryImages || [],
    defaultSchedule: profile?.defaultSchedule,
    salon: serializePublicSalon(salon),
  };
};

// ─── Serializers ───
export const serializeSalon = (salon) => {
  if (!salon) return null;

  const rawSalon = toPlainObject(salon);

  return {
    ...rawSalon,
    id: rawSalon.id || rawSalon._id,
  };
};

export const serializeRequest = (request) => {
  if (!request) return null;

  const rawRequest = toPlainObject(request);

  return {
    ...rawRequest,
    id: rawRequest.id || rawRequest._id,
    salon: serializeSalon(rawRequest.salonId),
  };
};

export const serializeUser = (user) => {
  if (!user) return null;

  const rawUser = toPlainObject(user);

  delete rawUser.password;
  delete rawUser.platformRole;
  rawUser.salons = stripStaffPaymentFromSalons(rawUser.salons);

  return {
    ...rawUser,
    id: rawUser.id || rawUser._id,
  };
};

// ─── Public barber response builder ───
export const buildPublicBarbers = (barbers, profiles, salon) => {
  const profilesByBarberId = new Map(
    profiles.map((profile) => [String(profile.barberId), profile])
  );

  return barbers.map((barber) => {
    const profile = profilesByBarberId.get(String(barber._id));
    return serializePublicBarber({ barber, profile, salon });
  });
};

export const buildPublicSalonResponse = ({
  salon,
  reviewStats,
  barbers,
  profiles,
}) => {
  const safeReviewStats = reviewStats || {
    averageRating: 0,
    totalReviews: 0,
    reviewsCount: 0,
    latestReviews: [],
  };

  return {
    ...serializePublicSalon(salon),
    averageRating: safeReviewStats.averageRating,
    totalReviews: safeReviewStats.totalReviews ?? safeReviewStats.reviewsCount,
    reviewsCount: safeReviewStats.reviewsCount,
    latestReviews: safeReviewStats.latestReviews,
    barbers: buildPublicBarbers(barbers, profiles, salon),
  };
};
