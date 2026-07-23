import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";

import {
  ACCESS_TOKEN_EXPIRES_IN,
  assertAccessTokenMatchesUser,
  signAccessTokenForUser,
  verifyAccessToken,
} from "./accessTokenService.js";
import { serializeAuthUser } from "./authResponseService.js";

const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "access-token-service-test-secret";
const userId = "64d000000000000000000001";

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test("signs a versioned 30-day token with string id and integer auth version", () => {
  process.env.JWT_SECRET = jwtSecret;
  const token = signAccessTokenForUser({ _id: userId, authVersion: 7 });
  const decoded = jwt.verify(token, jwtSecret);

  assert.equal(decoded.id, userId);
  assert.equal(decoded.av, 7);
  assert.ok(Math.abs(decoded.exp - decoded.iat - 30 * 24 * 60 * 60) <= 5);
  assert.equal(ACCESS_TOKEN_EXPIRES_IN, "30d");
});

test("existing users with absent authVersion sign as version zero", () => {
  process.env.JWT_SECRET = jwtSecret;
  assert.equal(jwt.verify(signAccessTokenForUser({ _id: userId }), jwtSecret).av, 0);
});

test("signing rejects missing secret, missing id, and malformed auth versions", () => {
  delete process.env.JWT_SECRET;
  assert.throws(() => signAccessTokenForUser({ _id: userId }), /JWT_SECRET/);

  process.env.JWT_SECRET = jwtSecret;
  assert.throws(() => signAccessTokenForUser({ authVersion: 0 }), /user\._id/);
  for (const authVersion of [-1, 1.5, NaN, "1", null]) {
    assert.throws(() => signAccessTokenForUser({ _id: userId, authVersion }));
  }
});

test("verifies exact token version and rejects legacy or malformed payloads", () => {
  process.env.JWT_SECRET = jwtSecret;
  const valid = signAccessTokenForUser({ _id: userId, authVersion: 2 });
  assert.deepEqual(
    { id: verifyAccessToken(valid).id, av: verifyAccessToken(valid).av },
    { id: userId, av: 2 }
  );

  for (const payload of [
    { id: userId },
    { id: userId, av: -1 },
    { id: userId, av: 1.5 },
    { id: userId, av: "0" },
    { id: userId, av: null },
    { av: 0 },
  ]) {
    assert.throws(() => verifyAccessToken(jwt.sign(payload, jwtSecret)));
  }
});

test("rejects expired and invalid-signature tokens", () => {
  process.env.JWT_SECRET = jwtSecret;
  const expired = jwt.sign({ id: userId, av: 0 }, jwtSecret, { expiresIn: -1 });
  assert.throws(() => verifyAccessToken(expired));

  const otherSecretToken = jwt.sign({ id: userId, av: 0 }, "other-secret");
  assert.throws(() => verifyAccessToken(otherSecretToken));
});

test("compares token version to current user authVersion exactly", () => {
  assert.equal(assertAccessTokenMatchesUser({ av: 0 }, { authVersion: 0 }), true);
  assert.equal(assertAccessTokenMatchesUser({ av: 0 }, {}), true);
  assert.throws(() => assertAccessTokenMatchesUser({ av: 1 }, { authVersion: 0 }));
  assert.throws(() => assertAccessTokenMatchesUser({ av: 0 }, { authVersion: -1 }));
  assert.throws(() => assertAccessTokenMatchesUser({ av: 0 }, { authVersion: 1.5 }));
});

test("serialized public auth user never exposes authVersion", () => {
  const publicUser = serializeAuthUser({
    _id: userId,
    name: "Private Version",
    phone: "+37400111222",
    role: "client",
    authVersion: 4,
  });

  assert.equal(publicUser.authVersion, undefined);
});
