import { createSlice } from "@reduxjs/toolkit";

import initialSchedule, { defaultPersonalSchedule } from "../../shared/data/schedule";

const createSchedule = () =>
  Object.fromEntries(
    Object.entries(initialSchedule).map(([dayKey, daySchedule]) => [
      dayKey,
      { ...daySchedule },
    ])
  );

const isDateKey = (key) => /^\d{4}-\d{2}-\d{2}$/.test(key);

const normalizeScheduleState = (
  weeklySchedule,
  nonWorkingDays = [],
  dateSchedules = {},
  scheduleOverrides = {},
  defaultSchedule = defaultPersonalSchedule
) => ({
  weeklySchedule: weeklySchedule || createSchedule(),
  dateSchedules: dateSchedules || {},
  scheduleOverrides: scheduleOverrides || {},
  defaultSchedule: defaultSchedule || defaultPersonalSchedule,
  nonWorkingDays,
});

const scheduleSlice = createSlice({
  name: "schedule",
  initialState: {},
  reducers: {
    setSchedule: (state, action) => {
      const {
        barberId,
        weeklySchedule,
        nonWorkingDays = [],
        dateSchedules = {},
        scheduleOverrides = {},
        defaultSchedule = defaultPersonalSchedule,
      } = action.payload;

      state[barberId] = normalizeScheduleState(
        weeklySchedule,
        nonWorkingDays,
        dateSchedules,
        scheduleOverrides,
        defaultSchedule
      );
    },
    updateScheduleField: (state, action) => {
      const { barberId, dayKey, dateKey, field, value } = action.payload;
      const scheduleKey = dateKey || dayKey;

      if (!state[barberId]) {
        state[barberId] = normalizeScheduleState();
      }

      if (isDateKey(scheduleKey)) {
        if (!state[barberId].dateSchedules[scheduleKey]) {
          state[barberId].dateSchedules[scheduleKey] = {
            working: false,
            from: "",
            to: "",
            breakFrom: "",
            breakTo: "",
          };
        }

        state[barberId].dateSchedules[scheduleKey][field] = value;
        return;
      }

      if (state[barberId].weeklySchedule[scheduleKey]) {
        state[barberId].weeklySchedule[scheduleKey][field] = value;
      }
    },
    setNonWorkingDays: (state, action) => {
      const { barberId, nonWorkingDays } = action.payload;

      if (!state[barberId]) {
        state[barberId] = normalizeScheduleState();
      }

      state[barberId].nonWorkingDays = nonWorkingDays;
    },
  },
});

export const { setNonWorkingDays, setSchedule, updateScheduleField } =
  scheduleSlice.actions;
export default scheduleSlice.reducer;
