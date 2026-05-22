import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import path from "path";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import barberRoutes from "./routes/barberRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";

import favoriteRoutes from "./routes/favoriteRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import salonReviewRoutes from "./routes/salonReviewRoutes.js";
import salonJobRoutes from "./routes/salonJobRoutes.js";
import scheduleRoutes from "./routes/scheduleRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import salonRoutes from "./routes/salonRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import debugRoutes from "./routes/debugRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import waitlistRoutes from "./routes/waitlistRoutes.js";
import { initSocket } from "./socket.js";
import { startBookingReminderScheduler } from "./services/bookingReminderScheduler.js";
import { startWaitlistExpirationScheduler } from "./services/waitlistExpirationScheduler.js";
import { startCleanupNonWorkingDaysCron } from "../cron/cleanupNonWorkingDays.js";
import { startExpirePendingBookingsCron } from "../cron/expirePendingBookings.js";
import { startEventRemindersCron } from "../cron/eventReminders.js";

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

const clientOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const devOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const allowedOrigins = isProduction ? clientOrigins : [...clientOrigins, ...devOrigins];
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
};

initSocket(server);

app.use(cors(corsOptions));
app.use(express.json());
const uploadsRoot = path.join(process.cwd(), "uploads");
const uploadStaticOptions = {
  dotfiles: "deny",
  fallthrough: false,
  index: false,
};

app.use(
  "/uploads/avatars",
  express.static(path.join(uploadsRoot, "avatars"), uploadStaticOptions)
);
app.use(
  "/uploads/certifications",
  express.static(path.join(uploadsRoot, "certifications"), uploadStaticOptions)
);
app.use(
  "/uploads/events",
  express.static(path.join(uploadsRoot, "events"), uploadStaticOptions)
);
app.use(
  "/uploads/certificate-files",
  express.static(path.join(uploadsRoot, "certificate-files"), uploadStaticOptions)
);

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/barbers", barberRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/salons", salonRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/salon-reviews", salonReviewRoutes);
app.use("/api/salon-jobs", salonJobRoutes);
if (!isProduction) {
  app.use("/api/debug", debugRoutes);
}
app.use("/api/events", eventRoutes);
app.use("/api/waitlist", waitlistRoutes);

const startServer = async () => {
  await connectDB();

  if (process.env.ENABLE_CLEANUP_NON_WORKING_DAYS_CRON === "true") {
    console.log("Starting non-working days cleanup cron");
    startCleanupNonWorkingDaysCron();
  } else {
    console.log("Non-working days cleanup cron skipped (ENABLE_CLEANUP_NON_WORKING_DAYS_CRON !== true)");
  }

  if (process.env.ENABLE_EXPIRE_PENDING_BOOKINGS_CRON === "true") {
    console.log("Starting pending booking expiration cron");
    startExpirePendingBookingsCron();
  } else {
    console.log("Pending booking expiration cron skipped (ENABLE_EXPIRE_PENDING_BOOKINGS_CRON !== true)");
  }

  if (process.env.ENABLE_EVENT_REMINDERS_CRON === "true") {
    console.log("Starting event reminders cron");
    startEventRemindersCron();
  } else {
    console.log("Event reminders cron skipped (ENABLE_EVENT_REMINDERS_CRON !== true)");
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBookingReminderScheduler();
    startWaitlistExpirationScheduler();
  });
};

startServer();
