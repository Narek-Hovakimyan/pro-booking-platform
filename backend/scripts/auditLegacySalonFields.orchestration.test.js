import test from "node:test";
import assert from "node:assert/strict";

import {
  connectAuditDatabase,
  runAudit,
} from "./auditLegacySalonFields.js";

const phaseError = (phase, message) => Object.assign(new Error(message), { auditPhase: phase });

const runWithCapture = async (overrides = {}) => {
  const stdout = [];
  const stderr = [];
  const exitCodes = [];
  let disconnectCalls = 0;
  const result = await runAudit({
    connect: async () => {},
    disconnect: async () => {
      disconnectCalls += 1;
    },
    getUsers: async () => [],
    getSalons: async () => [],
    buildReport: () => ({ readOnly: true }),
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
    ...overrides,
  });

  return { result, stdout, stderr, exitCodes, disconnectCalls };
};

test("reports both a classification failure and a later disconnect failure", async () => {
  const events = [];
  let disconnectCalls = 0;
  const capture = await runWithCapture({
    connect: async () => events.push("connect"),
    disconnect: async () => {
      events.push("disconnect");
      disconnectCalls += 1;
      throw new Error("disconnect exploded");
    },
    buildReport: () => {
      events.push("classification");
      throw new Error("classification exploded");
    },
  });

  assert.deepEqual(events, ["connect", "classification", "disconnect"]);
  assert.equal(disconnectCalls, 1);
  assert.deepEqual(capture.stdout, []);
  assert.deepEqual(capture.exitCodes, [1, 1]);
  assert.equal(capture.stderr.length, 2);
  assert.match(capture.stderr[0], /classification failed: classification exploded/);
  assert.match(capture.stderr[1], /disconnect failed: disconnect exploded/);
});

test("redacts common secrets while preserving safe query identity", async () => {
  const rawSecrets = [
    "mongodb://alice:db-password@example.test/audit",
    "plain-password",
    "access-value",
    "refresh-value",
    "api-value",
    "bearer-value",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    "person@example.com",
  ];
  const capture = await runWithCapture({
    getUsers: async () => {
      throw new Error(
        `query exploded ${rawSecrets[0]} password=${rawSecrets[1]} ` +
        `accessToken=${rawSecrets[2]} refreshToken=${rawSecrets[3]} apiKey=${rawSecrets[4]} ` +
        `Authorization: Bearer ${rawSecrets[5]} token=${rawSecrets[6]} email=${rawSecrets[7]}`
      );
    },
  });
  const diagnostic = capture.stderr.join("");

  assert.equal(capture.stdout.length, 0);
  assert.deepEqual(capture.exitCodes, [1]);
  assert.match(diagnostic, /query failed: query exploded/);
  assert.match(diagnostic, /\[redacted MongoDB URI\]/);
  assert.match(diagnostic, /\[redacted\]/);
  for (const secret of rawSecrets) assert.equal(diagnostic.includes(secret), false);
  assert.equal(diagnostic.includes("\n"), true);
  assert.equal(diagnostic.split("\n").filter(Boolean).length, 1);
});

test("redacts non-Error thrown values without losing the failure phase", async () => {
  const capture = await runWithCapture({
    getUsers: async () => {
      throw { toString: () => "query exploded secret=non-error-secret" };
    },
  });
  const diagnostic = capture.stderr.join("");

  assert.match(diagnostic, /query failed: query exploded/);
  assert.match(diagnostic, /secret=\[redacted\]/);
  assert.equal(diagnostic.includes("non-error-secret"), false);
  assert.deepEqual(capture.exitCodes, [1]);
});

test("configuration and connection failures remain identifiable without disconnecting", async () => {
  const cases = [
    {
      name: "configuration",
      error: phaseError("configuration", "configuration exploded"),
      expected: /configuration failed: configuration exploded/,
    },
    {
      name: "connection",
      error: new Error("connection exploded"),
      expected: /connection failed: connection exploded/,
    },
    {
      name: "non-Error connection",
      error: { toString: () => "connection non-error exploded" },
      expected: /connection failed: connection non-error exploded/,
    },
  ];

  for (const item of cases) {
    const capture = await runWithCapture({
      connect: async () => {
        throw item.error;
      },
    });
    assert.equal(capture.disconnectCalls, 0, item.name);
    assert.deepEqual(capture.stdout, [], item.name);
    assert.deepEqual(capture.exitCodes, [1], item.name);
    assert.match(capture.stderr.join(""), item.expected, item.name);
  }
});

test("preserves exact String identity for primitive non-Error failures", async () => {
  const cases = [
    ["empty string", "", ""],
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
    ["number", 42, "42"],
  ];

  for (const [name, value, expectedMessage] of cases) {
    const capture = await runWithCapture({
      getUsers: async () => {
        throw value;
      },
    });

    assert.deepEqual(capture.stdout, [], name);
    assert.deepEqual(capture.exitCodes, [1], name);
    assert.equal(capture.disconnectCalls, 1, name);
    assert.equal(
      capture.stderr.join(""),
      `Legacy salon field audit query failed: ${expectedMessage}\n`,
      name
    );
    if (name === "empty string") {
      assert.equal(capture.stderr.join("").includes("Unknown error"), false);
    }
  }
});

test("validates missing configuration before invoking mongoose connect", async () => {
  let mongooseConnectCalls = 0;
  let disconnectCalls = 0;
  const stdout = [];
  const stderr = [];
  const exitCodes = [];

  await runAudit({
    connect: () => connectAuditDatabase({
      environment: {},
      connect: async () => {
        mongooseConnectCalls += 1;
      },
    }),
    disconnect: async () => {
      disconnectCalls += 1;
    },
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    setExitCode: (code) => exitCodes.push(code),
  });

  assert.equal(mongooseConnectCalls, 0);
  assert.equal(disconnectCalls, 0);
  assert.deepEqual(stdout, []);
  assert.deepEqual(exitCodes, [1]);
  assert.equal(
    stderr.join(""),
    "Legacy salon field audit configuration failed: MONGO_URI must be configured\n"
  );
  assert.doesNotMatch(stderr.join(""), /mongodb(?:\+srv)?:\/\//i);
});
