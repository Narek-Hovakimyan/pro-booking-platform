import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";
import mongoose from "mongoose";

import connectDB from "./db.js";
import { getLogger, resetLogger } from "./logger.js";
import {
  __sentryTestHooks,
  initializeSentry,
} from "./sentry.js";

const originalConnect = mongoose.connect;
const originalExit = process.exit;
const originalMongoUri = process.env.MONGO_URI;
const enabledSentryEnv = {
  NODE_ENV: "production",
  SENTRY_ENABLED: "true",
  SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
};

const makeLoggerStream = () => {
  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { lines, stream };
};

const hostileValues = [
  "mongodb://username:password@example.com/private-db",
  "mongodb+srv://secret.example.com/private-db",
  "secret.example.internal",
  "-----BEGIN CERTIFICATE-----",
  "/home/narek/private/project/file.js",
  "C:\\Users\\secret\\project\\file.js",
  "driverOptionSecret",
  "DNS lookup failed for secret.example.internal",
];

const makeHostileDriverError = () => {
  const error = new Error(`original Mongo error: ${hostileValues.join(" | ")}`);
  error.stack = `MongoServerSelectionError: ${hostileValues.join("\n")}`;
  error.cause = { options: { driverOptionSecret: hostileValues[6] } };
  error.config = { uri: hostileValues[0], options: { certificate: hostileValues[3] } };
  return error;
};

const assertDoesNotContainHostileData = (value) => {
  const serialized = JSON.stringify(value);
  for (const hostileValue of hostileValues) {
    assert.equal(serialized.includes(hostileValue), false);
  }
  assert.equal(serialized.includes("original Mongo error"), false);
};

const initializeFakeSentry = (behavior = {}) => {
  const captures = [];
  const flushes = [];
  __sentryTestHooks.reset();
  __sentryTestHooks.setSdk({
    init() {},
    captureException(error, context) {
      captures.push([error, context]);
      return behavior.captureException?.();
    },
    flush(timeoutMs) {
      flushes.push(timeoutMs);
      return behavior.flush?.();
    },
  });
  initializeSentry(enabledSentryEnv);
  return { captures, flushes };
};

const prepareFailureLogger = () => {
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });
  return lines;
};

beforeEach(() => {
  __sentryTestHooks.reset();
  getLogger({ level: "silent" });
});

afterEach(() => {
  mongoose.connect = originalConnect;
  process.exit = originalExit;
  __sentryTestHooks.reset();
  resetLogger();
  if (originalMongoUri === undefined) {
    delete process.env.MONGO_URI;
  } else {
    process.env.MONGO_URI = originalMongoUri;
  }
});

test("successful MongoDB connection emits a safe structured event", async () => {
  const mongoUri = "mongodb+srv://db-user:db-password@private-cluster.example.com/hairbook";
  process.env.MONGO_URI = mongoUri;
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });
  const { captures, flushes } = initializeFakeSentry();
  const exitCalls = [];
  process.exit = (code) => { exitCalls.push(code); };
  let connectCalls = 0;
  mongoose.connect = async (uri) => {
    connectCalls += 1;
    assert.equal(uri, mongoUri);
    return { connection: { host: "private-cluster.example.com", name: "hairbook" } };
  };

  await connectDB();

  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "database.connected");
  assert.equal(lines[0].component, "database");
  assert.equal(lines[0].database, "mongodb");
  assert.equal(connectCalls, 1);
  assert.deepEqual(captures, []);
  assert.deepEqual(flushes, []);
  assert.deepEqual(exitCalls, []);
  const output = JSON.stringify(lines);
  assert.equal(output.includes(mongoUri), false);
  assert.equal(output.includes("db-user"), false);
  assert.equal(output.includes("db-password"), false);
  assert.equal(output.includes("private-cluster.example.com"), false);
});

test("every DB startup failure logs only fixed metadata and exits once", async () => {
  const cases = [
    {
      name: "missing URI",
      reason: "configuration_missing",
      setup() { delete process.env.MONGO_URI; },
      connectCalls: 0,
    },
    {
      name: "placeholder URI",
      reason: "configuration_missing",
      setup() { process.env.MONGO_URI = "your_mongodb_connection_string"; },
      connectCalls: 0,
    },
    {
      name: "invalid URI scheme",
      reason: "configuration_invalid",
      setup() { process.env.MONGO_URI = "https://secret.example.internal/private-db"; },
      connectCalls: 0,
    },
    {
      name: "synchronous mongoose throw",
      reason: "connection_failed",
      setup() {
        process.env.MONGO_URI = hostileValues[0];
        mongoose.connect = () => { throw makeHostileDriverError(); };
      },
      connectCalls: 1,
    },
    {
      name: "asynchronous mongoose rejection",
      reason: "connection_failed",
      setup() {
        process.env.MONGO_URI = hostileValues[1];
        mongoose.connect = async () => { throw makeHostileDriverError(); };
      },
      connectCalls: 1,
    },
  ];

  for (const failureCase of cases) {
    const lines = prepareFailureLogger();
    const { captures, flushes } = initializeFakeSentry();
    const exitCalls = [];
    let connectCalls = 0;
    process.exit = (code) => { exitCalls.push(code); };
    failureCase.setup();
    const configuredConnect = mongoose.connect;
    mongoose.connect = (...args) => {
      connectCalls += 1;
      return configuredConnect(...args);
    };

    await connectDB();

    assert.equal(lines.length, 1, failureCase.name);
    assert.equal(lines[0].event, "database.connection_failed", failureCase.name);
    assert.equal(lines[0].component, "database", failureCase.name);
    assert.equal(lines[0].phase, "startup", failureCase.name);
    assert.equal(lines[0].reason, failureCase.reason, failureCase.name);
    assert.equal(lines[0].err, undefined, failureCase.name);
    assert.deepEqual(exitCalls, [1], failureCase.name);
    assert.equal(connectCalls, failureCase.connectCalls, failureCase.name);
    assert.equal(captures.length, 1, failureCase.name);
    assert.equal(captures[0][0].message, "Application startup failure", failureCase.name);
    assert.deepEqual(captures[0][1], {
      level: "fatal",
      tags: { component: "database" },
    }, failureCase.name);
    assert.deepEqual(flushes, [1000], failureCase.name);
    assertDoesNotContainHostileData(lines);
    assertDoesNotContainHostileData(captures);
  }
});

test("Sentry helper failures do not add logs or prevent the required exit", async () => {
  for (const behavior of [
    { captureException() { throw new Error("capture private-secret"); } },
    { flush() { return Promise.reject(new Error("flush private-secret")); } },
  ]) {
    const lines = prepareFailureLogger();
    const { captures, flushes } = initializeFakeSentry(behavior);
    const exitCalls = [];
    process.env.MONGO_URI = hostileValues[0];
    mongoose.connect = () => { throw makeHostileDriverError(); };
    process.exit = (code) => { exitCalls.push(code); };

    await assert.doesNotReject(() => connectDB());

    assert.equal(lines.length, 1);
    assert.deepEqual(exitCalls, [1]);
    assert.equal(flushes.length, 1);
    assertDoesNotContainHostileData(lines);
    assertDoesNotContainHostileData(captures);
  }
});
