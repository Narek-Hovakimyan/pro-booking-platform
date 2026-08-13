import assert from "node:assert/strict";
import test from "node:test";

import {
  isSubscriptionOwnerDuplicateKeyError,
} from "./subscriptionManualMutations.js";

test("only the logical-owner duplicate key is recovered", () => {
  assert.equal(
    isSubscriptionOwnerDuplicateKeyError({
      code: 11000,
      keyPattern: { ownerType: 1, ownerId: 1 },
    }),
    true
  );
  assert.equal(
    isSubscriptionOwnerDuplicateKeyError({
      code: 11000,
      keyPattern: { provider: 1, providerPaymentId: 1 },
    }),
    false
  );
});
