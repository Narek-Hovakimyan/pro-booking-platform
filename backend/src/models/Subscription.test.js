import assert from "node:assert/strict";
import test from "node:test";

import Subscription from "./Subscription.js";

test("Subscription enforces one document for each logical owner", () => {
  const indexes = Subscription.schema.indexes();
  const ownerIndex = indexes.find(
    ([keys]) => keys.ownerType === 1 && keys.ownerId === 1 && Object.keys(keys).length === 2
  );

  assert.ok(ownerIndex);
  assert.equal(ownerIndex[1].unique, true);
  assert.equal(ownerIndex[1].sparse, undefined);
});
