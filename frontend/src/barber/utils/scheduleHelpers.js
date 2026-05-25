import { defaultPersonalSchedule } from "@/shared/data/schedule";

export const getSalonNameFromEntry = (entry) => {
  if (!entry) return "Salon";
  if (entry.salon?.name) return entry.salon.name;
  if (entry.name) return entry.name;
  return "Salon";
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
