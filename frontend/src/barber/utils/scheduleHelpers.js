import { defaultPersonalSchedule } from "@/shared/data/schedule";

export const getSalonNameFromEntry = (entry) => {
  if (!entry) return "Salon";
  if (entry.salon?.name) return entry.salon.name;
  if (entry.name) return entry.name;
  return "Salon";
};

export const getSalonIdFromEntry = (entry) => {
  if (!entry) return null;

  if (entry.salon && typeof entry.salon === "object") {
    return (
      entry.salon._id ||
      entry.salon.id ||
      entry.salonId ||
      entry._id ||
      entry.id ||
      null
    );
  }

  return entry.salon || entry.salonId || entry._id || entry.id || null;
};

export const isSelectableScheduleSalonEntry = (entry) => {
  const salonId = getSalonIdFromEntry(entry);
  if (!salonId) return false;

  const status = entry?.status || entry?.salonStatus || entry?.salon?.status;
  const relationshipStatus =
    entry?.relationshipStatus || entry?.salon?.relationshipStatus;

  if (relationshipStatus && relationshipStatus !== "accepted") return false;

  return status === "approved" || (!status && relationshipStatus === "accepted");
};

export const mergeScheduleSalonEntries = (...entryLists) => {
  const entriesBySalonId = new Map();

  entryLists.flat().forEach((entry) => {
    if (!isSelectableScheduleSalonEntry(entry)) return;

    const salonId = String(getSalonIdFromEntry(entry));
    if (!entriesBySalonId.has(salonId)) {
      entriesBySalonId.set(salonId, entry);
    }
  });

  return Array.from(entriesBySalonId.values());
};

export const getSalonDataFromEntry = (entry) => entry?.salon || entry;

export const getSalonAddressFromEntry = (entry) => {
  const salon = getSalonDataFromEntry(entry);
  return [salon?.address, salon?.city].filter(Boolean).join(", ");
};

export const normalizeManageableSalonEntries = (data) => {
  const salonList = Array.isArray(data) ? data : data?.salons || [];

  return salonList.map((salon) => ({
    ...salon,
    salon,
    status: salon?.status || "approved",
  }));
};

export const getSalonListFromResponse = (data) =>
  Array.isArray(data) ? data : data?.salons || [];

export const normalizeSchedule = (data) => {
  const rawDefault = data?.defaultSchedule || {};
  return {
    ...data,
    defaultSchedule: {
      startTime: rawDefault.startTime || "09:00",
      endTime: rawDefault.endTime || "18:00",
      hasBreak: rawDefault.hasBreak || false,
      breakStart: rawDefault.breakStart || "",
      breakEnd: rawDefault.breakEnd || "",
    },
  };
};

export const areSchedulesEqual = (left, right) =>
  JSON.stringify(left || null) === JSON.stringify(right || null);

export const normalizeDefaultScheduleDraft = (defaultSchedule = {}) => ({
  startTime: defaultSchedule.startTime || defaultPersonalSchedule.startTime,
  endTime: defaultSchedule.endTime || defaultPersonalSchedule.endTime,
  hasBreak: Boolean(defaultSchedule.hasBreak),
  breakStart: defaultSchedule.hasBreak ? defaultSchedule.breakStart || "" : "",
  breakEnd: defaultSchedule.hasBreak ? defaultSchedule.breakEnd || "" : "",
});
