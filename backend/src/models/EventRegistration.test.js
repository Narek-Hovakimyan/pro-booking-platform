import assert from "node:assert/strict";
import { test } from "node:test";

import EventRegistration from "./EventRegistration.js";

test("legacy barberId is copied to userId during validation without next callback", async () => {
  const registration = new EventRegistration({
    eventId: "64d000000000000000000001",
    barberId: "64d000000000000000000002",
  });

  await registration.validate();

  assert.equal(String(registration.userId), "64d000000000000000000002");
});
