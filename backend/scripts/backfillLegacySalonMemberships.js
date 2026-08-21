import dotenv from "dotenv";
import mongoose from "mongoose";

import Salon from "../src/models/Salon.js";
import SalonJoinRequest from "../src/models/SalonJoinRequest.js";
import User from "../src/models/User.js";
import {
  classifyLegacySalonMembership,
  collectSalonReferenceIds,
} from "./auditLegacySalonFieldsHelpers.js";

dotenv.config({ quiet: true });

export const USER_BACKFILL_PROJECTION = "_id __v createdAt role salon salonStatus salons";
export const userBackfillQuery = {
  $or: [
    { salon: { $exists: true, $ne: null } },
    { salonStatus: { $exists: true, $nin: [null, "", "none"] } },
  ],
};

const counters = (mode) => ({
  mode,
  scanned: 0,
  eligible: 0,
  wouldCreate: 0,
  created: 0,
  existing: 0,
  skipped: 0,
  malformed: 0,
  orphan: 0,
  ambiguous: 0,
  conflicts: 0,
  concurrentChanged: 0,
});

const blockingCount = (result) =>
  result.malformed + result.orphan + result.ambiguous + result.conflicts + result.concurrentChanged;

const parseMode = (argv = []) => {
  if (!Array.isArray(argv) || argv.some((argument) => argument !== "--write")) {
    throw new Error("Only --write is accepted; dry-run is the default");
  }
  return argv.includes("--write") ? "write" : "dry-run";
};

const connectionUri = (environment = process.env) => {
  const value = environment.MONGO_URI;
  if (!value || value === "your_mongodb_connection_string") throw new Error("MONGO_URI must be configured");
  if (!value.startsWith("mongodb://") && !value.startsWith("mongodb+srv://")) {
    throw new Error("MONGO_URI must use a MongoDB connection scheme");
  }
  return value;
};

const loadUsers = () => User.find(userBackfillQuery).select(USER_BACKFILL_PROJECTION).lean();
const loadSalons = (ids) => ids.length ? Salon.find({ _id: { $in: ids } }).select("_id ownerId admins").lean() : [];
const loadJoinRequests = (userIds, salonIds) => userIds.length && salonIds.length
  ? SalonJoinRequest.find({ barberId: { $in: userIds }, salonId: { $in: salonIds } })
    .select("_id barberId salonId status createdAt updatedAt").lean()
  : [];

const snapshotFilter = (snapshot) => ({
  _id: snapshot.userId,
  __v: snapshot.version === null ? { $in: [null] } : snapshot.version,
  salon: snapshot.salon,
  salonStatus: snapshot.salonStatus,
  ...(snapshot.salons === undefined ? { salons: { $exists: false } } : { salons: snapshot.salons }),
});

export const buildBackfillPlan = ({ users = [], salons = [], joinRequests = [], mode = "dry-run" } = {}) => {
  const result = counters(mode);
  const plans = [];
  for (const user of users) {
    const decision = classifyLegacySalonMembership({ user, salons, joinRequests });
    result.scanned += 1;
    if (decision.state === "eligible") {
      result.eligible += 1;
      result.wouldCreate += 1;
      plans.push(decision);
      continue;
    }
    const counter = decision.state === "conflict" ? "conflicts" : decision.state;
    if (Object.hasOwn(result, counter)) result[counter] += 1;
  }
  return { result, plans };
};

const concurrentError = () => Object.assign(new Error("User membership changed during backfill"), { code: "CONCURRENT_CHANGED" });

export const writeBackfillPlan = async ({ plans, UserModel = User, startSession = () => mongoose.startSession() }) => {
  if (plans.length === 0) return 0;
  const session = await startSession();
  try {
    let writes = 0;
    await session.withTransaction(async () => {
      for (const plan of plans) {
        const update = await UserModel.updateOne(
          snapshotFilter(plan.snapshot),
          { $set: { salons: [plan.membership] }, $inc: { __v: 1 } },
          { session, runValidators: true, timestamps: false }
        );
        if (update?.modifiedCount !== 1) throw concurrentError();
        writes += 1;
      }
    });
    return writes;
  } finally {
    await session.endSession();
  }
};

export const runBackfill = async ({
  argv = process.argv.slice(2),
  environment = process.env,
  connect = (uri) => mongoose.connect(uri),
  disconnect = () => mongoose.connection.close(),
  getUsers = loadUsers,
  getSalons = loadSalons,
  getJoinRequests = loadJoinRequests,
  writePlan = writeBackfillPlan,
} = {}) => {
  const mode = parseMode(argv);
  let connected = false;
  try {
    const uri = connectionUri(environment);
    await connect(uri);
    connected = true;
    const users = await getUsers();
    const salonIds = collectSalonReferenceIds(users);
    const [salons, joinRequests] = await Promise.all([
      getSalons(salonIds),
      getJoinRequests(users.map((user) => user?._id).filter(Boolean), salonIds),
    ]);
    const { result, plans } = buildBackfillPlan({ users, salons, joinRequests, mode });
    if (mode === "write" && blockingCount(result) === 0) {
      try {
        result.created = await writePlan({ plans });
      } catch (error) {
        if (error?.code !== "CONCURRENT_CHANGED") throw error;
        result.concurrentChanged += 1;
        result.created = 0;
      }
    }
    result.hasBlockingIssues = blockingCount(result) > 0;
    return result;
  } finally {
    if (connected) await disconnect();
  }
};

const directRun = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("backfillLegacySalonMemberships.js");

if (directRun) {
  runBackfill().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.hasBlockingIssues) process.exitCode = 2;
  }).catch(() => {
    process.exitCode = 1;
    process.stderr.write("Legacy salon membership backfill failed\n");
  });
}
