import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBarberOnboardingController,
} from "./barberOnboardingController.js";
import { BarberOnboardingStatusError } from "../../services/onboarding/barberOnboardingStatusService.js";

const responsePayload = {
  applicable: true,
  legacyCompatible: false,
  needsOnboarding: true,
  state: {
    version: 1,
    status: "in_progress",
    currentStep: "review",
    workplace: "independent",
    completedAt: null,
  },
  progress: {
    professionalBasicsComplete: true,
    workplaceSelected: true,
    personalScheduleExists: true,
    personalScheduleValid: true,
    readyForReview: true,
    readyForFinalization: true,
  },
  missing: [],
  allowedActions: [
    "EDIT_PROFILE",
    "UPDATE_WORKPLACE",
    "EDIT_PERSONAL_SCHEDULE",
    "REVIEW_ONBOARDING",
    "FINALIZE_ONBOARDING",
  ],
};

const createRes = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const req = (overrides = {}) => ({
  user: { _id: "user-1", role: "barber", ignored: "private" },
  body: undefined,
  ...overrides,
});

test("GET returns allowlisted service response for authenticated barber", async () => {
  const calls = [];
  const controller = createBarberOnboardingController({
    async getBarberOnboardingStatus(id) {
      calls.push(id);
      return responsePayload;
    },
  });
  const res = createRes();

  await controller.getMyBarberOnboarding(req(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, responsePayload);
  assert.deepEqual(calls, ["user-1"]);
});

test("GET rejects client and maps bounded service errors", async () => {
  const controller = createBarberOnboardingController({
    async getBarberOnboardingStatus() {
      throw new BarberOnboardingStatusError(
        "MALFORMED_ONBOARDING_STATE",
        409,
        "Onboarding state is invalid"
      );
    },
  });
  const clientRes = createRes();
  await controller.getMyBarberOnboarding(req({ user: { _id: "client-1", role: "client" } }), clientRes);
  assert.equal(clientRes.statusCode, 403);
  assert.deepEqual(clientRes.body, {
    code: "BARBER_ROLE_REQUIRED",
    message: "Barber role required",
  });

  const malformedRes = createRes();
  await controller.getMyBarberOnboarding(req(), malformedRes);
  assert.equal(malformedRes.statusCode, 409);
  assert.deepEqual(malformedRes.body, {
    code: "MALFORMED_ONBOARDING_STATE",
    message: "Onboarding state is invalid",
  });
});

test("GET maps unexpected failures generically without raw error leakage", async () => {
  const controller = createBarberOnboardingController({
    async getBarberOnboardingStatus() {
      throw new Error("mongodb://secret-host/stack");
    },
  });
  const res = createRes();

  await controller.getMyBarberOnboarding(req(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not process onboarding status" });
});

test("PATCH accepts exact workplace body and trusted user id", async () => {
  for (const workplace of ["independent", "salon", "both", null]) {
    const calls = [];
    const controller = createBarberOnboardingController({
      async updateBarberOnboardingWorkplace(id, value) {
        calls.push({ id, value });
        return { ...responsePayload, state: { ...responsePayload.state, workplace: value } };
      },
    });
    const res = createRes();

    await controller.updateMyBarberOnboardingWorkplace(req({ body: { workplace } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.state.workplace, workplace);
    assert.deepEqual(calls, [{ id: "user-1", value: workplace }]);
  }
});

test("PATCH rejects malformed bodies, extra fields, inherited and accessor workplace", async () => {
  const inherited = Object.create({ workplace: "salon" });
  const accessor = {};
  Object.defineProperty(accessor, "workplace", {
    enumerable: true,
    get() {
      throw new Error("unsafe");
    },
  });
  const invalidBodies = [
    undefined,
    null,
    [],
    { },
    { workplace: "unknown" },
    { workplace: " salon " },
    { workplace: "salon", userId: "other" },
    { version: 1 },
    { status: "completed" },
    { currentStep: "review" },
    { completedAt: null },
    { needsOnboarding: false },
    { barberId: "other" },
    { salonId: "salon-1" },
    inherited,
    accessor,
  ];
  const controller = createBarberOnboardingController({
    async updateBarberOnboardingWorkplace() {
      throw new Error("service should not be called");
    },
  });

  for (const body of invalidBodies) {
    const res = createRes();
    await controller.updateMyBarberOnboardingWorkplace(req({ body }), res);
    assert.equal(res.statusCode, 400);
    assert.ok([
      "INVALID_ONBOARDING_REQUEST",
      "INVALID_WORKPLACE",
    ].includes(res.body.code));
  }
});

test("PATCH maps client, applicability, completed, and generic failures", async () => {
  const clientController = createBarberOnboardingController({});
  const clientRes = createRes();
  await clientController.updateMyBarberOnboardingWorkplace(
    req({ user: { _id: "client-1", role: "client" }, body: { workplace: "salon" } }),
    clientRes
  );
  assert.equal(clientRes.statusCode, 403);

  for (const [code, statusCode] of [
    ["LEGACY_ONBOARDING_NOT_APPLICABLE", 409],
    ["MALFORMED_ONBOARDING_STATE", 409],
    ["ONBOARDING_ALREADY_COMPLETED", 409],
  ]) {
    const controller = createBarberOnboardingController({
      async updateBarberOnboardingWorkplace() {
        throw new BarberOnboardingStatusError(code, statusCode, "bounded message");
      },
    });
    const res = createRes();
    await controller.updateMyBarberOnboardingWorkplace(req({ body: { workplace: "salon" } }), res);
    assert.equal(res.statusCode, statusCode);
    assert.deepEqual(res.body, { code, message: "bounded message" });
  }

  const genericController = createBarberOnboardingController({
    async updateBarberOnboardingWorkplace() {
      throw new Error("raw secret");
    },
  });
  const genericRes = createRes();
  await genericController.updateMyBarberOnboardingWorkplace(req({ body: { workplace: "salon" } }), genericRes);
  assert.equal(genericRes.statusCode, 500);
  assert.deepEqual(genericRes.body, { message: "Could not process onboarding status" });
});

test("POST finalization accepts only empty safe bodies and uses the authenticated barber id", async () => {
  for (const body of [undefined, {}, Object.create(null)]) {
    const calls = [];
    const controller = createBarberOnboardingController({
      async finalizeBarberOnboarding(id) { calls.push(id); return { completed: true }; },
    });
    const res = createRes();
    await controller.finalizeMyBarberOnboarding(req({ body }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, ["user-1"]);
  }

  const inherited = Object.create({ ignored: "unsafe" });
  const accessor = {};
  Object.defineProperty(accessor, "value", { get() { throw new Error("unsafe"); } });
  const custom = Object.create({});
  for (const body of [null, [], "", 1, new Date(), inherited, accessor, custom, { workplace: "salon" }]) {
    const controller = createBarberOnboardingController({
      async finalizeBarberOnboarding() { throw new Error("must not be called"); },
    });
    const res = createRes();
    await controller.finalizeMyBarberOnboarding(req({ body }), res);
    assert.deepEqual(res.body, { code: "INVALID_ONBOARDING_REQUEST", message: "Invalid onboarding request" });
  }
});

test("POST finalization maps bounded errors and hides unexpected details", async () => {
  for (const [code, statusCode, missing] of [
    ["ONBOARDING_REQUIREMENTS_INCOMPLETE", 400, ["PERSONAL_SCHEDULE_REQUIRED"]],
    ["LEGACY_ONBOARDING_NOT_APPLICABLE", 409, undefined],
    ["MALFORMED_ONBOARDING_STATE", 409, undefined],
    ["ONBOARDING_FINALIZATION_CONFLICT", 409, undefined],
  ]) {
    const controller = createBarberOnboardingController({
      async finalizeBarberOnboarding() {
        throw new BarberOnboardingStatusError(code, statusCode, "bounded message", missing);
      },
    });
    const res = createRes();
    await controller.finalizeMyBarberOnboarding(req(), res);
    assert.equal(res.statusCode, statusCode);
    assert.equal(res.body.code, code);
    if (missing) assert.deepEqual(res.body.missing, missing);
  }
  const controller = createBarberOnboardingController({
    async finalizeBarberOnboarding() { throw new Error("mongodb://secret/address"); },
  });
  const res = createRes();
  await controller.finalizeMyBarberOnboarding(req(), res);
  assert.deepEqual(res.body, { message: "Could not finalize onboarding" });
});
