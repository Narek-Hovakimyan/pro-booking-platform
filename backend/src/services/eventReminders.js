import EventRegistration from "../models/EventRegistration.js";
import { createNotification } from "./notificationService.js";


export const REMINDER_LEAD_MINUTES = 24 * 60;
export const REMINDER_WINDOW_MINUTES = 10;

export const getEventStart = (event) => {
  if (!event?.date || !event?.time) return null;

  const startsAt = new Date(`${event.date}T${event.time}:00+04:00`);


  return Number.isNaN(startsAt.getTime()) ? null : startsAt;
};

export const sendEventReminders = async (now = new Date()) => {
  const reminderWindowStart = new Date(
    now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000
  );
  const reminderWindowEnd = new Date(
    reminderWindowStart.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000
  );

  const registrations = await EventRegistration.find({
    status: "approved",
    reminderSentAt: null,
  })
    .populate("eventId", "title date time status")
    .lean();

  let sentCount = 0;

  for (const registration of registrations) {
    const event = registration?.eventId;
    const startsAt = getEventStart(event);

    if (
      !event ||
      event.status !== "upcoming" ||
      !startsAt ||
      startsAt < reminderWindowStart ||
      startsAt > reminderWindowEnd
    ) {
      continue;
    }

    // Atomically claim this registration — only one instance wins
    const claimed = await EventRegistration.findOneAndUpdate(
      {
        _id: registration._id,
        status: "approved",
        $or: [
          { reminderSentAt: { $exists: false } },
          { reminderSentAt: null },
        ],
      },
      { $set: { reminderSentAt: now } },
      { returnDocument: "after" }
    );

    if (!claimed) continue;

    await createNotification({
      userId: registration.userId || registration.barberId,
      type: "event_reminder",
      message: `Reminder: Your event '${event.title}' starts tomorrow at ${event.time}.`,
    });

    sentCount += 1;
  }

  return sentCount;
};
