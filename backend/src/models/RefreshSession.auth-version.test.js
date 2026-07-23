import assert from "node:assert/strict";
import { test } from "node:test";

import RefreshSession from "./RefreshSession.js";

test("RefreshSession authVersion defaults to zero and is internal", () => {
  const path = RefreshSession.schema.path("authVersion");
  const session = new RefreshSession({
    userId: "64d000000000000000000001",
    familyId: "family-1",
    tokenHash: "hash",
    expiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal(path.options.select, false);
  assert.equal(session.authVersion, 0);
});

test("RefreshSession authVersion accepts only non-negative integers", () => {
  for (const authVersion of [0, 1, 12]) {
    const session = new RefreshSession({
      userId: "64d000000000000000000001",
      familyId: `family-${authVersion}`,
      tokenHash: `hash-${authVersion}`,
      expiresAt: new Date(Date.now() + 60_000),
      authVersion,
    });
    assert.equal(session.validateSync(), undefined);
  }

  for (const authVersion of [-1, 1.5, NaN, "1", null]) {
    const session = new RefreshSession({
      userId: "64d000000000000000000001",
      familyId: "family-invalid",
      tokenHash: "hash-invalid",
      expiresAt: new Date(Date.now() + 60_000),
      authVersion,
    });
    assert.ok(session.validateSync()?.errors.authVersion);
  }
});

