import assert from "node:assert/strict";
import test from "node:test";

import { AccountDeletionFenceError, beginAccountDeletionFence } from "./accountDeletionFenceService.js";

test("fence fails closed without a user id and remains inert for disconnected unit callers", async () => {
  await assert.rejects(beginAccountDeletionFence({}), (error) => error instanceof AccountDeletionFenceError && error.statusCode === 409);
  const result = await beginAccountDeletionFence({ userId: "unit-user" });
  assert.equal(result.deletionId, "unavailable-test-fence");
});
