import assert from "node:assert/strict";
import test from "node:test";

import { runEventCertificateMediaBackfill } from "./backfill-event-certificate-media.js";

test("event certificate backfill defaults to a deterministic zero-write dry run", async () => {
  const EventCertificateModel = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  const result = await runEventCertificateMediaBackfill({ EventCertificateModel });
  assert.deepEqual(result, { mode: "dry-run", scanned: 0, created: 0, existing: 0, missing: 0, ambiguous: 0, collisions: 0 });
});
