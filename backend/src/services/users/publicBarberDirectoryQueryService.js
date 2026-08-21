import BarberProfile from "../../models/BarberProfile.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";

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

export const buildPublicBarberDirectoryPipeline = ({ skip, limit, now = new Date(), collections } = {}) => {
  const names = collections || {
    profiles: BarberProfile.collection.name,
    schedules: Schedule.collection.name,
    services: Service.collection.name,
    subscriptions: Subscription.collection.name,
    seats: SubscriptionSeat.collection.name,
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
    { $match: { role: "barber" } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $set: { _validOnboarding: validOnboardingState, _legacyOnboarding: legacyOnboarding } },
    { $set: { _onboardingReady: { $or: ["$_legacyOnboarding", { $and: ["$_validOnboarding", { $eq: ["$specialistOnboarding.status", "completed"] }] }] }, _independentSupported: { $or: ["$_legacyOnboarding", { $and: ["$_validOnboarding", { $in: ["$specialistOnboarding.workplace", ["independent", "both"]] }] }] }, _canonicalMemberships: canonicalMemberships } },
    { $set: { _eligibleSalonIds: { $map: { input: "$_canonicalMemberships", as: "membership", in: "$$membership.salon" } } } },
    activeServiceLookup(names.services),
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
    { $skip: skip },
    { $limit: limit },
    { $project: { _activeServices: 0, _individualSubscriptions: 0, _profile: 0, _schedule: 0, _eligibleSeats: 0, _canonicalMemberships: 0, _validOnboarding: 0, _legacyOnboarding: 0, _onboardingReady: 0, _independentSupported: 0, _independentReady: 0 } },
  ];
};

export const findPublicBarberDirectoryPage = async ({ skip, limit, now, UserModel = User, collections } = {}) =>
  UserModel.aggregate(buildPublicBarberDirectoryPipeline({ skip, limit, now, collections }));
