import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      required: false,
      default: null,
    },
    weeklySchedule: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    dateSchedules: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    scheduleOverrides: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    nonWorkingDays: {
      type: [String],
      default: [],
    },
    defaultSchedule: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        startTime: "09:00",
        endTime: "18:00",
        hasBreak: false,
        breakStart: "",
        breakEnd: "",
      },
    },
  },
  { timestamps: true }
);

// Unique compound index: one schedule per barber per salon
scheduleSchema.index({ barberId: 1, salonId: 1 }, { unique: true });

const Schedule = mongoose.model("Schedule", scheduleSchema);

export default Schedule;
