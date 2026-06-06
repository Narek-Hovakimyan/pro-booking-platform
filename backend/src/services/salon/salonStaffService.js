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
    };
  });

  return staff;
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
