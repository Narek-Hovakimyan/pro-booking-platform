import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import { optionalAuth, protect } from "./authMiddleware.js";

const originalFindById = User.findById;
const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "auth-middleware-test-secret";

const makeReq = (authorization) => ({
  headers: authorization ? { authorization } : {},
});

const makeRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const makeNext = () => {
  let callCount = 0;
  const next = () => {
    callCount += 1;
  };
  next.callCount = () => callCount;
  return next;
};

const selectable = (result, onSelect = () => {}) => ({
  select(fields) {
    onSelect(fields);
    return result;
  },
});

const signToken = (payload, options = {}) =>
  jwt.sign(payload, jwtSecret, options);

afterEach(() => {
  User.findById = originalFindById;

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("protect returns 401 when authorization header is missing", async () => {
  process.env.JWT_SECRET = jwtSecret;
  const req = makeReq();
  const res = makeRes();
  const next = makeNext();

  await protect(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Not authorized, no token" });
  assert.equal(next.callCount(), 0);
  assert.equal(req.user, undefined);
});

test("protect returns 401 for non-Bearer and empty Bearer headers", async () => {
  process.env.JWT_SECRET = jwtSecret;

  for (const authorization of ["Basic abc123", "Bearer "]) {
    const req = makeReq(authorization);
    const res = makeRes();
    const next = makeNext();

    await protect(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.callCount(), 0);
    assert.equal(req.user, undefined);
  }
});

test("protect returns 401 for invalid and expired tokens", async () => {
  process.env.JWT_SECRET = jwtSecret;

  for (const token of ["not-a-jwt", signToken({ id: "user-1" }, { expiresIn: -1 })]) {
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = makeNext();

    await protect(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: "Not authorized, token failed" });
    assert.equal(next.callCount(), 0);
  }
});

test("protect verifies JWT, loads the user from the database, and excludes password", async () => {
  process.env.JWT_SECRET = jwtSecret;
  const user = { _id: "64d000000000000000000001", role: "barber", name: "Loaded User" };
  const lookupCalls = [];
  let selectedFields = "";

  User.findById = (id) => {
    lookupCalls.push(id);
    return selectable(user, (fields) => {
      selectedFields = fields;
    });
  };

  const req = makeReq(`Bearer ${signToken({ id: user._id, role: "client", salons: ["forged"] })}`);
  const res = makeRes();
  const next = makeNext();

  await protect(req, res, next);

  assert.deepEqual(lookupCalls, [user._id]);
  assert.equal(selectedFields, "-password");
  assert.equal(req.user, user);
  assert.equal(req.user.role, "barber");
  assert.equal(next.callCount(), 1);
  assert.equal(res.statusCode, 200);
});

test("protect returns 401 when a valid token references a missing user", async () => {
  process.env.JWT_SECRET = jwtSecret;
  let selectedFields = "";
  User.findById = (id) => {
    assert.equal(id, "64d000000000000000000001");
    return selectable(null, (fields) => {
      selectedFields = fields;
    });
  };

  const req = makeReq(`Bearer ${signToken({ id: "64d000000000000000000001" })}`);
  const res = makeRes();
  const next = makeNext();

  await protect(req, res, next);

  assert.equal(selectedFields, "-password");
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Not authorized, user not found" });
  assert.equal(next.callCount(), 0);
  assert.equal(req.user, undefined);
});

test("optionalAuth continues anonymously with no header or non-Bearer authorization", async () => {
  process.env.JWT_SECRET = jwtSecret;

  for (const authorization of [undefined, "Basic abc123"]) {
    const req = makeReq(authorization);
    const res = makeRes();
    const next = makeNext();

    await optionalAuth(req, res, next);

    assert.equal(next.callCount(), 1);
    assert.equal(res.statusCode, 200);
    assert.equal(req.user, undefined);
  }
});

test("optionalAuth sets req.user for a valid Bearer token and calls next once", async () => {
  process.env.JWT_SECRET = jwtSecret;
  const user = { _id: "64d000000000000000000010", role: "client" };
  let selectedFields = "";

  User.findById = (id) => {
    assert.equal(id, user._id);
    return selectable(user, (fields) => {
      selectedFields = fields;
    });
  };

  const req = makeReq(`Bearer ${signToken({ id: user._id })}`);
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(selectedFields, "-password");
  assert.equal(req.user, user);
  assert.equal(next.callCount(), 1);
  assert.equal(res.statusCode, 200);
});

test("optionalAuth returns 401 for invalid and expired Bearer tokens", async () => {
  process.env.JWT_SECRET = jwtSecret;

  for (const token of ["not-a-jwt", signToken({ id: "user-1" }, { expiresIn: -1 })]) {
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = makeNext();

    await optionalAuth(req, res, next);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: "Not authorized, token failed" });
    assert.equal(next.callCount(), 0);
    assert.equal(req.user, undefined);
  }
});

test("optionalAuth keeps current anonymous behavior when a valid token references a missing user", async () => {
  process.env.JWT_SECRET = jwtSecret;
  let selectedFields = "";

  User.findById = (id) => {
    assert.equal(id, "64d000000000000000000020");
    return selectable(null, (fields) => {
      selectedFields = fields;
    });
  };

  const req = makeReq(`Bearer ${signToken({ id: "64d000000000000000000020", role: "forged" })}`);
  const res = makeRes();
  const next = makeNext();

  await optionalAuth(req, res, next);

  assert.equal(selectedFields, "-password");
  assert.equal(req.user, undefined);
  assert.equal(next.callCount(), 1);
  assert.equal(res.statusCode, 200);
});
