import mongoose from "mongoose";
import User from "../../models/User.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import { isWorkingSpecialist } from "../salon/salonRelationshipService.js";
import { SAFE_BARBER_SEAT_FIELDS } from "./platformBillingConstants.js";
import { getIdString } from "./platformBillingCalculations.js";

const getMatchingSalonEntries = (barber, salonId) =>
  (barber.salons || []).filter((s) => getIdString(s.salon) === salonId);

const isExplicitAcceptedWorkingSpecialist = (membership) =>
  membership?.status === "approved" &&
  membership.relationshipType === "staff" &&
  membership.worksAsSpecialist === true &&
  isWorkingSpecialist(membership);

const isAcceptedWorkingSpecialistForSalon = (barber, salonId) => {
  const salonEntries = getMatchingSalonEntries(barber, salonId);
  if (salonEntries.length > 0) {
    return salonEntries.every((entry) => isExplicitAcceptedWorkingSpecialist(entry));
  }

  return getIdString(barber.salon) === salonId && barber.salonStatus === "approved";
};

export const getAcceptedStaffBarbersForSalon = async (salonId) => {
  const stringId = getIdString(salonId);

  const barbers = await User.find({
    role: "barber",
    $or: [
      {
        "salons.salon": new mongoose.Types.ObjectId(stringId),
        "salons.status": "approved",
      },
      {
        salon: new mongoose.Types.ObjectId(stringId),
        salonStatus: "approved",
      },
    ],
  })
    .select(SAFE_BARBER_SEAT_FIELDS)
    .lean();

  return barbers.filter((barber) => isAcceptedWorkingSpecialistForSalon(barber, stringId));
};

export const isBarberAcceptedStaffForSalon = async (barberId, salonId) => {
  const stringId = getIdString(salonId);
  const barber = await User.findById(barberId)
    .select("_id role barberType salons salon salonStatus")
    .lean();

  if (!barber || barber.role !== "barber") return false;

  return isAcceptedWorkingSpecialistForSalon(barber, stringId);
};

export const isBarberChairRenterForSalon = async (barberId, salonId) => {
  const stringId = getIdString(salonId);
  const barber = await User.findById(barberId)
    .select("_id role barberType salons salon salonStatus")
    .lean();

  if (!barber || barber.role !== "barber") return false;

  const salonEntry = (barber.salons || []).find(
    (s) => getIdString(s.salon) === stringId && s.status === "approved"
  );
  if (salonEntry && salonEntry.relationshipType === "chair_renter") return true;

  return false;
};

export const getSeatUsageForSalon = async (salonId, subscriptionId) => {
  if (!subscriptionId) {
    return { total: 0, used: 0, available: 0, assignments: [] };
  }

  const activeSeats = await SubscriptionSeat.find({
    subscriptionId,
    status: "active",
  })
    .populate("barberId", SAFE_BARBER_SEAT_FIELDS)
    .lean();

  // Filter to only accepted staff (reuses existing logic from subscriptionService)
  const acceptedStaffIds = new Set();
  const allStaffInSalon = await getAcceptedStaffBarbersForSalon(salonId);
  for (const barber of allStaffInSalon) {
    acceptedStaffIds.add(getIdString(barber._id));
  }

  const filteredSeats = [];
  for (const seat of activeSeats) {
    const barberId = getIdString(seat.barberId?._id || seat.barberId);
    if (acceptedStaffIds.has(barberId)) {
      filteredSeats.push(seat);
    }
  }

  // Sanitize barber data in seats
  const assignments = filteredSeats.map((seat) => {
    const barber = seat.barberId || {};
    const safeBarber = typeof barber === "object" && barber._id
      ? { id: barber._id, name: barber.name, avatarUrl: barber.avatarUrl, email: barber.email }
      : { id: barber };
    return {
      barber: safeBarber,
      assignedAt: seat.assignedAt,
      status: seat.status,
    };
  });

  return {
    total: 0, // Will be set by caller from subscription.seatCount
    used: filteredSeats.length,
    available: 0, // Will be computed by caller
    assignments,
  };
};
