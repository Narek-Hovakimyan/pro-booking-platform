import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import { sameId } from "../../utils/salonPermissions.js";
import {
  serializeRequest,
  serializeSalon,
} from "../../utils/salonUtils.js";
import { serializeRelationshipFields } from "./salonRelationshipService.js";

const createDefaultSalonEntrySchedule = () => ({
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
});

export const getSalonStatusForBarber = async (barberId) => {
  const barber = await User.findById(barberId);
  const canonicalSalonEntries = Array.isArray(barber?.salons) ? barber.salons : [];
  const hasCanonicalEntryForLegacySalon =
    barber?.salon &&
    canonicalSalonEntries.some((salonEntry) => sameId(salonEntry.salon, barber.salon));

  const approvedSalonEntries = canonicalSalonEntries.filter(
    (salonEntry) => salonEntry.status === "approved"
  );
  const approvedSalonIds = approvedSalonEntries.map((salonEntry) => salonEntry.salon);
  const approvedSalons = approvedSalonIds.length > 0
    ? await Salon.find({ _id: { $in: approvedSalonIds } })
    : [];

  const primaryEntry =
    approvedSalonEntries.find((salonEntry) => salonEntry.isPrimary) ||
    approvedSalonEntries[0];
  const primarySalon = primaryEntry?.salon
    ? approvedSalons.find((salon) => sameId(salon._id, primaryEntry.salon))
    : null;

  const approvedSalon =
    primarySalon ||
    (!hasCanonicalEntryForLegacySalon && barber?.salonStatus === "approved" && barber?.salon
      ? await Salon.findById(barber.salon)
      : null);

  const pendingRequests = await SalonJoinRequest.find({
    barberId,
    status: "pending",
  }).populate("salonId");

  const pendingSalonEntries = canonicalSalonEntries.filter(
    (salonEntry) => salonEntry.status === "pending"
  );
  const pendingSalonIds = pendingSalonEntries.map((salonEntry) => salonEntry.salon);
  const pendingSalons = pendingSalonIds.length > 0
    ? await Salon.find({ _id: { $in: pendingSalonIds } })
    : [];

  const enrichedPendingEntries = pendingSalonEntries.map((entry) => {
    const salonData = pendingSalons.find((salon) => sameId(salon._id, entry.salon));
    const request = pendingRequests.find((pendingRequest) =>
      sameId(pendingRequest.salonId?._id || pendingRequest.salonId, entry.salon)
    );

    return {
      ...(salonData ? serializeSalon(salonData) : { id: entry.salon }),
      status: entry.status,
      isPrimary: entry.isPrimary,
      joinedAt: entry.joinedAt,
      requestId: request?._id || request?.id,
    };
  });

  const managedSalons = await Salon.find({
    $or: [{ ownerId: barberId }, { admins: barberId }],
  }).sort({ createdAt: -1 });

  const enrichedApprovedEntries = approvedSalonEntries.map((entry) => {
    const salonData = approvedSalons.find((salon) => sameId(salon._id, entry.salon));

    return {
      ...(salonData ? serializeSalon(salonData) : { id: entry.salon }),
      status: entry.status,
      isPrimary: entry.isPrimary,
      joinedAt: entry.joinedAt,
      defaultSchedule: entry.defaultSchedule || createDefaultSalonEntrySchedule(),
      ...serializeRelationshipFields(entry),
    };
  });

  const primaryPendingRequest = pendingRequests.length > 0
    ? serializeRequest(pendingRequests[0])
    : null;

  return {
    salonStatus:
      primarySalon
        ? "approved"
        : pendingSalonEntries.length > 0
          ? "pending"
          : canonicalSalonEntries.some((salonEntry) => salonEntry.status === "rejected")
            ? "rejected"
            : barber?.salonStatus || "none",
    salon: serializeSalon(approvedSalon),
    salons: enrichedApprovedEntries,
    pendingEntries: enrichedPendingEntries,
    pendingRequest: primaryPendingRequest,
    ownedSalons: managedSalons.map(serializeSalon),
    managedSalons: managedSalons.map(serializeSalon),
  };
};
