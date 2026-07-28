import { expirePendingBookings } from "../src/services/booking/bookingExpiration.js";
import { createCronLeaseRunner } from "../src/services/cronLeaseRunner.js";

export const EXPIRATION_CRON = "*/5 * * * *";

export const startExpirePendingBookingsCron = ({
  logger = console,
  createRunner = createCronLeaseRunner,
  expirePendingBookingsFn = expirePendingBookings,
  ...runnerOptions
} = {}) =>
  createRunner({
    jobKey: "expire-pending-bookings",
    expression: EXPIRATION_CRON,
    logger,
    run: async (leaseContext) => {
      try {
        await expirePendingBookingsFn({ leaseContext });
      } catch (error) {
        logger.error?.("Pending booking expiration job error:", error);
        throw error;
      }
    },
    ...runnerOptions,
  }).start();
