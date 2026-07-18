import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import { sameId } from "../../utils/salonPermissions.js";
import { serializePublicSalon } from "../../utils/salonUtils.js";

const createDefaultSalonEntrySchedule = () => ({
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
});

const getEntrySalonId = (entry) => entry?.salon?._id || entry?.salon;

const getRequestSalonId = (request) =>
  request?.salonId?._id || request?.salonId;

const toPublicSalon = (salon) => {
  if (!salon || typeof salon !== "object") return null;
  return serializePublicSalon(salon);
};

const serializeSalonState = ({ salonId, status, salon }) => ({
  salonId,
  status,
  salon: toPublicSalon(salon),
});

const serializePendingRequestSummary = (request) => {
  if (!request) return null;
  const salon = toPublicSalon(request.salonId);

  return {
    status: request.status,
    salonName: salon?.name || "",
    salon,
  };
};

const serializeSalonEntrySummary = (entry, salonData, extra = {}) => ({
  ...toPublicSalon(salonData || { _id: entry.salon }),
  status: entry.status,
  isPrimary: entry.isPrimary,
  joinedAt: entry.joinedAt,
  ...extra,
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

  const joinRequests = await SalonJoinRequest.find({ barberId })
    .populate("salonId")
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 });

  const latestRequestsBySalonId = new Map();
  joinRequests.forEach((request) => {
    const salonId = getRequestSalonId(request);
    if (salonId && !latestRequestsBySalonId.has(String(salonId))) {
      latestRequestsBySalonId.set(String(salonId), request);
    }
  });

  const authoritativePendingRequests = joinRequests.filter((request) => {
    const salonId = getRequestSalonId(request);
    if (!salonId) return false;
    return (
      latestRequestsBySalonId.get(String(salonId)) === request &&
      request.status === "pending" &&
      !approvedSalonEntries.some((approved) => sameId(approved.salon, salonId))
    );
  });

  const pendingSalonEntries = canonicalSalonEntries.filter((salonEntry) => {
    if (salonEntry.status !== "pending") return false;
    if (approvedSalonEntries.some((approved) => sameId(approved.salon, salonEntry.salon))) {
      return false;
    }
    const latestRequest = latestRequestsBySalonId.get(String(salonEntry.salon));
    return !latestRequest || latestRequest.status === "pending";
  });
  const pendingSalonIds = pendingSalonEntries.map((salonEntry) => salonEntry.salon);
  const pendingSalons = pendingSalonIds.length > 0
    ? await Salon.find({ _id: { $in: pendingSalonIds } })
    : [];

  const enrichedPendingEntries = pendingSalonEntries.map((entry) => {
    const salonData = pendingSalons.find((salon) => sameId(salon._id, entry.salon));
    return serializeSalonEntrySummary(entry, salonData);
  });

  const managedSalons = await Salon.find({
    $or: [{ ownerId: barberId }, { admins: barberId }],
  }).sort({ createdAt: -1 });

  const enrichedApprovedEntries = approvedSalonEntries.map((entry) => {
    const salonData = approvedSalons.find((salon) => sameId(salon._id, entry.salon));

    return serializeSalonEntrySummary(entry, salonData, {
      defaultSchedule: entry.defaultSchedule || createDefaultSalonEntrySchedule(),
    });
  });

  const primaryPendingRequest = authoritativePendingRequests.length > 0
    ? serializePendingRequestSummary(authoritativePendingRequests[0])
    : null;

  const canonicalBySalonId = new Map();
  canonicalSalonEntries.forEach((entry) => {
    const salonId = getEntrySalonId(entry);
    if (!salonId) return;
    const entries = canonicalBySalonId.get(String(salonId)) || [];
    entries.push(entry);
    canonicalBySalonId.set(String(salonId), entries);
  });
  const salonStateIds = new Set([
    ...canonicalBySalonId.keys(),
    ...latestRequestsBySalonId.keys(),
  ]);
  if (barber?.salon && !hasCanonicalEntryForLegacySalon) {
    salonStateIds.add(String(barber.salon));
  }

  const salonStates = [...salonStateIds].map((salonId) => {
    const canonicalEntries = canonicalBySalonId.get(salonId) || [];
    const latestRequest = latestRequestsBySalonId.get(salonId);
    const approvedCanonical = canonicalEntries.some((entry) => entry.status === "approved");
    const canonicalEntry = canonicalEntries.find((entry) => entry.status === "approved") ||
      canonicalEntries[0];
    const status = approvedCanonical
      ? "accepted"
      : latestRequest?.status || canonicalEntry?.status ||
        (String(barber?.salon) === salonId && barber?.salonStatus === "approved"
          ? "accepted"
          : "cancelled");
    const canonicalSalonData =
      approvedSalons.find((salon) => sameId(salon._id, salonId)) ||
      pendingSalons.find((salon) => sameId(salon._id, salonId));

    return serializeSalonState({
      salonId,
      status,
      salon: latestRequest?.salonId || canonicalSalonData,
    });
  });

  const legacyApprovedFallback = approvedSalon &&
    approvedSalonEntries.length === 0 &&
    !latestRequestsBySalonId.has(String(barber?.salon));
  const summarizedSalonStatus = approvedSalonEntries.length > 0 || legacyApprovedFallback
    ? "approved"
    : salonStates.some((entry) => entry.status === "pending")
      ? "pending"
      : salonStates.some((entry) => entry.status === "rejected")
        ? "rejected"
        : salonStates.some((entry) => entry.status === "cancelled")
          ? "cancelled"
          : barber?.salonStatus || "none";

  return {
    salonStatus: summarizedSalonStatus,
    salon: toPublicSalon(approvedSalon),
    salons: enrichedApprovedEntries,
    pendingEntries: enrichedPendingEntries,
    pendingRequest: primaryPendingRequest,
    salonStates,
    ownedSalons: managedSalons.map(toPublicSalon),
    managedSalons: managedSalons.map(toPublicSalon),
  };
};
