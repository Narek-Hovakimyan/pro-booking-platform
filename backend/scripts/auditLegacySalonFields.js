import dotenv from "dotenv";
import mongoose from "mongoose";

import Salon from "../src/models/Salon.js";
import User from "../src/models/User.js";
import {
  buildLegacySalonAuditReport,
  collectSalonReferenceIds,
} from "./auditLegacySalonFieldsHelpers.js";

dotenv.config({ quiet: true });

export const USER_AUDIT_PROJECTION =
  "_id role salon salonStatus salons.salon salons.status salons.relationshipType salons.isPrimary salons.worksAsSpecialist";
export const SALON_AUDIT_PROJECTION = "_id";

export const userAuditQuery = {
  $or: [
    { salon: { $exists: true, $ne: null } },
    { salonStatus: { $exists: true, $nin: [null, "", "none"] } },
    { "salons.0": { $exists: true } },
  ],
};

export const connectAuditDatabase = async ({
  environment = process.env,
  connect = (mongoUri) => mongoose.connect(mongoUri),
} = {}) => {
  const mongoUri = environment.MONGO_URI;
  if (!mongoUri || mongoUri === "your_mongodb_connection_string") {
    throw createAuditError("configuration", "MONGO_URI must be configured");
  }
  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    throw createAuditError("configuration", "MONGO_URI must use a MongoDB connection scheme");
  }

  await connect(mongoUri);
};

const disconnectAuditDatabase = () => mongoose.connection.close();
const loadUsers = () => User.find(userAuditQuery).select(USER_AUDIT_PROJECTION).lean();
const loadSalons = (salonIds) => salonIds.length > 0
  ? Salon.find({ _id: { $in: salonIds } }).select(SALON_AUDIT_PROJECTION).lean()
  : [];

const createAuditError = (phase, message) => {
  const error = new Error(message);
  error.auditPhase = phase;
  return error;
};

const getSafeErrorMessage = (error) => {
  let message;

  try {
    message = error instanceof Error ? error.message : String(error);
  } catch {
    message = "Unknown error";
  }

  const singleLineMessage = String(message).split(/\r?\n/, 1)[0];
  const redactedMessage = singleLineMessage
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "[redacted MongoDB URI]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted credentials]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(
      /\b(password|passwd|pwd|token|accessToken|refreshToken|apiKey|api_key|secret|authorization|credential|mongo_?uri|mongodb_?uri)\b\s*([:=])\s*[^\s,;]+/gi,
      "$1$2[redacted]"
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]");

  return redactedMessage.length > 500
    ? `${redactedMessage.slice(0, 500)}…[truncated]`
    : redactedMessage;
};

export const runAudit = async ({
  connect = connectAuditDatabase,
  disconnect = disconnectAuditDatabase,
  getUsers = loadUsers,
  getSalons = loadSalons,
  buildReport = buildLegacySalonAuditReport,
  writeStdout = (value) => process.stdout.write(value),
  writeStderr = (value) => process.stderr.write(value),
  setExitCode = (code) => {
    process.exitCode = code;
  },
} = {}) => {
  let connected = false;
  let report;
  let phase = "configuration";

  try {
    phase = "connection";
    await connect();
    connected = true;
    phase = "query";
    const users = await getUsers();
    const salons = await getSalons(collectSalonReferenceIds(users));
    phase = "classification";
    report = buildReport({ users, salons });
    phase = "serialization";
    const json = JSON.stringify(report, null, 2);
    if (typeof json !== "string") throw new Error("Audit report is not JSON-serializable");
    phase = "output";
    writeStdout(`${json}\n`);
  } catch (error) {
    setExitCode(1);
    const errorPhase = error?.auditPhase || phase;
    writeStderr(`Legacy salon field audit ${errorPhase} failed: ${getSafeErrorMessage(error)}\n`);
  } finally {
    if (connected) {
      try {
        await disconnect();
      } catch (error) {
        setExitCode(1);
        writeStderr(`Legacy salon field audit disconnect failed: ${getSafeErrorMessage(error)}\n`);
      }
    }
  }

  return report;
};

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("auditLegacySalonFields.js");

if (isDirectRun) {
  runAudit();
}
