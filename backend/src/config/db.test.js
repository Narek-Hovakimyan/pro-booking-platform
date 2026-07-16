import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";
import mongoose from "mongoose";

import connectDB from "./db.js";
import { getLogger, resetLogger } from "./logger.js";

const originalConnect = mongoose.connect;
const originalExit = process.exit;
const originalMongoUri = process.env.MONGO_URI;

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

beforeEach(() => {
  getLogger({ level: "silent" });
});

afterEach(() => {
  mongoose.connect = originalConnect;
  process.exit = originalExit;
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
  mongoose.connect = async (uri) => {
    assert.equal(uri, mongoUri);
    return { connection: { host: "private-cluster.example.com", name: "hairbook" } };
  };

  await connectDB();

  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "database.connected");
  assert.equal(lines[0].component, "database");
  assert.equal(lines[0].database, "mongodb");
  const output = JSON.stringify(lines);
  assert.equal(output.includes(mongoUri), false);
  assert.equal(output.includes("db-user"), false);
  assert.equal(output.includes("db-password"), false);
  assert.equal(output.includes("private-cluster.example.com"), false);
});

test("MongoDB connection failure is sanitized and preserves exit behavior", async () => {
  const mongoUri = "mongodb://db-user:db-password@private-host.example.com:27017/hairbook";
  process.env.MONGO_URI = mongoUri;
  resetLogger();
  const { lines, stream } = makeLoggerStream();
  getLogger({ level: "info", stream });
  mongoose.connect = async () => {
    const error = new Error(`connection failed for ${mongoUri}?token=driver-token`);
    error.config = {
      auth: { username: "db-user", password: "db-password" },
      headers: { authorization: "Bearer driver-secret" },
    };
    throw error;
  };
  const exitCalls = [];
  process.exit = (code) => {
    exitCalls.push(code);
  };

  await connectDB();

  assert.deepEqual(exitCalls, [1]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "database.connection_failed");
  assert.equal(lines[0].err.config, undefined);
  const output = JSON.stringify(lines);
  assert.equal(output.includes(mongoUri), false);
  assert.equal(output.includes("db-user"), false);
  assert.equal(output.includes("db-password"), false);
  assert.equal(output.includes("private-host.example.com"), false);
  assert.equal(output.includes("driver-token"), false);
  assert.equal(output.includes("driver-secret"), false);
});
