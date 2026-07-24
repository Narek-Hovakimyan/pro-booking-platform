import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RuntimeConfigError,
  loadRuntimeConfig,
  validateRuntimeConfig,
} from "./runtimeConfig.js";

function validEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    CLIENT_URL: "https://app.example.com",
    TRUST_PROXY: "true",
    ...overrides,
  };
}

test("accepts all valid NODE_ENV values", () => {
  for (const NODE_ENV of ["development", "test", "production"]) {
    const env = validEnv({ NODE_ENV });
    if (NODE_ENV !== "production") {
      delete env.CLIENT_URL;
      delete env.TRUST_PROXY;
    }

    assert.equal(validateRuntimeConfig(env).nodeEnv, NODE_ENV);
  }
});

test("rejects missing, empty, whitespace, and unsupported NODE_ENV values", () => {
  for (const NODE_ENV of [undefined, "", "   ", "staging"]) {
    assert.throws(
      () => validateRuntimeConfig(validEnv({ NODE_ENV })),
      (error) =>
        error instanceof RuntimeConfigError &&
        error.failures.some((failure) => failure.variable === "NODE_ENV")
    );
  }
});

test("allows development localhost origins", () => {
  const config = validateRuntimeConfig({
    NODE_ENV: "development",
    CLIENT_URL: " http://localhost:5173, http://127.0.0.1:3000 ",
  });

  assert.deepEqual(config.clientOrigins, [
    "http://localhost:5173",
    "http://127.0.0.1:3000",
  ]);
});

test("production rejects missing CLIENT_URL", () => {
  assert.throws(
    () => validateRuntimeConfig(validEnv({ CLIENT_URL: " " })),
    /CLIENT_URL:missing/
  );
});

test("production rejects malformed origins", () => {
  for (const CLIENT_URL of ["not-a-url", "ftp://app.example.com", "https://app.example.com/path"]) {
    assert.throws(
      () => validateRuntimeConfig(validEnv({ CLIENT_URL })),
      (error) =>
        error instanceof RuntimeConfigError &&
        error.failures.some((failure) => failure.variable === "CLIENT_URL")
    );
  }
});

test("production rejects localhost and loopback origins", () => {
  for (const CLIENT_URL of [
    "http://localhost:5173",
    "http://localhost.",
    "http://LOCALHOST.",
    "http://local.dev.localhost",
    "http://local.dev.localhost.",
    "http://127.0.0.1:3000",
    "http://127.22.33.44:3000",
    "http://[::1]:3000",
    "http://[0:0:0:0:0:0:0:1]:3000",
    "http://[::ffff:127.0.0.1]:3000",
    "http://[::ffff:7f00:1]:3000",
    "http://[0:0:0:0:0:ffff:7f00:1]:3000",
  ]) {
    assert.throws(
      () => validateRuntimeConfig(validEnv({ CLIENT_URL })),
      /CLIENT_URL:localhost_or_loopback/
    );
  }
});

test("production allows public hostnames containing localhost", () => {
  const config = validateRuntimeConfig(validEnv({
    CLIENT_URL: "https://notlocalhost.example.com,https://localhost-app.example.com",
  }));

  assert.deepEqual(config.clientOrigins, [
    "https://notlocalhost.example.com",
    "https://localhost-app.example.com",
  ]);
});

test("production rejects empty CLIENT_URL entries", () => {
  for (const CLIENT_URL of [
    ",https://app.example.com",
    "https://app.example.com,",
    "https://app.example.com,,https://admin.example.com",
    "https://app.example.com,   ,https://admin.example.com",
  ]) {
    assert.throws(
      () => validateRuntimeConfig(validEnv({ CLIENT_URL })),
      /CLIENT_URL:empty_origin/
    );
  }
});

test("production requires TRUST_PROXY=true", () => {
  for (const TRUST_PROXY of [undefined, "", "false", " true "]) {
    const assertion = () => validateRuntimeConfig(validEnv({ TRUST_PROXY }));

    if (TRUST_PROXY === " true ") {
      assert.equal(assertion().trustProxy, true);
    } else {
      assert.throws(assertion, /TRUST_PROXY:required_true/);
    }
  }
});

test("production preserves multiple valid origins after normalization", () => {
  const config = loadRuntimeConfig(validEnv({
    CLIENT_URL: " https://app.example.com,https://admin.example.com/ ",
  }));

  assert.deepEqual(config.clientOrigins, [
    "https://app.example.com",
    "https://admin.example.com",
  ]);
  assert.equal(config.clientUrl, "https://app.example.com,https://admin.example.com");
});

test("errors never include secret or configuration values", () => {
  const env = validEnv({
    NODE_ENV: "staging-secret-value",
    CLIENT_URL: "https://secret-app.example.com/path",
    MONGO_URI: "mongodb://user:pass@cluster.example.com/db",
    JWT_SECRET: "jwt-secret-value",
  });

  assert.throws(
    () => validateRuntimeConfig(env),
    (error) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.ok(!error.message.includes(env.NODE_ENV));
      assert.ok(!error.message.includes(env.CLIENT_URL));
      assert.ok(!error.message.includes(env.MONGO_URI));
      assert.ok(!error.message.includes(env.JWT_SECRET));
      assert.match(error.message, /NODE_ENV:unsupported/);
      assert.match(error.message, /CLIENT_URL:origin_must_not_include_path/);
      return true;
    }
  );
});
