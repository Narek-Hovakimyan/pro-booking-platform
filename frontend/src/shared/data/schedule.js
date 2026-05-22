const defaultWorkingDaySchedule = {
  working: true,
  from: "09:00",
  to: "18:00",
  breakFrom: "",
  breakTo: "",
};
const defaultPersonalSchedule = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

const getDayScheduleFromDefaultSchedule = (
  defaultSchedule = defaultPersonalSchedule
) => ({
  working: true,
  from: defaultSchedule.startTime || defaultPersonalSchedule.startTime,
  to: defaultSchedule.endTime || defaultPersonalSchedule.endTime,
  breakFrom: defaultSchedule.hasBreak ? defaultSchedule.breakStart || "" : "",
  breakTo: defaultSchedule.hasBreak ? defaultSchedule.breakEnd || "" : "",
});

const initialSchedule = {
  mon: { ...defaultWorkingDaySchedule },
  tue: { ...defaultWorkingDaySchedule },
  wed: { ...defaultWorkingDaySchedule },
  thu: { ...defaultWorkingDaySchedule },
  fri: { ...defaultWorkingDaySchedule },
  sat: { ...defaultWorkingDaySchedule },
  sun: { ...defaultWorkingDaySchedule },
};

export {
  defaultPersonalSchedule,
  defaultWorkingDaySchedule,
  getDayScheduleFromDefaultSchedule,
  initialSchedule,
};
export default initialSchedule;
