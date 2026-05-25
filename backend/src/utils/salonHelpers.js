import { sameId } from "./salonPermissions.js";

/**
 * Fields to select when populating barber user references in salon-related queries.
 */
export const barberFields = "name phone city avatarUrl salon salonStatus role workHistory salons";

/**
 * Guard — check if the requesting user has role "barber".
 * Sends 403 and returns false if not.
 * @returns {boolean} true if barber, false otherwise
 */
export const requireBarber = (req, res) => {
  if (req.user?.role !== "barber") {
    res.status(403).json({ message: "Only barbers can use salon features" });
    return false;
  }

  return true;
};

/**
 * Update legacy salon/salonStatus fields to match the new salons array.
 * Priority: approved > pending > none
 */
export const syncLegacySalonFields = (barber) => {
  const approved = (barber.salons || []).filter((s) => s.status === "approved");
  const pending = (barber.salons || []).filter((s) => s.status === "pending");

  if (approved.length > 0) {
    const primary = approved.find((s) => s.isPrimary) || approved[0];
    barber.salon = primary.salon;
    barber.salonStatus = "approved";
  } else if (pending.length > 0) {
    barber.salon = pending[0].salon;
    barber.salonStatus = "pending";
  } else {
    barber.salon = null;
    barber.salonStatus = "none";
  }
};

/**
 * Close current work history entries for a given salon.
 * If salonId is provided, only closes entries matching that salon.
 * If salonId is omitted, closes ALL current entries (used for leave/remove).
 */
export const closeCurrentWorkHistory = (barber, salonId, endedAt = new Date()) => {
  if (!barber) return;

  barber.workHistory = Array.isArray(barber.workHistory) ? barber.workHistory : [];
  barber.workHistory.forEach((item) => {
    if (item?.isCurrent && (!salonId || sameId(item.salon, salonId))) {
      item.endDate = endedAt;
      item.isCurrent = false;
    }
  });
};

/**
 * Open (or reopen) a current work history entry for a salon.
 * If an existing current entry exists for this salon, update it.
 * Otherwise create a new entry. Does NOT close other salons' entries.
 */
export const openCurrentWorkHistory = (barber, salon, startedAt = new Date()) => {
  if (!barber || !salon?._id) return;

  barber.workHistory = Array.isArray(barber.workHistory) ? barber.workHistory : [];

  const existingCurrentForSalon = barber.workHistory.find(
    (item) => item?.isCurrent && sameId(item.salon, salon._id)
  );

  if (existingCurrentForSalon) {
    existingCurrentForSalon.salonName = salon.name || existingCurrentForSalon.salonName;
    existingCurrentForSalon.endDate = null;
    return;
  }

  // Do NOT close other salons' work history - barber can work at multiple salons simultaneously
  // Only add a new work history entry for THIS salon

  barber.workHistory.push({
    salon: salon._id,
    salonName: salon.name || "",
    startDate: startedAt,
    endDate: null,
    isCurrent: true,
  });
};
