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

// ─── Serializers ───
export const serializeSalon = (salon) => {
  if (!salon) return null;

  const rawSalon = salon.toObject ? salon.toObject() : salon;

  return {
    ...rawSalon,
    id: rawSalon.id || rawSalon._id,
  };
};

export const serializeRequest = (request) => {
  if (!request) return null;

  const rawRequest = request.toObject ? request.toObject() : request;

  return {
    ...rawRequest,
    id: rawRequest.id || rawRequest._id,
    salon: serializeSalon(rawRequest.salonId),
  };
};

export const serializeUser = (user) => {
  if (!user) return null;

  const rawUser = user.toObject ? user.toObject() : user;

  delete rawUser.password;

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
    const publicBarber = barber.toObject();

    delete publicBarber.workHistory;

    // Include approved salons info
    const approvedSalons = (barber.salons || [])
      .filter((s) => s.status === "approved")
      .map((s) => ({
        salon: s.salon,
        isPrimary: s.isPrimary,
        joinedAt: s.joinedAt,
      }));

    return {
      ...publicBarber,
      id: barber._id,
      city: profile?.city || barber.city || "",
      imageUrl: profile?.imageUrl || barber.avatarUrl || "",
      bio: profile?.bio || "",
      galleryImages: profile?.galleryImages || [],
      defaultSchedule: profile?.defaultSchedule,
      salon: serializeSalon(salon),
      approvedSalons,
    };
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
    ...serializeSalon(salon),
    averageRating: safeReviewStats.averageRating,
    totalReviews: safeReviewStats.totalReviews ?? safeReviewStats.reviewsCount,
    reviewsCount: safeReviewStats.reviewsCount,
    latestReviews: safeReviewStats.latestReviews,
    barbers: buildPublicBarbers(barbers, profiles, salon),
  };
};
