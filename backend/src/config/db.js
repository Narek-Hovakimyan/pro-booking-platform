import mongoose from "mongoose";
import { getLogger } from "./logger.js";
import { captureSentryStartupFailure } from "./sentry.js";

const STARTUP_FAILURE_REASONS = new Set([
  "configuration_missing",
  "configuration_invalid",
  "connection_failed",
]);

const getDatabaseLogger = () =>
  getLogger().child({ component: "database", database: "mongodb" });

const logConnectionFailure = (reason) => {
  getLogger().child({ component: "database" }).error(
    {
      event: "database.connection_failed",
      phase: "startup",
      reason: STARTUP_FAILURE_REASONS.has(reason) ? reason : "connection_failed",
    },
    "MongoDB connection failed"
  );
};

const exitForConnectionFailure = async (reason) => {
  logConnectionFailure(reason);
  await captureSentryStartupFailure("database");
  process.exit(1);
};

const createTimeoutError = () => {
  const error = new Error("database_ping_timeout");
  error.code = "database_ping_timeout";
  return error;
};

export const isDatabaseConnected = () => mongoose.connection.readyState === 1;

export const pingDatabase = async ({ timeoutMs = 1000 } = {}) => {
  if (!isDatabaseConnected() || !mongoose.connection.db) {
    throw new Error("database_not_connected");
  }

  let timeoutId = null;

  try {
    await Promise.race([
      mongoose.connection.db.admin().command({ ping: 1 }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError());
        }, timeoutMs);

        timeoutId.unref?.();
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
};

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri || mongoUri === "your_mongodb_connection_string") {
    await exitForConnectionFailure("configuration_missing");
    return;
  }

  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    await exitForConnectionFailure("configuration_invalid");
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    getDatabaseLogger().info(
      { event: "database.connected" },
      "MongoDB connected"
    );
  } catch {
    await exitForConnectionFailure("connection_failed");
  }
};

export default connectDB;
