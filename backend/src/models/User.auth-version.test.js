import assert from "node:assert/strict";
import { test } from "node:test";

import User from "./User.js";

test("authVersion defaults to zero and is excluded from default query selection", () => {
  const path = User.schema.path("authVersion");
  const user = new User({
    name: "Versioned User",
    phone: "+37400111222",
    email: "versioned@example.com",
    password: "hashed-password",
  });

  assert.equal(user.authVersion, 0);
  assert.equal(path.options.select, false);
  assert.equal(path.options.min, 0);
});

test("authVersion accepts only non-negative integers", () => {
  for (const authVersion of [0, 1, 12]) {
    const user = new User({
      name: "Valid Version",
      phone: `+37400111${authVersion}`,
      email: `valid-${authVersion}@example.com`,
      password: "hashed-password",
      authVersion,
    });
    assert.equal(user.validateSync(), undefined);
  }

  for (const authVersion of [-1, 1.5, NaN, "abc"]) {
    const user = new User({
      name: "Invalid Version",
      phone: "+37400999888",
      email: "invalid@example.com",
      password: "hashed-password",
      authVersion,
    });
    assert.ok(user.validateSync()?.errors.authVersion);
  }
});
