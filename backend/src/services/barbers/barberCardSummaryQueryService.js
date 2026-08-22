import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import Review from "../../models/Review.js";
import Salon from "../../models/Salon.js";
import Service, { SERVICE_CATEGORIES } from "../../models/Service.js";
import { findPublicBarberDirectoryPage } from "../users/publicBarberDirectoryQueryService.js";
import { getArmeniaDateKey } from "../../utils/bookingDateTime.js";
import { getTodayFirstAvailableSlot } from "../../utils/barberCardAvailability.js";
import { serializePublicBarberCard } from "../../utils/publicBarberSerializer.js";
import { getPublicBarberReadinessByIds } from "../barber/publicBarberReadinessService.js";
import {
  getPublicAvailabilitySchedule,
  getPublicAvailabilityScheduleMaps,
} from "../barber/publicAvailabilityContextService.js";

const DIRECTORY_QUERY_KEYS = ["page", "limit", "barberIds", "ids", "name", "city", "profession", "barberType", "minPrice", "maxPrice", "rating", "discountOnly"];
const getId = (value) => String(value?._id || value?.id || value || "");
const plain = (value) => value?.toObject?.() || value || {};
const toArray = async (query) => query?.lean ? query.lean() : query || [];
const text = (value) => typeof value === "string" ? value.trim() : "";
const normalized = (value) => text(value).toLowerCase();

export class BarberCardSummaryQueryError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

export const isPaginatedCardSummaryRequest = (query = {}) =>
  DIRECTORY_QUERY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(query || {}, key) && (key === "barberIds" || key === "ids" || query[key] !== ""));

const positiveInteger = (value, field, fallback) => {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) throw new BarberCardSummaryQueryError(`Invalid ${field}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BarberCardSummaryQueryError(`Invalid ${field}`);
  return parsed;
};

const idValues = (value) => (Array.isArray(value) ? value : [value])
  .flatMap((item) => typeof item === "string" ? item.split(",") : [item])
  .map((item) => typeof item === "string" ? item.trim() : item)
  .filter((item) => item !== "" && item !== undefined);

export const parseCardSummaryDirectoryQuery = (query = {}, user) => {
  const category = text(query.category);
  if (category && !SERVICE_CATEGORIES.includes(category)) throw new BarberCardSummaryQueryError("Invalid service category");
  const rawIds = query.barberIds ?? query.ids;
  const barberIds = rawIds === undefined ? undefined : idValues(rawIds);
  const page = positiveInteger(query.page, "page", 1);
  const limit = positiveInteger(query.limit, "limit", barberIds?.length || 20);
  if (limit > 100) throw new BarberCardSummaryQueryError("Invalid limit");
  const discountOnly = query.discountOnly === undefined || query.discountOnly === ""
    ? undefined
    : query.discountOnly === true || query.discountOnly === "true" || query.discountOnly === "1";

  return {
    skip: (page - 1) * limit,
    limit,
    barberIds,
    favoriteClientId: user?._id || undefined,
    name: text(query.name), city: text(query.city), profession: text(query.profession), barberType: text(query.barberType),
    serviceName: text(query.serviceName), category, serviceSearch: text(query.serviceSearch),
    minPrice: query.minPrice, maxPrice: query.maxPrice, discountOnly, rating: query.rating,
  };
};

const groupByBarber = (items = []) => items.reduce((result, item) => {
  const id = getId(item?.barberId);
  if (id) result.set(id, [...(result.get(id) || []), { ...plain(item), id: plain(item).id || plain(item)._id }]);
  return result;
}, new Map());

const reviewStats = (reviews = []) => reviews.reduce((result, review) => {
  const id = getId(review?.barberId);
  if (!id) return result;
  const current = result.get(id) || { total: 0, count: 0 };
  current.total += Number(review?.rating || 0);
  current.count += 1;
  result.set(id, current);
  return result;
}, new Map());

const approvedSalons = (barber, salonsById, eligibleIds) => (Array.isArray(barber?.salons) ? barber.salons : [])
  .filter((entry) => entry?.status === "approved" && eligibleIds?.has(getId(entry.salon)))
  .map((entry) => {
    const salon = salonsById.get(getId(entry.salon));
    if (!salon) return null;
    const item = plain(salon);
    return { ...item, id: item.id || item._id || getId(entry.salon), salon: { ...item, id: item.id || item._id }, status: entry.status, isPrimary: Boolean(entry.isPrimary), joinedAt: entry.joinedAt, defaultSchedule: entry.defaultSchedule || {} };
  })
  .filter(Boolean);

const discoveryMatches = (service, filters) => {
  if (!service?.active) return false;
  const matchesCategory = !filters.category || normalized(service.category || "other") === filters.category;
  const search = filters.search;
  const tags = Array.isArray(service.tags) ? service.tags.map(normalized) : [];
  return matchesCategory && (!search || normalized(service.name).includes(search) || normalized(service.category || "other").includes(search) || tags.some((tag) => tag.includes(search)));
};

export const getPaginatedBarberCardSummary = async ({ query = {}, user, dependencies = {} } = {}) => {
  const options = parseCardSummaryDirectoryQuery(query, user);
  const directory = dependencies.findDirectory || findPublicBarberDirectoryPage;
  const models = dependencies.models || { BarberProfile, Salon, Service, Review, Booking };
  const loadReadiness = dependencies.getReadiness || getPublicBarberReadinessByIds;
  const loadSchedules = dependencies.getScheduleMaps || getPublicAvailabilityScheduleMaps;
  const barbers = await directory(options);
  const barberIds = barbers.map((barber) => barber._id).filter(Boolean);
  if (!barberIds.length) return { barbers: [], services: [], reviewStats: [], availability: [] };

  const readinessById = await loadReadiness(barberIds);
  const salonIds = [...new Set(barbers.flatMap((barber) => [...(readinessById.get(getId(barber._id))?.eligibleSalonIds || [])].map(String)))];
  const todayKey = getArmeniaDateKey(new Date());
  const [profiles, salons, services, reviews, bookings] = await Promise.all([
    toArray(models.BarberProfile.find({ barberId: { $in: barberIds } })),
    toArray(models.Salon.find({ _id: { $in: salonIds } })),
    models.Service.find({ barberId: { $in: barberIds }, active: true }).populate({ path: "customCategoryId", match: { active: true }, select: "_id name ownerType ownerId sortOrder" }).lean(),
    toArray(models.Review.find({ barberId: { $in: barberIds } })),
    toArray(models.Booking.find({ barberId: { $in: barberIds }, $or: [{ bookingDate: todayKey }, { dayKey: todayKey }] })),
  ]);
  const schedulesById = await loadSchedules({ barbers, readinessByBarberId: readinessById, includeIndependent: true });
  const profilesById = new Map(profiles.map((profile) => [getId(profile.barberId), profile]));
  const salonsById = new Map(salons.map((salon) => [getId(salon._id), salon]));
  const servicesById = groupByBarber(services);
  const bookingsById = groupByBarber(bookings);
  const statsById = reviewStats(reviews);
  const filters = { category: normalized(query.category), search: normalized(query.serviceSearch || query.serviceName) };
  const hasDiscoveryFilters = Boolean(filters.category || filters.search);
  const response = { barbers: [], services: [], reviewStats: [], availability: [] };

  for (const barber of barbers) {
    const barberId = getId(barber._id);
    const readiness = readinessById.get(barberId);
    if (!readiness?.publicReady) continue;
    const barberServices = servicesById.get(barberId) || [];
    const matchedServices = hasDiscoveryFilters ? barberServices.filter((service) => discoveryMatches(service, filters)) : barberServices;
    const salonEntries = approvedSalons(barber, salonsById, readiness.eligibleSalonIds);
    const primarySalon = salonEntries.find((salon) => salon.isPrimary) || salonEntries[0] || null;
    const scheduleMap = schedulesById.get(barberId) || new Map();
    const contexts = [];
    if (readiness.independentReady) {
      const schedule = getPublicAvailabilitySchedule(scheduleMap, null);
      if (schedule) contexts.push({ salonId: null, salonName: "", schedule });
    }
    for (const salon of salonEntries) {
      const schedule = getPublicAvailabilitySchedule(scheduleMap, salon.id);
      if (schedule) contexts.push({ salonId: salon.id, salonName: salon.name || "", schedule });
    }
    const availability = getTodayFirstAvailableSlot({ contexts, services: hasDiscoveryFilters ? matchedServices : barberServices, bookings: bookingsById.get(barberId) || [] });
    const stats = statsById.get(barberId) || { total: 0, count: 0 };
    response.barbers.push(serializePublicBarberCard({ barber, profile: profilesById.get(barberId), salonName: primarySalon?.name || "", salon: primarySalon, salons: salonEntries, approvedSalons: salonEntries, primarySalon }));
    response.services.push(...barberServices);
    response.reviewStats.push({ barberId, average: stats.count ? stats.total / stats.count : 0, count: stats.count });
    response.availability.push({ barberId, status: availability.status, firstAvailableSlot: availability.firstAvailableSlot, reason: availability.reason });
  }
  return response;
};
