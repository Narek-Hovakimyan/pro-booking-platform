import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import path from "path";
import connectDB from "./config/db.js";
import { createLogger } from "./config/logger.js";
import {
  getSentryInitializationStatus,
  installSentryExpressErrorHandler,
  sentryRequestContextMiddleware,
} from "./config/sentry.js";
import { requestContextMiddleware } from "./middleware/requestContextMiddleware.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
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
import serviceCategoryRoutes from "./routes/serviceCategoryRoutes.js";
import salonRoutes from "./routes/salonRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import debugRoutes from "./routes/debugRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import waitlistRoutes from "./routes/waitlistRoutes.js";
import portfolioPhotoRoutes from "./routes/portfolioPhotoRoutes.js";
import loyaltyRoutes from "./routes/loyaltyRoutes.js";
import voucherRoutes from "./routes/voucherRoutes.js";
import revenueRoutes from "./routes/revenueRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import platformRoutes from "./routes/platformRoutes.js";
import { servePublicPortfolioImage } from "./controllers/portfolioPhotoMediaController.js";
import { initSocket } from "./socket.js";
import { startBookingReminderScheduler } from "./services/booking/bookingReminderScheduler.js";
import { startSubscriptionExpirationScheduler } from "./services/subscriptionExpirationScheduler.js";
import { startWaitlistExpirationScheduler } from "./services/waitlist/waitlistExpirationScheduler.js";
import { startCleanupNonWorkingDaysCron } from "../cron/cleanupNonWorkingDays.js";
import { startExpirePendingBookingsCron } from "../cron/expirePendingBookings.js";
import { startEventRemindersCron } from "../cron/eventReminders.js";

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

const logger = createLogger();

if (getSentryInitializationStatus().failed) {
  logger.warn(
    { event: "sentry.initialization_failed" },
    "Sentry initialization failed; continuing without Sentry"
  );
}

app.disable("x-powered-by");

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

/* ── Request correlation / logging — before routes ──── */
app.use(requestContextMiddleware(logger));
app.use(sentryRequestContextMiddleware);

initSocket(server);

app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
});
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use("/api/payments", paymentRoutes);
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
app.get("/uploads/portfolio/:filename", servePublicPortfolioImage);

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/barbers", barberRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/service-categories", serviceCategoryRoutes);
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
app.use("/api/portfolio", portfolioPhotoRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/revenue", revenueRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/subscriptions", subscriptionRoutes);

/* ── Centralized error handling ─────────────────────── */
installSentryExpressErrorHandler(app);
app.use(errorMiddleware);

const startServer = async () => {
  await connectDB();

  if (process.env.ENABLE_CLEANUP_NON_WORKING_DAYS_CRON === "true") {
    logger.info("Starting non-working days cleanup cron");
    startCleanupNonWorkingDaysCron();
  } else {
    logger.info("Non-working days cleanup cron skipped (ENABLE_CLEANUP_NON_WORKING_DAYS_CRON !== true)");
  }

  if (process.env.ENABLE_EXPIRE_PENDING_BOOKINGS_CRON === "true") {
    logger.info("Starting pending booking expiration cron");
    startExpirePendingBookingsCron();
  } else {
    logger.info("Pending booking expiration cron skipped (ENABLE_EXPIRE_PENDING_BOOKINGS_CRON !== true)");
  }

  if (process.env.ENABLE_EVENT_REMINDERS_CRON === "true") {
    logger.info("Starting event reminders cron");
    startEventRemindersCron();
  } else {
    logger.info("Event reminders cron skipped (ENABLE_EVENT_REMINDERS_CRON !== true)");
  }

  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    startBookingReminderScheduler();
    startWaitlistExpirationScheduler();
    startSubscriptionExpirationScheduler();
  });
};

startServer();
