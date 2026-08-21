import assert from "node:assert/strict";
import test from "node:test";

import { deleteMyAccount } from "./accountDeletionController.js";

test("account deletion never accepts a body-supplied target user", async () => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await deleteMyAccount({ body: { userId: "victim" }, user: null }, res);
  assert.equal(res.statusCode, 403);
});
