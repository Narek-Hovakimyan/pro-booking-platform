import assert from "node:assert/strict";
import test from "node:test";

import EventCertificate from "./EventCertificate.js";

test("EventCertificate keeps its MediaObject binding select-hidden", () => {
  const path = EventCertificate.schema.path("mediaObjectId");
  assert.equal(path.options.ref, "MediaObject");
  assert.equal(path.options.select, false);
  assert.equal(path.options.default, null);
});
