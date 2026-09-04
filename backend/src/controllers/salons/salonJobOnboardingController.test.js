import assert from "node:assert/strict";
import { test } from "node:test";

import { confirmSalonJobOnboardingForApplicant } from "./salonJobOnboardingController.js";

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("non-barber users cannot confirm job onboarding", async () => {
  const res = response();
  await confirmSalonJobOnboardingForApplicant(
    { user: { _id: "64b000000000000000000004", role: "client" }, params: { applicationId: "64b000000000000000000030" } },
    res
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only the applicant can confirm onboarding");
});
