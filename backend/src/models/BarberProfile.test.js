import assert from "node:assert/strict";
import { test } from "node:test";

import BarberProfile from "./BarberProfile.js";

test("BarberProfile declares the named unique barberId index", () => {
  assert.deepEqual(
    BarberProfile.schema.indexes().find(([fields]) => fields.barberId === 1),
    [
      { barberId: 1 },
      { unique: true, name: "barberprofiles_barberId_unique" },
    ]
  );
});
