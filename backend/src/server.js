import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import path from "path";
import connectDB from "./config/db.js";
import { createLogger } from "./config/logger.js";
import { loadRuntimeConfig } from "./config/runtimeConfig.js";
import {
  getSentryInitializationStatus,
  installSentryExpressErrorHandler,
  sentryRequestContextMiddleware,
} from "./config/sentry.js";
import { requestContextMiddleware } from "./middleware/requestContextMiddleware.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import {
  createSecurityHeadersMiddleware,
  publicMediaResourcePolicy,
} from "./middleware/securityHeadersMiddleware.js";
import authRoutes from "./routes/auth/authRoutes.js";
import barberOnboardingRoutes from "./routes/barbers/barberOnboardingRoutes.js";
import barberRoutes from "./routes/barbers/barberRoutes.js";
import bookingRoutes from "./routes/bookings/bookingRoutes.js";
import certificateRoutes from "./routes/events/certificateRoutes.js";

import favoriteRoutes from "./routes/engagement/favoriteRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import messageRoutes from "./routes/messaging/messageRoutes.js";
import notificationRoutes from "./routes/notifications/notificationRoutes.js";
import reviewRoutes from "./routes/reviews/reviewRoutes.js";
import salonReviewRoutes from "./routes/salons/salonReviewRoutes.js";
import salonJobRoutes from "./routes/salons/salonJobRoutes.js";
import scheduleRoutes from "./routes/schedules/scheduleRoutes.js";
import serviceRoutes from "./routes/services/serviceRoutes.js";
import serviceCategoryRoutes from "./routes/services/serviceCategoryRoutes.js";
import salonRoutes from "./routes/salons/salonRoutes.js";
import userRoutes from "./routes/users/userRoutes.js";
import debugRoutes from "./routes/platform/debugRoutes.js";
import eventRoutes from "./routes/events/eventRoutes.js";
import waitlistRoutes from "./routes/bookings/waitlistRoutes.js";
import portfolioPhotoRoutes from "./routes/portfolio/portfolioPhotoRoutes.js";
import loyaltyRoutes from "./routes/engagement/loyaltyRoutes.js";
import voucherRoutes from "./routes/promotions/voucherRoutes.js";
import revenueRoutes from "./routes/billing/revenueRoutes.js";
import subscriptionRoutes from "./routes/billing/subscriptionRoutes.js";
import paymentRoutes from "./routes/billing/paymentRoutes.js";
import platformRoutes from "./routes/platform/platformRoutes.js";
import { servePublicPortfolioImage } from "./controllers/portfolio/portfolioPhotoMediaController.js";
import { initSocket } from "./socket.js";
import { startBookingReminderScheduler } from "./services/booking/bookingReminderScheduler.js";
import { startBookingPostCommitDispatchScheduler } from "./services/booking/bookingPostCommitDispatchScheduler.js";
import { redisClientService } from "./services/redisClientService.js";
import { serverLifecycleService } from "./services/serverLifecycleService.js";
import { startSubscriptionExpirationScheduler } from "./services/subscriptionExpirationScheduler.js";
import { startWaitlistExpirationScheduler } from "./services/waitlist/waitlistExpirationScheduler.js";
import { startMediaReconciliationScheduler } from "./services/media/mediaReconciliationScheduler.js";
import { runPendingBookingExpirationCatchup } from "./services/booking/bookingExpiration.js";
import { serveProfileMedia } from "./controllers/media/profileMediaController.js";
import { serveEventCertificateMedia } from "./controllers/media/eventCertificateMediaController.js";
import { startCleanupNonWorkingDaysCron } from "../cron/cleanupNonWorkingDays.js";
import { startExpirePendingBookingsCron } from "../cron/expirePendingBookings.js";
import { startEventRemindersCron } from "../cron/eventReminders.js";

dotenv.config();

const loadStartupConfig = () => {
  try {
    return loadRuntimeConfig(process.env);
  } catch (error) {
    const failures = Array.isArray(error?.failures)
      ? error.failures.map(({ variable, reason }) => ({ variable, reason }))
      : [{ variable: "runtime", reason: "validation_failed" }];
    const startupLogger = createLogger({ environment: "startup" });
    startupLogger.fatal(
      {
        event: "runtime_config.invalid",
        phase: "startup",
        failures,
      },
      "Runtime configuration invalid"
    );
    process.exit(1);
  }
};

const runtimeConfig = loadStartupConfig();
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
const isProduction = runtimeConfig.isProduction;

const logger = createLogger();

if (getSentryInitializationStatus().failed) {
  logger.warn(
    { event: "sentry.initialization_failed" },
    "Sentry initialization failed; continuing without Sentry"
  );
}

app.disable("x-powered-by");

if (runtimeConfig.trustProxy) {
  app.set("trust proxy", 1);
}

const devOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const allowedOrigins = isProduction
  ? runtimeConfig.clientOrigins
  : [...runtimeConfig.clientOrigins, ...devOrigins];
const corsOptions = {
  credentials: true,
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

serverLifecycleService.configure({
  logger,
  server,
});
serverLifecycleService.installSignalHandlers();

app.use(createSecurityHeadersMiddleware({ isProduction }));
app.use(cors(corsOptions));
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use("/api/payments", paymentRoutes);
app.use(express.json());
const uploadsRoot = path.join(process.cwd(), "uploads");
const uploadStaticOptions = {
  dotfiles: "deny",
  fallthrough: false,
  index: false,
};

app.get("/uploads/:kind/:filename", publicMediaResourcePolicy, serveProfileMedia);
app.use(
  "/uploads/events",
  publicMediaResourcePolicy,
  express.static(path.join(uploadsRoot, "events"), uploadStaticOptions)
);
app.get(
  "/uploads/certificate-files/:filename",
  publicMediaResourcePolicy,
  serveEventCertificateMedia
);
app.get(
  "/uploads/portfolio/:filename",
  publicMediaResourcePolicy,
  servePublicPortfolioImage
);

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/barber-onboarding", barberOnboardingRoutes);
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

const listenForStartup = () =>
  new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(PORT);
  });

const startServer = async () => {
  await connectDB();
  let socketServer;
  const cronTasks = [];

  try {
    await redisClientService.initialize({
      url: runtimeConfig.redisUrl,
      namespace: runtimeConfig.redisNamespace,
      required: runtimeConfig.isProduction,
    });
    socketServer = initSocket(server);
    serverLifecycleService.configure({ socketServer });

    if (process.env.ENABLE_CLEANUP_NON_WORKING_DAYS_CRON === "true") {
      logger.info("Starting non-working days cleanup cron");
      cronTasks.push(startCleanupNonWorkingDaysCron());
    } else {
      logger.info("Non-working days cleanup cron skipped (ENABLE_CLEANUP_NON_WORKING_DAYS_CRON !== true)");
    }

    if (process.env.ENABLE_EXPIRE_PENDING_BOOKINGS_CRON !== "false") {
      logger.info("Starting pending booking expiration cron");
      try {
        await runPendingBookingExpirationCatchup();
      } catch (error) {
        logger.error?.(
          {
            event: "booking_expiration.startup_catchup_failed",
            error: { name: error?.name || "Error", code: error?.code },
          },
          "Pending booking expiration startup catch-up failed; scheduled retry remains active"
        );
      }
      cronTasks.push(startExpirePendingBookingsCron());
    } else {
      logger.info("Pending booking expiration cron skipped (ENABLE_EXPIRE_PENDING_BOOKINGS_CRON === false)");
    }

    if (process.env.ENABLE_EVENT_REMINDERS_CRON === "true") {
      logger.info("Starting event reminders cron");
      cronTasks.push(startEventRemindersCron());
    } else {
      logger.info("Event reminders cron skipped (ENABLE_EVENT_REMINDERS_CRON !== true)");
    }

    serverLifecycleService.setCronTasks(cronTasks);
    await listenForStartup();
  } catch {
    serverLifecycleService.setCronTasks(cronTasks);
    await serverLifecycleService.shutdown("startup_failure");
    logger.fatal(
      { event: "server.initialization_failed", phase: "startup" },
      "Required shared infrastructure is unavailable"
    );
    process.exitCode = 1;
    return;
  }

  logger.info(`Server running on port ${PORT}`);
  startBookingReminderScheduler();
  startBookingPostCommitDispatchScheduler({ logger });
  startWaitlistExpirationScheduler();
  startSubscriptionExpirationScheduler();
  startMediaReconciliationScheduler({ logger });
};

void startServer().catch(() => {
  logger.fatal(
    { event: "server.initialization_failed", phase: "startup" },
    "Server initialization failed"
  );
  process.exitCode = 1;
});
