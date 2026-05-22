import cron from "node-cron";

import { sendEventReminders } from "../src/services/eventReminders.js";

export const startEventRemindersCron = () => {
  return cron.schedule("*/10 * * * *", async () => {
    try {
      await sendEventReminders();
    } catch (error) {
      console.error("Event reminder job error:", error);
    }
  });
};
