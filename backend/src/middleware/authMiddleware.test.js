import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { protect, optionalAuth } from "./authMiddleware.js";

/* ── Stub state ─────────────────────────────────────────── */
const originalFindById = User.findById;

process.env.JWT_SECRET = "test-secret";

afterEach(() => {
  User.findById = originalFindById;
});

/* ── Helpers ────────────────────────────────────────────── */
const validToken = jwt.sign({ id: "user-1" }, process.env.JWT_SECRET);
const badToken = "not-a-real-token";

const makeReq = (headers = {}) => ({ headers: { ...headers } });

const makeRes = () => {
  let statusCode = 200;
  let body;
  return {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
};

const makeNext = () => {
  let called = false;
  const fn = () => { called = true; };
  fn.called = () => called;
  return fn;
};

/**
 * Stub User.findById to return a chainable query-like object.
 * Mongoose: User.findById(id).select(fields) => Promise<result>
 *
 * User.findById must NOT be async — it returns an object with .select(),
 * not a Promise directly. The .select() method returns a Promise.
 */
const stubFindById = (result) => {
  User.findById = () => ({
    select: async () => result,
  });
};

/* ── optionalAuth tests ─────────────────────────────────── */

test("optionalAuth with no auth header calls next without user", async () => {
  const req = makeReq({});
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(next.called(), true);
  assert.equal(req.user, undefined);
});

test("optionalAuth with valid token populates req.user and calls next", async () => {
  stubFindById({ _id: "user-1", role: "barber", name: "Test Barber" });

  const req = makeReq({ authorization: `Bearer ${validToken}` });
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(next.called(), true);
  assert.equal(req.user._id, "user-1");
  assert.equal(req.user.role, "barber");
});

test("optionalAuth with invalid token returns 401", async () => {
  const req = makeReq({ authorization: `Bearer ${badToken}` });
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.called(), false);
  assert.equal(req.user, undefined);
});

test("optionalAuth with expired token returns 401", async () => {
  const expiredToken = jwt.sign({ id: "user-1" }, process.env.JWT_SECRET, { expiresIn: "0ms" });
  // Small delay to ensure the token expires
  await new Promise((r) => setTimeout(r, 15));

  const req = makeReq({ authorization: `Bearer ${expiredToken}` });
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.called(), false);
});

test("optionalAuth with malformed auth header calls next without user", async () => {
  const req = makeReq({ authorization: "Basic somebase64==" });
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(next.called(), true);
  assert.equal(req.user, undefined);
});

test("optionalAuth with valid token but deleted user calls next without user", async () => {
  stubFindById(null);

  const req = makeReq({ authorization: `Bearer ${validToken}` });
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(next.called(), true);
  assert.equal(req.user, undefined);
});

/* ── protect tests (verifying it still works) ───────────── */

test("protect with no auth header returns 401", async () => {
  const req = makeReq({});
  const res = makeRes();
  const next = makeNext();

  await protect(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.called(), false);
});

test("protect with valid token populates req.user and calls next", async () => {
  stubFindById({ _id: "user-1", role: "barber", name: "Test" });

  const req = makeReq({ authorization: `Bearer ${validToken}` });
  const res = makeRes();
  const next = makeNext();

  await protect(req, res, next);

  assert.equal(next.called(), true);
  assert.equal(req.user._id, "user-1");
});

test("protect with invalid token returns 401", async () => {
  const req = makeReq({ authorization: `Bearer ${badToken}` });
  const res = makeRes();
  const next = makeNext();

  await protect(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.called(), false);
});
