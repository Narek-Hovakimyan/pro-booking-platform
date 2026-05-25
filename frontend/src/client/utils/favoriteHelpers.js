export const AVAILABILITY_STATUS = {
  LOADING: "loading",
  READY: "ready",
  UNAVAILABLE: "unavailable",
};

export const uniqueById = (items) => {
  const seenIds = new Set();

  return items.filter((item) => {
    const itemId = item?.id || item?._id;

    if (!itemId) return false;
    if (seenIds.has(String(itemId))) return false;

    seenIds.add(String(itemId));
    return true;
  });
};

export function getStartingPrice(services, barberId) {
  const prices = services
    .filter(
      (service) =>
        String(service.barberId) === String(barberId) && service.active
    )
    .map((service) => Number(service.price))
    .filter(Number.isFinite);

  return prices.length > 0 ? Math.min(...prices) : null;
}

export function getBarberId(barber) {
  return barber?.id || barber?._id;
}

export function mapByBarberId(items = []) {
  return Object.fromEntries(
    items
      .map((item) => [String(item?.barberId || ""), item])
      .filter(([barberId]) => Boolean(barberId))
  );
}

export function getReviewStatsFromReviews(reviews, barberId) {
  const barberReviews = (reviews || []).filter(
    (review) => String(review?.barberId) === String(barberId)
  );
  const total = barberReviews.reduce(
    (sum, review) => sum + Number(review?.rating || 0),
    0
  );
  return {
    average: barberReviews.length > 0 ? total / barberReviews.length : 0,
    count: barberReviews.length,
  };
}

export function getActiveServicesForBarber(services, barberId) {
  return (services || []).filter(
    (service) =>
      String(service?.barberId) === String(barberId) && service?.active
  );
}

export function getUniqueCategories(services) {
  return Array.from(
    new Set(services.map((service) => service?.category || "other"))
  );
}
