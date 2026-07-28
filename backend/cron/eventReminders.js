import { sendEventReminders } from "../src/services/notification/eventReminders.js";
import { createCronLeaseRunner } from "../src/services/cronLeaseRunner.js";

export const EVENT_REMINDERS_CRON = "*/10 * * * *";

export const startEventRemindersCron = ({
  logger = console,
  createRunner = createCronLeaseRunner,
  sendEventRemindersFn = sendEventReminders,
  ...runnerOptions
} = {}) =>
  createRunner({
    jobKey: "event-reminders",
    expression: EVENT_REMINDERS_CRON,
    logger,
    run: async (leaseContext) => {
      try {
        if (leaseContext === undefined) {
          await sendEventRemindersFn();
          return;
        }

        await sendEventRemindersFn(undefined, { leaseContext });
      } catch (error) {
        logger.error?.("Event reminder job error:", error);
        throw error;
      }
    },
    ...runnerOptions,
  }).start();
