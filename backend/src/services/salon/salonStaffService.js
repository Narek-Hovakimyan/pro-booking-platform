import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { sameId } from "../../utils/salonPermissions.js";
import { syncLegacySalonFields } from "../../utils/salonHelpers.js";
import {
  getRelationshipStatus,
  getRelationshipType,
  relationshipStatuses,
  relationshipTypes,
  serializeRelationshipFields,
} from "./salonRelationshipService.js";

const paymentTypes = new Set(["none", "commission", "fixed"]);
const fixedPeriods = new Set(["daily", "weekly", "monthly"]);

const emptyStaffPayment = () => ({
  type: "none",
  commissionStaffPercent: undefined,
  commissionSalonPercent: undefined,
  fixedAmount: undefined,
  fixedPeriod: undefined,
  notes: "",
});

const finiteNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const serializeStaffPayment = (staffPayment) => {
  const payment = staffPayment?.toObject?.() || staffPayment || {};
  return {
    type: payment.type || "none",
    commissionStaffPercent: payment.commissionStaffPercent ?? null,
    commissionSalonPercent: payment.commissionSalonPercent ?? null,
    fixedAmount: payment.fixedAmount ?? null,
    fixedPeriod: payment.fixedPeriod || "",
    notes: payment.notes || "",
    updatedAt: payment.updatedAt || null,
    updatedBy: payment.updatedBy || null,
  };
};

const normalizeStaffPayment = (staffPayment, updatedBy) => {
  const incoming = staffPayment || {};
  const type = incoming.type || "none";
  const notes = String(incoming.notes || "").trim();

  if (!paymentTypes.has(type)) {
    throw new SalonStaffError(400, "staffPayment.type is invalid");
  }

  if (notes.length > 500) {
    throw new SalonStaffError(400, "staffPayment.notes must be 500 characters or fewer");
  }

  if (type === "none") {
    return {
      ...emptyStaffPayment(),
      notes,
      updatedAt: new Date(),
      updatedBy,
    };
  }

  if (type === "commission") {
    const commissionStaffPercent = finiteNumber(incoming.commissionStaffPercent);
    const commissionSalonPercent = finiteNumber(incoming.commissionSalonPercent);

    if (commissionStaffPercent === null || commissionSalonPercent === null) {
      throw new SalonStaffError(400, "Commission split requires staff and salon percentages");
    }

    if (
      commissionStaffPercent < 0 ||
      commissionStaffPercent > 100 ||
      commissionSalonPercent < 0 ||
      commissionSalonPercent > 100
    ) {
      throw new SalonStaffError(400, "Commission percentages must be between 0 and 100");
    }

    if (commissionStaffPercent + commissionSalonPercent !== 100) {
      throw new SalonStaffError(400, "Commission percentages must add up to 100");
    }

    return {
      type,
      commissionStaffPercent,
      commissionSalonPercent,
      fixedAmount: undefined,
      fixedPeriod: undefined,
      notes,
      updatedAt: new Date(),
      updatedBy,
    };
  }

  const fixedAmount = finiteNumber(incoming.fixedAmount);
  const fixedPeriod = incoming.fixedPeriod || "";

  if (fixedAmount === null || fixedAmount <= 0) {
    throw new SalonStaffError(400, "Fixed pay requires an amount greater than 0");
  }

  if (!fixedPeriods.has(fixedPeriod)) {
    throw new SalonStaffError(400, "Fixed pay requires a valid period");
  }

  return {
    type,
    commissionStaffPercent: undefined,
    commissionSalonPercent: undefined,
    fixedAmount,
    fixedPeriod,
    notes,
    updatedAt: new Date(),
    updatedBy,
  };
};

const getApprovedSalonEntry = (user, salonId) => {
  const approvedEntry = (user?.salons || []).find(
    (entry) => sameId(entry?.salon, salonId) && entry?.status === "approved"
  );

  if (approvedEntry) {
    return approvedEntry;
  }

  if (user?.salonStatus === "approved" && sameId(user?.salon, salonId)) {
    return {
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
      isPrimary: true,
    };
  }

  return null;
};

export class SalonStaffError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "SalonStaffError";
    this.statusCode = statusCode;
  }
}

/**
 * Get staff list for a salon.
 * Only approved salon members, salon owner, and salon admins can view.
 * Returns approved staff only, enriched with BarberProfile data.
 * Excludes private fields (email, phone, password, workHistory, etc.).
 */
export const getSalonStaff = async (salonId, requestingUserId) => {
  const salon = await Salon.findById(salonId);

  if (!salon) {
    throw new SalonStaffError(404, "Salon not found");
  }

  // Permission check: must be approved member, salon owner, or salon admin
  const requester = await User.findById(requestingUserId);

  if (!requester || requester.role !== "barber") {
    throw new SalonStaffError(403, "Only barbers can view salon staff");
  }

  const isOwner = sameId(salon.ownerId, requestingUserId);
  const isAdmin = Array.isArray(salon.admins) &&
    salon.admins.some((adminId) => sameId(adminId, requestingUserId));
  const isApprovedMember = (requester.salons || []).some(
    (s) => s.salon?.toString() === salonId.toString() && s.status === "approved"
  ) || (
    requester.salonStatus === "approved" && sameId(requester.salon, salonId)
  );

  if (!isOwner && !isAdmin && !isApprovedMember) {
    throw new SalonStaffError(403, "You are not a member of this salon");
  }

  // Query approved staff: new salons array OR legacy fields
  const staffUsers = await User.find({
    role: "barber",
    $or: [
      { "salons.salon": salon._id, "salons.status": "approved" },
      { salon: salon._id, salonStatus: "approved" },
    ],
  }).select("name avatarUrl specialty profession barberType city role salons salon salonStatus");

  // Enrich with BarberProfile data
  const profiles = await BarberProfile.find({
    barberId: { $in: staffUsers.map((u) => u._id) },
  });
  const profilesByBarberId = new Map(
    profiles.map((p) => [String(p.barberId), p])
  );

  const staff = staffUsers.map((user) => {
    const profile = profilesByBarberId.get(String(user._id));
    const approvedSalonEntry = getApprovedSalonEntry(user, salonId);

    if (approvedSalonEntry?.worksAsSpecialist === false) {
      return null;
    }

    // Determine role in salon
    let roleInSalon = "staff";
    if (sameId(salon.ownerId, user._id)) {
      roleInSalon = "owner";
    } else if (
      Array.isArray(salon.admins) &&
      salon.admins.some((adminId) => sameId(adminId, user._id))
    ) {
      roleInSalon = "admin";
    }

    return {
      id: user._id,
      name: user.name,
      avatarUrl: user.avatarUrl || "",
      imageUrl: profile?.imageUrl || user.avatarUrl || "",
      profession: user.profession || "barber",
      barberType: user.barberType || "",
      specialty: user.specialty || "unisex",
      city: profile?.city || user.city || "",
      bio: profile?.bio || "",
      roleInSalon,
      ...serializeRelationshipFields(approvedSalonEntry),
      ...(isOwner || isAdmin
        ? { staffPayment: serializeStaffPayment(approvedSalonEntry?.staffPayment) }
        : {}),
    };
  }).filter(Boolean);

  return staff;
};

export const updateSalonStaffPaymentSettings = async (
  salonId,
  barberId,
  requestingUserId,
  staffPayment
) => {
  const salon = await Salon.findById(salonId);

  if (!salon) {
    throw new SalonStaffError(404, "Salon not found");
  }

  const requester = await User.findById(requestingUserId).select("_id role");

  if (!requester || requester.role !== "barber") {
    throw new SalonStaffError(403, "Only barbers can manage salon staff payment settings");
  }

  const isOwner = sameId(salon.ownerId, requestingUserId);
  const isAdmin =
    Array.isArray(salon.admins) &&
    salon.admins.some((adminId) => sameId(adminId, requestingUserId));

  if (!isOwner && !isAdmin) {
    throw new SalonStaffError(
      403,
      "Only salon owner or admin can update staff payment settings"
    );
  }

  const barber = await User.findById(barberId);

  if (!barber || barber.role !== "barber") {
    throw new SalonStaffError(404, "Barber not found");
  }

  if (sameId(salon.ownerId, barber._id)) {
    throw new SalonStaffError(
      400,
      "Salon owner cannot receive staff payment settings"
    );
  }

  const salonEntry = (barber.salons || []).find((entry) =>
    sameId(entry?.salon, salon._id)
  );

  if (!salonEntry || salonEntry.status !== "approved") {
    throw new SalonStaffError(
      400,
      "Barber must be an approved member of this salon"
    );
  }

  if (getRelationshipType(salonEntry) !== "staff") {
    throw new SalonStaffError(
      400,
      "Staff payment settings apply only to staff members"
    );
  }

  salonEntry.staffPayment = normalizeStaffPayment(staffPayment, requestingUserId);
  await barber.save();

  return {
    id: barber._id,
    name: barber.name,
    staffPayment: serializeStaffPayment(salonEntry.staffPayment),
  };
};

export const updateSalonMemberRelationshipType = async (
  salonId,
  barberId,
  requestingUserId,
  relationshipType
) => {
  if (!relationshipTypes.has(relationshipType)) {
    throw new SalonStaffError(
      400,
      "relationshipType must be either staff or chair_renter"
    );
  }

  const salon = await Salon.findById(salonId);

  if (!salon) {
    throw new SalonStaffError(404, "Salon not found");
  }

  const requester = await User.findById(requestingUserId).select("_id role");

  if (!requester || requester.role !== "barber") {
    throw new SalonStaffError(403, "Only barbers can manage salon members");
  }

  const isOwner = sameId(salon.ownerId, requestingUserId);
  const isAdmin =
    Array.isArray(salon.admins) &&
    salon.admins.some((adminId) => sameId(adminId, requestingUserId));

  if (!isOwner && !isAdmin) {
    throw new SalonStaffError(
      403,
      "Only salon owner or admin can update relationship type"
    );
  }

  const barber = await User.findById(barberId);

  if (!barber || barber.role !== "barber") {
    throw new SalonStaffError(404, "Barber not found");
  }

  if (sameId(salon.ownerId, barber._id)) {
    throw new SalonStaffError(
      400,
      "Salon owner relationship type cannot be changed"
    );
  }

  barber.salons = Array.isArray(barber.salons) ? barber.salons : [];

  const salonEntryIndex = barber.salons.findIndex((entry) =>
    sameId(entry?.salon, salon._id)
  );

  if (salonEntryIndex >= 0) {
    const salonEntry = barber.salons[salonEntryIndex];

    if (salonEntry?.status !== "approved") {
      throw new SalonStaffError(
        400,
        "Barber must be an approved member of this salon"
      );
    }

    barber.salons[salonEntryIndex].relationshipType = relationshipType;
    barber.salons[salonEntryIndex].relationshipStatus = "pending";
    barber.salons[salonEntryIndex].relationshipRequestedBy = requestingUserId;
    barber.salons[salonEntryIndex].relationshipRequestedAt = new Date();
    barber.salons[salonEntryIndex].relationshipRespondedAt = null;
  } else if (barber.salonStatus === "approved" && sameId(barber.salon, salon._id)) {
    barber.salons.push({
      salon: salon._id,
      status: "approved",
      isPrimary: true,
      relationshipType,
      relationshipStatus: "pending",
      relationshipRequestedBy: requestingUserId,
      relationshipRequestedAt: new Date(),
      relationshipRespondedAt: null,
      defaultSchedule: {},
    });
  } else {
    throw new SalonStaffError(
      400,
      "Barber must be an approved member of this salon"
    );
  }

  syncLegacySalonFields(barber);
  await barber.save();

  return {
    id: barber._id,
    name: barber.name,
    relationshipType,
    relationshipStatus: "pending",
  };
};

export const respondToSalonMemberRelationshipType = async (
  salonId,
  barberId,
  response
) => {
  if (!relationshipStatuses.has(response) || response === "pending") {
    throw new SalonStaffError(400, "response must be accepted or rejected");
  }

  const salon = await Salon.findById(salonId);

  if (!salon) {
    throw new SalonStaffError(404, "Salon not found");
  }

  const barber = await User.findById(barberId);

  if (!barber || barber.role !== "barber") {
    throw new SalonStaffError(404, "Barber not found");
  }

  barber.salons = Array.isArray(barber.salons) ? barber.salons : [];
  let salonEntry = barber.salons.find((entry) => sameId(entry?.salon, salon._id));

  if (!salonEntry && barber.salonStatus === "approved" && sameId(barber.salon, salon._id)) {
    salonEntry = {
      salon: salon._id,
      status: "approved",
      isPrimary: true,
      relationshipType: "staff",
      relationshipStatus: "accepted",
      defaultSchedule: {},
    };
    barber.salons.push(salonEntry);
  }

  if (!salonEntry || salonEntry.status !== "approved") {
    throw new SalonStaffError(
      400,
      "You must be an approved member of this salon"
    );
  }

  if (getRelationshipStatus(salonEntry) !== "pending") {
    throw new SalonStaffError(400, "No pending relationship request");
  }

  salonEntry.relationshipStatus = response;
  salonEntry.relationshipRespondedAt = new Date();

  syncLegacySalonFields(barber);
  await barber.save();

  return {
    id: barber._id,
    name: barber.name,
    relationshipType: getRelationshipType(salonEntry),
    relationshipStatus: response,
  };
};
