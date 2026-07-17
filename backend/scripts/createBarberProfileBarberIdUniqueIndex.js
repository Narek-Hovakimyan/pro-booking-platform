import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config({ quiet: true });

export const BARBER_PROFILE_INDEX_NAME = "barberprofiles_barberId_unique";
export const BARBER_PROFILE_INDEX_KEY = { barberId: 1 };
export const BARBER_PROFILE_COLLECTION = "barberprofiles";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EXIT_BLOCKED = 2;

const createScriptError = (phase, message, exitCode = EXIT_FAILURE) => {
  const error = new Error(message);
  error.phase = phase;
  error.exitCode = exitCode;
  return error;
};

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const INDEX_METADATA_KEYS = new Set(["v", "key", "name", "unique", "sparse"]);

const sameKey = (key) =>
  isObject(key) &&
  Object.keys(key).length === 1 &&
  key.barberId === BARBER_PROFILE_INDEX_KEY.barberId;

const hasOnlyCompatibleIndexOptions = (index) =>
  isObject(index) &&
  Object.keys(index).every((key) => INDEX_METADATA_KEYS.has(key)) &&
  (index.sparse === undefined || index.sparse === false);

const isEquivalentIndex = (index) =>
  sameKey(index?.key) &&
  index.unique === true &&
  hasOnlyCompatibleIndexOptions(index);

const isExactIndex = (index) =>
  index?.name === BARBER_PROFILE_INDEX_NAME && isEquivalentIndex(index);

export const sanitizeErrorMessage = (error) => {
  switch (error?.phase) {
    case "configuration":
      return "Configuration is invalid";
    case "preflight":
      return "Preflight checks did not pass";
    case "index":
      return "Index conflict requires manual reconciliation";
    case "verification":
      return "Index verification failed";
    default:
      return "Database operation failed";
  }
};

export const getBarberProfileIndexState = async (collection) => {
  const indexes = await collection.listIndexes().toArray();
  const namedIndex = indexes.find((index) => index.name === BARBER_PROFILE_INDEX_NAME);

  if (namedIndex && !isExactIndex(namedIndex)) {
    throw createScriptError(
      "index",
      "Existing barberId index name has different keys or options"
    );
  }

  const equivalentIndex = indexes.find(
    (index) => index.name !== BARBER_PROFILE_INDEX_NAME && isEquivalentIndex(index)
  );
  if (equivalentIndex) {
    throw createScriptError(
      "index",
      "Equivalent barberId unique index requires manual reconciliation"
    );
  }

  return { exactExists: Boolean(namedIndex), indexes };
};

export const getBarberProfilePreflightCounts = async (collection) => {
  const [
    totalProfiles,
    missingOrNullBarberId,
    invalidTypeRows,
    duplicateRows,
  ] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({
      $or: [{ barberId: { $exists: false } }, { barberId: null }],
    }),
    collection.aggregate([
      { $match: { barberId: { $exists: true, $ne: null } } },
      { $project: { validBarberId: { $eq: [{ $type: "$barberId" }, "objectId"] } } },
      { $match: { validBarberId: false } },
      { $count: "count" },
    ]).toArray(),
    collection.aggregate([
      { $match: { barberId: { $type: "objectId" } } },
      { $group: { _id: "$barberId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      {
        $group: {
          _id: null,
          duplicateGroups: { $sum: 1 },
          duplicateDocuments: { $sum: "$count" },
        },
      },
    ]).toArray(),
  ]);

  return {
    totalProfiles,
    missingOrNullBarberId,
    invalidBarberIdType: invalidTypeRows[0]?.count || 0,
    duplicateGroups: duplicateRows[0]?.duplicateGroups || 0,
    duplicateDocuments: duplicateRows[0]?.duplicateDocuments || 0,
  };
};

const countsAreClean = (counts) =>
  counts.missingOrNullBarberId === 0 &&
  counts.invalidBarberIdType === 0 &&
  counts.duplicateGroups === 0 &&
  counts.duplicateDocuments === 0;

const createBarberProfileIndex = async (collection) => {
  await collection.createIndex(BARBER_PROFILE_INDEX_KEY, {
    unique: true,
    name: BARBER_PROFILE_INDEX_NAME,
  });
  const { exactExists } = await getBarberProfileIndexState(collection);
  if (!exactExists) {
    throw createScriptError("verification", "Created index could not be verified");
  }
};

export const runBarberProfileIndexScript = async ({
  apply = false,
  environment = process.env,
  MongoClientClass = MongoClient,
  writeStdout = (value) => process.stdout.write(value),
  writeStderr = (value) => process.stderr.write(value),
  setExitCode = (code) => {
    process.exitCode = code;
  },
} = {}) => {
  let client;
  let primaryFailure = false;

  try {
    const mongoUri = environment.MONGO_URI;
    if (!mongoUri || mongoUri === "your_mongodb_connection_string") {
      throw createScriptError("configuration", "MONGO_URI must be configured");
    }
    if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
      throw createScriptError("configuration", "MONGO_URI must use a MongoDB connection scheme");
    }

    client = new MongoClientClass(mongoUri);
    await client.connect();

    const collection = client.db().collection(BARBER_PROFILE_COLLECTION);
    const counts = await getBarberProfilePreflightCounts(collection);
    const indexState = await getBarberProfileIndexState(collection);

    if (!apply) {
      writeStdout(`${JSON.stringify({ mode: "preflight", counts }, null, 2)}\n`);
      return { mode: "preflight", counts, indexCreated: false };
    }

    if (!countsAreClean(counts)) {
      throw createScriptError(
        "preflight",
        "Refusing to create index until invalid and duplicate counts are zero",
        EXIT_BLOCKED
      );
    }

    if (!indexState.exactExists) {
      await createBarberProfileIndex(collection);
    }

    writeStdout(`${JSON.stringify({ mode: "apply", counts, indexCreated: !indexState.exactExists }, null, 2)}\n`);
    return { mode: "apply", counts, indexCreated: !indexState.exactExists };
  } catch (error) {
    primaryFailure = true;
    const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : EXIT_FAILURE;
    setExitCode(exitCode);
    const phase = error?.phase || "execution";
    writeStderr(`BarberProfile barberId index ${phase} failed: ${sanitizeErrorMessage(error)}\n`);
    return null;
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        if (!primaryFailure) {
          setExitCode(EXIT_FAILURE);
          writeStderr("BarberProfile barberId index disconnect failed: Database connection cleanup failed\n");
        }
      }
    }
  }
};

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("createBarberProfileBarberIdUniqueIndex.js");

if (isDirectRun) {
  runBarberProfileIndexScript({ apply: process.argv.includes("--apply") });
}
