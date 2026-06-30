import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  isPlatformAdmin,
  isPlatformSuperuser,
  requirePlatformAdmin,
  requirePlatformSuperuser,
  resetAllowlistCache,
} from "./platformMiddleware.js";

afterEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.PLATFORM_ADMIN_IDS;
  resetAllowlistCache();
});

/* ── isPlatformAdmin tests ───────────────────────────── */

test("isPlatformAdmin returns false for null/undefined user", () => {
  assert.equal(isPlatformAdmin(null), false);
  assert.equal(isPlatformAdmin(undefined), false);
});

test("isPlatformAdmin returns false for user without _id", () => {
  assert.equal(isPlatformAdmin({}), false);
});

test("isPlatformAdmin returns false for normal barber without platformRole and without allowlist", () => {
  const user = {
    _id: "64b000000000000000000001",
    role: "barber",
    email: "barber@example.com",
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), false);
});

test("isPlatformAdmin returns false for normal client without platformRole and without allowlist", () => {
  const user = {
    _id: "64b000000000000000000002",
    role: "client",
    email: "client@example.com",
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), false);
});

test("isPlatformSuperuser returns true for user with platformRole superuser", () => {
  const user = {
    _id: "64b000000000000000000003",
    role: "barber",
    email: "superuser-barber@example.com",
    platformRole: "superuser",
  };
  assert.equal(isPlatformSuperuser(user), true);
  assert.equal(isPlatformAdmin(user), true);
});

test("isPlatformAdmin returns false for old platformRole admin without allowlist", () => {
  const user = {
    _id: "64b000000000000000000004",
    role: "barber",
    email: "old-admin-no-allowlist@example.com",
    platformRole: "admin",
  };
  assert.equal(isPlatformAdmin(user), false);
  assert.equal(isPlatformSuperuser(user), false);
});

test("old platformRole admin can pass only through env allowlist", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "old-admin@example.com";

  const user = {
    _id: "64b000000000000000000004",
    role: "barber",
    email: "old-admin@example.com",
    emailVerified: true,
    platformRole: "admin",
  };
  assert.equal(isPlatformSuperuser(user), true);
});

test("isPlatformAdmin returns true for env allowlisted email", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com,owner@example.com";
  resetAllowlistCache();

  const user = {
    _id: "64b000000000000000000005",
    role: "barber",
    email: "admin@example.com",
    emailVerified: true,
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), true);
});

test("isPlatformAdmin returns false for unverified env allowlisted email", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
  resetAllowlistCache();

  const user = {
    _id: "64b000000000000000000033",
    role: "barber",
    email: "admin@example.com",
    emailVerified: false,
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), false);
});

test("isPlatformAdmin returns false for non-allowlisted email", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
  resetAllowlistCache();

  const user = {
    _id: "64b000000000000000000006",
    role: "barber",
    email: "other@example.com",
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), false);
});

test("isPlatformAdmin returns true for env allowlisted id", () => {
  process.env.PLATFORM_ADMIN_IDS = "64b000000000000000000010";
  resetAllowlistCache();

  const user = {
    _id: "64b000000000000000000010",
    role: "barber",
    email: "any@example.com",
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), true);
});

test("isPlatformAdmin returns false for non-allowlisted id", () => {
  process.env.PLATFORM_ADMIN_IDS = "64b000000000000000000010";
  resetAllowlistCache();

  const user = {
    _id: "64b000000000000000000099",
    role: "barber",
    email: "any@example.com",
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), false);
});

test("isPlatformAdmin respects both allowlists simultaneously", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "email-admin@example.com";
  process.env.PLATFORM_ADMIN_IDS = "64b000000000000000000020";
  resetAllowlistCache();

  const byEmail = {
    _id: "64b000000000000000000099",
    role: "barber",
    email: "email-admin@example.com",
    emailVerified: true,
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(byEmail), true);

  const byId = {
    _id: "64b000000000000000000020",
    role: "barber",
    email: "some-other@example.com",
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(byId), true);
});

test("isPlatformAdmin is case-insensitive for email allowlist", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "Admin@Example.COM";
  resetAllowlistCache();

  const user = {
    _id: "64b000000000000000000030",
    role: "barber",
    email: "admin@example.com",
    emailVerified: true,
    platformRole: null,
  };
  assert.equal(isPlatformAdmin(user), true);
});

test("isPlatformAdmin trims user email and ignores empty allowlist entries", () => {
  process.env.PLATFORM_ADMIN_EMAILS = " , admin@example.com, , ";

  const user = {
    _id: "64b000000000000000000031",
    role: "barber",
    email: " Admin@Example.com ",
    emailVerified: true,
    platformRole: null,
  };

  assert.equal(isPlatformAdmin(user), true);
});

test("isPlatformAdmin reflects env allowlist changes without stale cache", () => {
  const user = {
    _id: "64b000000000000000000032",
    role: "barber",
    email: "revoked@example.com",
    emailVerified: true,
    platformRole: null,
  };

  process.env.PLATFORM_ADMIN_EMAILS = "revoked@example.com";
  assert.equal(isPlatformAdmin(user), true);

  process.env.PLATFORM_ADMIN_EMAILS = "";
  assert.equal(isPlatformAdmin(user), false);
});

test("isPlatformAdmin returns false for allowlisted user without _id", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
  resetAllowlistCache();

  assert.equal(isPlatformAdmin({ email: "admin@example.com" }), false);
});

/* ── requirePlatformAdmin middleware tests ────────────── */

test("requirePlatformAdmin returns 401 when req.user is missing", () => {
  let statusCode;
  let body;

  const req = {};
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  requirePlatformAdmin(req, res, () => {
    assert.fail("next should not be called");
  });

  assert.equal(statusCode, 401);
  assert.equal(body.message, "Not authorized, no token");
});

test("requirePlatformAdmin returns 403 for authenticated normal barber", () => {
  let statusCode;
  let body;

  const req = {
    user: {
      _id: "64b000000000000000000001",
      role: "barber",
      email: "barber@example.com",
      platformRole: null,
    },
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  requirePlatformAdmin(req, res, () => {
    assert.fail("next should not be called");
  });

  assert.equal(statusCode, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.message, "Platform superuser access required");
});

test("requirePlatformAdmin returns 403 for authenticated normal client", () => {
  let statusCode;
  let body;

  const req = {
    user: {
      _id: "64b000000000000000000002",
      role: "client",
      email: "client@example.com",
      platformRole: null,
    },
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  requirePlatformAdmin(req, res, () => {
    assert.fail("next should not be called");
  });

  assert.equal(statusCode, 403);
});

test("requirePlatformSuperuser calls next for platformRole superuser", () => {
  const req = {
    user: {
      _id: "64b000000000000000000003",
      role: "barber",
      email: "superuser@example.com",
      platformRole: "superuser",
    },
  };
  const res = { status() { return this; }, json() { return this; } };

  let nextCalled = false;
  requirePlatformSuperuser(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

test("requirePlatformAdmin alias uses platform superuser logic", () => {
  const req = {
    user: {
      _id: "64b000000000000000000007",
      role: "client",
      email: "old-admin@example.com",
      platformRole: "admin",
    },
  };
  const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };

  requirePlatformAdmin(req, res, () => {
    assert.fail("next should not be called");
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Platform superuser access required");
});

test("requirePlatformAdmin calls next for env allowlisted email", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
  resetAllowlistCache();

  const req = {
    user: {
      _id: "64b000000000000000000004",
      role: "barber",
      email: "admin@example.com",
      emailVerified: true,
      platformRole: null,
    },
  };
  const res = { status() { return this; }, json() { return this; } };

  let nextCalled = false;
  requirePlatformAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

test("requirePlatformAdmin calls next for env allowlisted id", () => {
  process.env.PLATFORM_ADMIN_IDS = "64b000000000000000000010";
  resetAllowlistCache();

  const req = {
    user: {
      _id: "64b000000000000000000010",
      role: "barber",
      email: "any@example.com",
      platformRole: null,
    },
  };
  const res = { status() { return this; }, json() { return this; } };

  let nextCalled = false;
  requirePlatformAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

test("existing client and barber users without platformRole remain valid — isPlatformAdmin returns false", () => {
  // Simulates that existing users without platformRole continue to work normally
  const clientUser = {
    _id: "64b000000000000000000005",
    role: "client",
    email: "client@test.com",
  };
  // platformRole is undefined (not set on existing documents)
  assert.equal(isPlatformAdmin(clientUser), false);

  const barberUser = {
    _id: "64b000000000000000000006",
    role: "barber",
    email: "barber@test.com",
  };
  assert.equal(isPlatformAdmin(barberUser), false);
});
