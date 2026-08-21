import assert from "node:assert/strict";
import test from "node:test";

import Salon from "./Salon.js";

test("Salon declares only the required non-unique owner and admin indexes", () => {
  assert.deepEqual(Salon.schema.indexes(), [
    [{ ownerId: 1 }, { name: "salons_ownerId_idx" }],
    [{ admins: 1 }, { name: "salons_admins_idx" }],
  ]);
});
