import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BARBER_PROFILE_INDEX_KEY,
  BARBER_PROFILE_INDEX_NAME,
  runBarberProfileIndexScript,
} from "./createBarberProfileBarberIdUniqueIndex.js";

const cleanCounts = {
  totalProfiles: 3,
  missingOrNullBarberId: 0,
  invalidBarberIdType: 0,
  duplicateGroups: 0,
  duplicateDocuments: 0,
};

const createFakeClientClass = ({
  counts = cleanCounts,
  indexes = [{ name: "_id_", key: { _id: 1 } }],
  createIndexError,
  connectError,
  closeError,
} = {}) => {
  const calls = {
    connect: 0,
    close: 0,
    countDocuments: [],
    aggregate: [],
    createIndex: [],
  };
  const mutableIndexes = indexes.map((index) => ({ ...index }));
  const collection = {
    countDocuments: async (query) => {
      calls.countDocuments.push(query);
      if (Object.keys(query).length === 0) return counts.totalProfiles;
      return counts.missingOrNullBarberId;
    },
    aggregate: (pipeline) => {
      calls.aggregate.push(pipeline);
      const isInvalidTypePipeline = pipeline.some((stage) => stage.$count === "count");
      const rows = isInvalidTypePipeline
        ? counts.invalidBarberIdType > 0 ? [{ count: counts.invalidBarberIdType }] : []
        : counts.duplicateGroups > 0
          ? [{
              duplicateGroups: counts.duplicateGroups,
              duplicateDocuments: counts.duplicateDocuments,
            }]
          : [];
      return { toArray: async () => rows };
    },
    listIndexes: () => ({
      toArray: async () => mutableIndexes.map((index) => ({ ...index })),
    }),
    createIndex: async (key, options) => {
      calls.createIndex.push({ key, options });
      if (createIndexError) throw createIndexError;
      mutableIndexes.push({ name: options.name, key, unique: options.unique });
      return options.name;
    },
  };

  class FakeMongoClient {
    constructor(uri) {
      this.uri = uri;
    }

    async connect() {
      calls.connect += 1;
      if (connectError) throw connectError;
    }

    db() {
      return { collection: () => collection };
    }

    async close() {
      calls.close += 1;
      if (closeError) throw closeError;
    }
  }

  return { FakeMongoClient, calls };
};

const runWithFakeClient = async (fake, options = {}) => {
  const stdout = [];
  const stderr = [];
  const exitCodes = [];
  const result = await runBarberProfileIndexScript({
    environment: { MONGO_URI: "mongodb://user:secret@example.test/hairbook" },
    MongoClientClass: fake.FakeMongoClient,
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
    ...options,
  });

  return { result, stdout, stderr, exitCodes };
};

test("preflight-only mode reports counts and performs no writes", async () => {
  const fake = createFakeClientClass();
  const capture = await runWithFakeClient(fake);

  assert.equal(capture.result.mode, "preflight");
  assert.deepEqual(capture.result.counts, cleanCounts);
  assert.equal(capture.result.indexCreated, false);
  assert.equal(fake.calls.createIndex.length, 0);
  assert.equal(fake.calls.close, 1);
  assert.deepEqual(capture.exitCodes, []);
});

test("apply is blocked when invalid or duplicate data exists", async () => {
  const fake = createFakeClientClass({
    counts: {
      totalProfiles: 5,
      missingOrNullBarberId: 1,
      invalidBarberIdType: 1,
      duplicateGroups: 1,
      duplicateDocuments: 2,
    },
  });
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result, null);
  assert.equal(fake.calls.createIndex.length, 0);
  assert.deepEqual(capture.exitCodes, [2]);
  assert.match(capture.stderr.join(""), /preflight failed/);
  assert.equal(fake.calls.close, 1);
});

test("exact existing index is idempotent", async () => {
  const fake = createFakeClientClass({
    indexes: [{
      name: BARBER_PROFILE_INDEX_NAME,
      key: BARBER_PROFILE_INDEX_KEY,
      unique: true,
    }],
  });
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result.mode, "apply");
  assert.equal(capture.result.indexCreated, false);
  assert.equal(fake.calls.createIndex.length, 0);
  assert.deepEqual(capture.exitCodes, []);
  assert.equal(fake.calls.close, 1);
});

test("conflicting index with the expected name fails safely", async () => {
  const fake = createFakeClientClass({
    indexes: [{
      name: BARBER_PROFILE_INDEX_NAME,
      key: { barberId: -1 },
      unique: true,
    }],
  });
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result, null);
  assert.equal(fake.calls.createIndex.length, 0);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.match(capture.stderr.join(""), /index failed/);
  assert.equal(fake.calls.close, 1);
});

test("same-name sparse index fails without creating an index", async () => {
  const fake = createFakeClientClass({
    indexes: [{
      name: BARBER_PROFILE_INDEX_NAME,
      key: BARBER_PROFILE_INDEX_KEY,
      unique: true,
      sparse: true,
    }],
  });
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result, null);
  assert.equal(fake.calls.createIndex.length, 0);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.equal(fake.calls.close, 1);
});

test("same-name partial index fails without creating an index", async () => {
  const fake = createFakeClientClass({
    indexes: [{
      name: BARBER_PROFILE_INDEX_NAME,
      key: BARBER_PROFILE_INDEX_KEY,
      unique: true,
      partialFilterExpression: { barberId: { $exists: true } },
    }],
  });
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result, null);
  assert.equal(fake.calls.createIndex.length, 0);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.equal(fake.calls.close, 1);
});

test("equivalent index under another name fails without creating an index", async () => {
  const fake = createFakeClientClass({
    indexes: [{
      name: "legacy_barberId_unique",
      key: BARBER_PROFILE_INDEX_KEY,
      unique: true,
    }],
  });
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result, null);
  assert.equal(fake.calls.createIndex.length, 0);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.match(capture.stderr.join(""), /manual reconciliation/);
  assert.equal(fake.calls.close, 1);
});

test("apply creates the index once and verifies it", async () => {
  const fake = createFakeClientClass();
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result.mode, "apply");
  assert.equal(capture.result.indexCreated, true);
  assert.deepEqual(fake.calls.createIndex, [{
    key: BARBER_PROFILE_INDEX_KEY,
    options: { unique: true, name: BARBER_PROFILE_INDEX_NAME },
  }]);
  assert.deepEqual(capture.exitCodes, []);
  assert.equal(fake.calls.close, 1);
});

test("sanitizes failures and closes the connection", async () => {
  const fake = createFakeClientClass({
    createIndexError: new Error(
      "E11000 mongodb://user:secret@example.test/hairbook password=db-secret dup key: { barberId: ObjectId('65aabbccddeeff0011223344') }"
    ),
  });
  const capture = await runWithFakeClient(fake, { apply: true });
  const diagnostic = capture.stderr.join("");

  assert.equal(capture.result, null);
  assert.equal(fake.calls.createIndex.length, 1);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.equal(diagnostic.includes("mongodb://user:secret@example.test"), false);
  assert.equal(diagnostic.includes("db-secret"), false);
  assert.equal(diagnostic.includes("65aabbccddeeff0011223344"), false);
  assert.match(diagnostic, /Database operation failed/);
  assert.equal(fake.calls.close, 1);
});

test("connect rejection still closes exactly once", async () => {
  const fake = createFakeClientClass({ connectError: new Error("connect failed") });
  const capture = await runWithFakeClient(fake, { apply: true });

  assert.equal(capture.result, null);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.equal(fake.calls.close, 1);
  assert.match(capture.stderr.join(""), /Database operation failed/);
});

test("close failure keeps the primary failure bounded", async () => {
  const fake = createFakeClientClass({
    connectError: new Error("primary failure ObjectId('65aabbccddeeff0011223344')"),
    closeError: new Error("close failed password=secret"),
  });
  const capture = await runWithFakeClient(fake, { apply: true });
  const diagnostic = capture.stderr.join("");

  assert.equal(capture.result, null);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.equal(fake.calls.close, 1);
  assert.equal(diagnostic.includes("65aabbccddeeff0011223344"), false);
  assert.equal(diagnostic.includes("secret"), false);
  assert.equal(diagnostic.includes("disconnect failed"), false);
});
