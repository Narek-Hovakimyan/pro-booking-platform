import { timeToMinutes } from "./salonUtils.js";

const timePattern = /^\d{2}:\d{2}$/;

export const normalizeSalonDefaultSchedule = ({
  startTime,
  endTime,
  hasBreak,
  breakStart,
  breakEnd,
}) => {
  if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
    throw new Error("Times must use HH:mm format");
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    throw new Error("End time must be later than start time");
  }

  const hasBreakValue = Boolean(hasBreak);

  if (hasBreakValue) {
    if (!timePattern.test(breakStart) || !timePattern.test(breakEnd)) {
      throw new Error("Break times must use HH:mm format");
    }

    const breakStartMinutes = timeToMinutes(breakStart);
    const breakEndMinutes = timeToMinutes(breakEnd);

    if (breakEndMinutes <= breakStartMinutes) {
      throw new Error("Break end must be later than break start");
    }

    if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
      throw new Error("Break time must be inside working hours");
    }
  }

  return {
    startTime,
    endTime,
    hasBreak: hasBreakValue,
    breakStart: hasBreakValue ? breakStart : "",
    breakEnd: hasBreakValue ? breakEnd : "",
  };
};
