import cron from "node-cron";
import { expirePendingBookings } from "../src/services/bookingExpiration.js";

export const EXPIRATION_CRON = "*/5 * * * *";

export const startExpirePendingBookingsCron = () => {
  return cron.schedule(EXPIRATION_CRON, async () => {
    try {
      await expirePendingBookings();
    } catch (error) {
      console.error("Pending booking expiration job error:", error);
    }
  });
};
