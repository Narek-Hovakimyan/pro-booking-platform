import BarberProfile from "../../models/BarberProfile.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import Favorite from "../../models/Favorite.js";
import Review from "../../models/Review.js";
import mongoose from "mongoose";

const PAID_STATUSES = ["trialing", "active"];

// Mirrors validatePersonalWeeklySchedule for BSON data so malformed legacy schedules
// cannot qualify a barber before Mongo applies pagination.
const hasValidWeeklySchedule = function hasValidWeeklySchedule(weeklySchedule) {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  if (!weeklySchedule || Array.isArray(weeklySchedule) || typeof weeklySchedule !== "object") return false;
  if (Object.keys(weeklySchedule).length !== days.length || days.some((day) => !Object.prototype.hasOwnProperty.call(weeklySchedule, day))) return false;
  let workingDays = 0;
  const time = (value, allowEmpty) => typeof value === "string" && (allowEmpty && value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
  for (const dayName of days) {
    const day = weeklySchedule[dayName];
    if (!day || Array.isArray(day) || typeof day !== "object") return false;
    const fields = Object.keys(day);
    if (fields.length !== 5 || ["working", "from", "to", "breakFrom", "breakTo"].some((field) => !Object.prototype.hasOwnProperty.call(day, field))) return false;
    if (typeof day.working !== "boolean") return false;
    if (!day.working) continue;
    if (!time(day.from, false) || !time(day.to, false) || day.to <= day.from) return false;
    if (!time(day.breakFrom, true) || !time(day.breakTo, true) || Boolean(day.breakFrom) !== Boolean(day.breakTo)) return false;
    if (day.breakFrom && (day.breakTo <= day.breakFrom || day.breakFrom < day.from || day.breakTo > day.to)) return false;
    workingDays += 1;
  }
  return workingDays > 0;
};

const unexpiredSubscription = (path, now) => ({
  $or: [
    { $eq: [{ $type: path }, "missing"] },
    { $eq: [path, null] },
    { $and: [{ $eq: [{ $type: path }, "date"] }, { $gte: [path, now] }] },
  ],
});

const validOnboardingState = {
  $and: [
    { $eq: ["$specialistOnboarding.version", 1] },
    { $in: ["$specialistOnboarding.status", ["not_started", "in_progress", "completed"]] },
    { $in: ["$specialistOnboarding.currentStep", ["professional_basics", "workplace", "personal_schedule", "review", null]] },
    { $in: ["$specialistOnboarding.workplace", ["independent", "salon", "both", null]] },
    { $in: [{ $type: "$specialistOnboarding.completedAt" }, ["date", "null"]] },
  ],
};

const activeServiceLookup = (collection) => ({
  $lookup: {
    from: collection,
    let: { barberId: "$_id" },
    pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$barberId", "$$barberId"] }, { $eq: ["$active", true] }] } } }, { $limit: 1 }],
    as: "_activeServices",
  },
});

const normalizeObjectIds = (values) => {
  if (values === undefined) return undefined;
  const source = Array.isArray(values) ? values : [values];
  if (!source.length || source.some((value) => !mongoose.Types.ObjectId.isValid(value))) {
    throw new TypeError("barberIds must contain valid ObjectIds");
  }
  return source.map((value) => new mongoose.Types.ObjectId(value));
};

const normalizeFavoriteClientId = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (!mongoose.Types.ObjectId.isValid(value)) throw new TypeError("favoriteClientId must be a valid ObjectId");
  return new mongoose.Types.ObjectId(value);
};

const textFilter = (value) => typeof value === "string" ? value.trim() : "";
const escapedRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const numberFilter = (value) => value === undefined || value === "" ? null : Number(value);

export const buildPublicBarberDirectoryPipeline = ({ skip, limit, now = new Date(), collections, barberIds, favoriteClientId, name, city, profession, barberType, serviceName, category, serviceSearch, minPrice, maxPrice, discountOnly, rating } = {}) => {
  const names = collections || {
    profiles: BarberProfile.collection.name,
    schedules: Schedule.collection.name,
    services: Service.collection.name,
    subscriptions: Subscription.collection.name,
    seats: SubscriptionSeat.collection.name,
    favorites: Favorite.collection.name,
    reviews: Review.collection.name,
  };
  const requestedBarberIds = normalizeObjectIds(barberIds);
  const favoriteClient = normalizeFavoriteClientId(favoriteClientId);
  const requestedName = textFilter(name);
  const requestedCity = textFilter(city);
  const requestedProfession = textFilter(profession);
  const requestedBarberType = textFilter(barberType);
  const requestedServiceName = textFilter(serviceName);
  const requestedCategory = textFilter(category);
  const requestedSearch = textFilter(serviceSearch);
  const minimumPrice = numberFilter(minPrice);
  const maximumPrice = numberFilter(maxPrice);
  const minimumRating = numberFilter(rating);
  if ((minimumPrice !== null && !Number.isFinite(minimumPrice)) || (maximumPrice !== null && !Number.isFinite(maximumPrice))) throw new TypeError("price filters must be numbers");
  if (minimumRating !== null && !Number.isFinite(minimumRating)) throw new TypeError("rating must be a number");
  const servicePredicates = [];
  if (requestedServiceName) servicePredicates.push({ $eq: ["$name", requestedServiceName] });
  if (requestedCategory) servicePredicates.push({ $eq: [{ $ifNull: ["$category", "other"] }, requestedCategory] });
  if (requestedSearch) { const regex = escapedRegex(requestedSearch); servicePredicates.push({ $or: [{ $regexMatch: { input: { $ifNull: ["$name", ""] }, regex, options: "i" } }, { $regexMatch: { input: { $ifNull: ["$category", "other"] }, regex, options: "i" } }, { $anyElementTrue: { $map: { input: { $ifNull: ["$tags", []] }, as: "tag", in: { $regexMatch: { input: "$$tag", regex, options: "i" } } } } }] }); }
  if (minimumPrice !== null || maximumPrice !== null) servicePredicates.push({ $and: [...(minimumPrice !== null ? [{ $gte: ["$price", minimumPrice] }] : []), ...(maximumPrice !== null ? [{ $lte: ["$price", maximumPrice] }] : [])] });
  if (discountOnly) servicePredicates.push({ $or: [{ $and: [{ $eq: ["$discountType", "fixed"] }, { $gt: ["$discountValue", 0] }, { $gt: ["$price", 0] }] }, { $and: [{ $eq: ["$discountType", "percent"] }, { $gt: ["$discountValue", 0] }, { $gt: [{ $round: [{ $divide: [{ $multiply: ["$price", "$discountValue"] }, 100] }, 0] }, 0] }] }] });
  const candidateMatch = {
    role: "barber",
    ...(requestedBarberIds ? { _id: { $in: requestedBarberIds } } : {}),
    ...(requestedName ? { name: { $regex: escapedRegex(requestedName), $options: "i" } } : {}),
    ...(requestedCity ? { city: requestedCity } : {}),
    ...(requestedProfession ? { profession: requestedProfession } : {}),
    ...(requestedBarberType ? { $expr: { $and: [{ $eq: ["$profession", "barber"] }, { $eq: [{ $ifNull: ["$barberType", { $ifNull: ["$specialty", "unisex"] }] }, requestedBarberType] }] } } : {}),
  };
  const legacyOnboarding = { $eq: [{ $type: "$specialistOnboarding" }, "missing"] };
  const canonicalMemberships = {
    $filter: {
      input: { $ifNull: ["$salons", []] }, as: "membership",
      cond: { $and: [
        { $eq: ["$$membership.status", "approved"] },
        { $ne: ["$$membership.relationshipStatus", "pending"] },
        { $ne: ["$$membership.relationshipStatus", "rejected"] },
        { $ne: ["$$membership.worksAsSpecialist", false] },
      ] },
    },
  };

  return [
    { $match: candidateMatch },
    { $set: { _validOnboarding: validOnboardingState, _legacyOnboarding: legacyOnboarding } },
    { $set: { _onboardingReady: { $or: ["$_legacyOnboarding", { $and: ["$_validOnboarding", { $eq: ["$specialistOnboarding.status", "completed"] }] }] }, _independentSupported: { $or: ["$_legacyOnboarding", { $and: ["$_validOnboarding", { $in: ["$specialistOnboarding.workplace", ["independent", "both"]] }] }] }, _canonicalMemberships: canonicalMemberships } },
    { $set: { _eligibleSalonIds: { $map: { input: "$_canonicalMemberships", as: "membership", in: "$$membership.salon" } } } },
    activeServiceLookup(names.services),
    ...servicePredicates.flatMap((predicate, index) => [{ $lookup: { from: names.services, let: { barberId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$barberId", "$$barberId"] }, { $eq: ["$active", true] }, predicate] } } }, { $limit: 1 }], as: `_serviceFilter${index}` } }, { $match: { $expr: { $gt: [{ $size: `$_serviceFilter${index}` }, 0] } } }]),
    ...(minimumRating !== null ? [{ $lookup: { from: names.reviews, let: { barberId: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$barberId", "$$barberId"] } } }, { $group: { _id: null, average: { $avg: "$rating" } } }], as: "_rating" } }, { $match: { $expr: { $gte: [{ $ifNull: [{ $arrayElemAt: ["$_rating.average", 0] }, 0] }, minimumRating] } } }] : []),
    { $lookup: { from: names.subscriptions, let: { barberId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$ownerType", "barber"] }, { $eq: ["$ownerId", "$$barberId"] }, { $in: ["$status", PAID_STATUSES] }, unexpiredSubscription("$currentPeriodEnd", now)] } } }, { $limit: 1 }], as: "_individualSubscriptions" } },
    { $lookup: { from: names.profiles, let: { barberId: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$barberId", "$$barberId"] } } }, { $project: { address: 1 } }, { $limit: 1 }], as: "_profile" } },
    { $lookup: { from: names.schedules, let: { barberId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$barberId", "$$barberId"] }, { $or: [{ $eq: ["$salonId", null] }, { $eq: [{ $type: "$salonId" }, "missing"] }] }] } } }, { $project: { weeklySchedule: 1 } }, { $limit: 1 }], as: "_schedule" } },
    { $set: { _profile: { $arrayElemAt: ["$_profile", 0] }, _schedule: { $arrayElemAt: ["$_schedule", 0] } } },
    { $set: { _independentReady: { $and: ["$_independentSupported", { $regexMatch: { input: { $ifNull: ["$_profile.address", ""] }, regex: /\S/ } }, { $function: { body: hasValidWeeklySchedule.toString(), args: ["$_schedule.weeklySchedule"], lang: "js" } }] } } },
    { $lookup: { from: names.seats, let: { barberId: "$_id", salons: "$salons", legacySalon: "$salon", legacySalonStatus: "$salonStatus" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$barberId", "$$barberId"] }, { $eq: ["$status", "active"] }] } } },
      { $lookup: { from: names.subscriptions, localField: "subscriptionId", foreignField: "_id", as: "subscription" } },
      { $unwind: "$subscription" },
      { $set: { _seatSalonId: { $ifNull: ["$salonId", "$subscription.ownerId"] } } },
      { $match: { $expr: { $and: [
        { $in: ["$subscription.status", PAID_STATUSES] },
        unexpiredSubscription("$subscription.currentPeriodEnd", now),
        { $let: {
          vars: { matchingMemberships: { $filter: {
            input: { $ifNull: ["$$salons", []] },
            as: "membership",
            cond: { $eq: ["$$membership.salon", "$_seatSalonId"] },
          } } },
          in: { $cond: [
            { $gt: [{ $size: "$$matchingMemberships" }, 0] },
            { $let: {
              // isAcceptedSalonStaffMember uses Array.find, so legacy duplicate
              // entries are evaluated strictly in stored array order.
              vars: { membership: { $arrayElemAt: ["$$matchingMemberships", 0] } },
              in: { $and: [
                { $eq: ["$$membership.status", "approved"] },
                { $eq: [{ $ifNull: ["$$membership.relationshipType", "staff"] }, "staff"] },
                { $eq: [{ $ifNull: ["$$membership.relationshipStatus", "accepted"] }, "accepted"] },
                { $ne: ["$$membership.worksAsSpecialist", false] },
              ] },
            } },
            { $and: [
              { $eq: ["$$legacySalon", "$_seatSalonId"] },
              { $eq: ["$$legacySalonStatus", "approved"] },
            ] },
          ] },
        } },
      ] } } },
      { $limit: 1 },
    ], as: "_eligibleSeats" } },
    { $match: { $expr: { $and: ["$_onboardingReady", { $gt: [{ $size: "$_activeServices" }, 0] }, { $or: [{ $gt: [{ $size: "$_individualSubscriptions" }, 0] }, { $gt: [{ $size: "$_eligibleSeats" }, 0] }] }, { $or: ["$_independentReady", { $gt: [{ $size: "$_eligibleSalonIds" }, 0] }] }] } } },
    ...(favoriteClient ? [{ $lookup: { from: names.favorites, let: { barberId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$clientId", favoriteClient] }, { $eq: ["$barberId", "$$barberId"] }] } } }, { $limit: 1 }], as: "_favorite" } }, { $set: { _favoriteRank: { $cond: [{ $gt: [{ $size: "$_favorite" }, 0] }, 0, 1] } } }] : []),
    { $sort: favoriteClient ? { _favoriteRank: 1, createdAt: 1, _id: 1 } : { createdAt: 1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: { _activeServices: 0, _individualSubscriptions: 0, _profile: 0, _schedule: 0, _eligibleSeats: 0, _canonicalMemberships: 0, _validOnboarding: 0, _legacyOnboarding: 0, _onboardingReady: 0, _independentSupported: 0, _independentReady: 0, _favorite: 0, _favoriteRank: 0, _rating: 0, ...Object.fromEntries(servicePredicates.map((_, index) => [`_serviceFilter${index}`, 0])) } },
  ];
};

export const findPublicBarberDirectoryPage = async (options = {}) =>
  (options.UserModel || User).aggregate(buildPublicBarberDirectoryPipeline(options));
