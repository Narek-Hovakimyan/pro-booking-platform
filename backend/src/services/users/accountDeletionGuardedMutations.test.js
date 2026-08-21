import assert from "node:assert/strict";
import { test } from "node:test";

import {
  guardBookingMutation,
  guardSubscriptionMutation,
} from "./accountDeletionGuardedMutations.js";

test("guarded mutations remain harmless for disconnected unit-model callers", async () => {
  await guardBookingMutation({ barberId: "barber", clientId: "client", isManualBooking: false });
  await guardSubscriptionMutation({ payerId: "payer", ownerType: "barber", ownerId: "barber" });
  assert.ok(true);
});
