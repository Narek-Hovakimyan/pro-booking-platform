import Schedule from "../../models/Schedule.js";
import {
  createPersonalDefaultSchedule,
  validatePersonalWeeklySchedule,
} from "../../utils/personalScheduleUtils.js";

const personalScheduleFilter = (barberId) => ({ barberId, salonId: null });

const createCanonicalUpdate = (weeklySchedule) => ({
  weeklySchedule: validatePersonalWeeklySchedule(weeklySchedule),
  defaultSchedule: createPersonalDefaultSchedule(),
  nonWorkingDays: [],
});

const isDuplicateKeyError = (error) => error?.code === 11000;

export const getPersonalSchedule = async (
  barberId,
  { ScheduleModel = Schedule } = {}
) => ScheduleModel.findOne(personalScheduleFilter(barberId));

export const upsertPersonalSchedule = async (
  barberId,
  canonicalWeeklySchedule,
  { ScheduleModel = Schedule } = {}
) => {
  const filter = personalScheduleFilter(barberId);
  const scheduleUpdate = createCanonicalUpdate(canonicalWeeklySchedule);
  const options = { returnDocument: "after", runValidators: true, upsert: true };

  try {
    return await ScheduleModel.findOneAndUpdate(
      filter,
      {
        $set: scheduleUpdate,
        $setOnInsert: { barberId, salonId: null },
      },
      options
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const persistedSchedule = await ScheduleModel.findOneAndUpdate(
      filter,
      { $set: scheduleUpdate },
      { returnDocument: "after", runValidators: true, upsert: false }
    );

    if (!persistedSchedule) throw error;

    return persistedSchedule;
  }
};
