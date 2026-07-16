import mongoose from "mongoose";
import { getLogger, safeErrorSerializer } from "./logger.js";

const getDatabaseLogger = () =>
  getLogger().child({ component: "database", database: "mongodb" });

const logConnectionFailure = (error) => {
  const sanitizedError = safeErrorSerializer(error);
  for (const field of ["message", "stack"]) {
    if (typeof sanitizedError[field] === "string") {
      sanitizedError[field] = sanitizedError[field].replace(
        /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
        "[REDACTED]"
      );
    }
  }

  getDatabaseLogger().error(
    { event: "database.connection_failed", err: sanitizedError },
    "MongoDB connection failed"
  );
};

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri || mongoUri === "your_mongodb_connection_string") {
    logConnectionFailure(new Error("MongoDB connection configuration is missing"));
    process.exit(1);
  }

  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    logConnectionFailure(new Error("MongoDB connection URI scheme is invalid"));
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    getDatabaseLogger().info(
      { event: "database.connected" },
      "MongoDB connected"
    );
  } catch (error) {
    logConnectionFailure(error);
    process.exit(1);
  }
};

export default connectDB;
