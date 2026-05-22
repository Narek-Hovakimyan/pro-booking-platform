import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { sameId } from "../../utils/salonPermissions.js";

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
    };
  });

  return staff;
};
