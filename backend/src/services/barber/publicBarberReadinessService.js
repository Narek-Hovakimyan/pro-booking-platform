import BarberProfile from "../../models/BarberProfile.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import User from "../../models/User.js";
import { validatePersonalWeeklySchedule } from "../../utils/personalScheduleUtils.js";
import { classifySpecialistOnboardingState } from "../../utils/specialistOnboardingState.js";

const idOf = (value) => String(value?._id || value?.id || value || "");
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const executeQuery = async (query, projection) => {
  const selected = typeof query?.select === "function" ? query.select(projection) : query;
  const lean = typeof selected?.lean === "function" ? selected.lean() : selected;
  return await lean;
};
const isOnboardingReady = (user) => {
  const state = classifySpecialistOnboardingState(user);
  return state.kind === "legacy" || (state.kind === "valid" && state.state.status === "completed");
};
const hasValidPersonalSchedule = (schedule) => {
  try { validatePersonalWeeklySchedule(schedule?.weeklySchedule); return true; } catch { return false; }
};

export const getPublicBarberReadinessByIds = async (barberIds) => {
  const ids = [...new Set((barberIds || []).map(idOf).filter(Boolean))];
  if (!ids.length) return new Map();
  const [barbers, profiles, schedules, activeServices] = await Promise.all([
    executeQuery(User.find({ _id: { $in: ids }, role: "barber" }), "_id specialistOnboarding salons role"),
    executeQuery(BarberProfile.find({ barberId: { $in: ids } }), "barberId address"),
    executeQuery(Schedule.find({ barberId: { $in: ids }, salonId: null }), "barberId weeklySchedule"),
    executeQuery(Service.find({ barberId: { $in: ids }, active: true }), "barberId"),
  ]);
  const profilesById = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [idOf(profile.barberId), profile]));
  const schedulesById = new Map((Array.isArray(schedules) ? schedules : []).map((schedule) => [idOf(schedule.barberId), schedule]));
  const activeIds = new Set((Array.isArray(activeServices) ? activeServices : []).map((service) => idOf(service.barberId)));
  const result = new Map();
  for (const barber of Array.isArray(barbers) ? barbers : []) {
    const barberId = idOf(barber);
    const state = classifySpecialistOnboardingState(barber);
    const onboardingReady = isOnboardingReady(barber);
    const hasActiveService = activeIds.has(barberId);
    const independentSupported =
      state.kind === "legacy" ||
      (state.kind === "valid" && state.state.workplace === "independent");
    const independentReady = independentSupported && nonEmpty(profilesById.get(barberId)?.address) && hasValidPersonalSchedule(schedulesById.get(barberId));
    const eligibleSalonIds = new Set((Array.isArray(barber.salons) ? barber.salons : [])
      .filter((membership) => membership?.status === "approved" && membership?.relationshipStatus !== "pending" && membership?.relationshipStatus !== "rejected" && membership?.worksAsSpecialist === true)
      .map((membership) => idOf(membership.salon)).filter(Boolean));
    result.set(barberId, { onboardingReady, hasActiveService, independentReady, eligibleSalonIds,
      publicReady: onboardingReady && hasActiveService && (independentReady || eligibleSalonIds.size > 0) });
  }
  return result;
};

export const getPublicBarberReadiness = async (barberId) =>
  (await getPublicBarberReadinessByIds([barberId])).get(idOf(barberId)) ||
  { onboardingReady: false, hasActiveService: false, independentReady: false, eligibleSalonIds: new Set(), publicReady: false };
