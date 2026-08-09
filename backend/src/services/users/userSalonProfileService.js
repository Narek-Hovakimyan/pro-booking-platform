import Salon from "../../models/Salon.js";

const selectQuery = (query, projection) => {
  if (query && typeof query.select === "function") {
    return query.select(projection);
  }

  return query;
};

const toPlainSalon = (salon) =>
  typeof salon?.toObject === "function" ? salon.toObject() : { ...salon };

export const buildSalonsData = async (barber, { SalonModel = Salon } = {}) => {
  if (!Array.isArray(barber.salons) || barber.salons.length === 0) {
    if (barber.salonStatus === "approved" && barber.salon) {
      const salon = await selectQuery(
        SalonModel.findById(barber.salon),
        "name city address phone image averageRating totalReviews"
      );

      if (salon) {
        const salonData = toPlainSalon(salon);
        return [
          {
            ...salonData,
            id: salonData._id,
            status: "approved",
            isPrimary: true,
            joinedAt: barber.createdAt || new Date(),
          },
        ];
      }
    }

    return [];
  }

  const salonIds = barber.salons.map((s) => s.salon);
  const salons = await selectQuery(
    SalonModel.find({ _id: { $in: salonIds } }),
    "name city address phone image averageRating totalReviews"
  );
  const salonsById = new Map((salons || []).map((s) => [String(s._id), s]));

  return barber.salons.map((entry) => {
    const salonData = salonsById.get(String(entry.salon));
    const plainSalon = salonData ? toPlainSalon(salonData) : { _id: entry.salon, id: entry.salon };

    return {
      ...plainSalon,
      id: entry.salon,
      status: entry.status,
      isPrimary: entry.isPrimary,
      joinedAt: entry.joinedAt,
    };
  });
};
