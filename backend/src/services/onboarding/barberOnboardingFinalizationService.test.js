import assert from "node:assert/strict";
import { test } from "node:test";

import { BarberOnboardingStatusError } from "./barberOnboardingStatusService.js";
import { finalizeBarberOnboarding } from "./barberOnboardingFinalizationService.js";

const barberId = "64b000000000000000000001";
const state = (overrides = {}) => ({
  version: 1, status: "in_progress", currentStep: "review", workplace: "independent", completedAt: null, ...overrides,
});
const user = (overrides = {}) => ({
  _id: barberId, role: "barber", name: "Narek", phone: "+37400111222", city: "Yerevan",
  profession: "barber", barberType: "men", specialistOnboarding: state(), ...overrides,
});
const query = (value, capture, kind) => ({
  select(projection) { capture.push({ kind, projection }); return this; },
  lean() { return value; },
});
const ready = (overrides = {}) => ({ readyForFinalization: true, missing: [], ...overrides });

const dependencies = ({ reads = [user()], updateResult, readiness = ready(), capture = [], now } = {}) => ({
  capture,
  now: now || (() => new Date("2026-07-16T10:00:00.000Z")),
  UserModel: {
    findById(id) {
      capture.push({ kind: "findById", id });
      return query(reads.shift(), capture, "userProjection");
    },
    findOneAndUpdate(filter, update, options) {
      capture.push({ kind: "findOneAndUpdate", filter, update, options });
      return query(updateResult === undefined
        ? user({ specialistOnboarding: state({ status: "completed", currentStep: null, completedAt: new Date("2026-07-16T10:00:00.000Z") }) })
        : updateResult, capture, "updateProjection");
    },
  },
  async getBarberOnboardingReadiness() { return readiness; },
});

test("finalization atomically completes ready independent onboarding with an allowlisted response", async () => {
  const deps = dependencies();
  const result = await finalizeBarberOnboarding(barberId, deps);
  const update = deps.capture.find((entry) => entry.kind === "findOneAndUpdate");

  assert.deepEqual(update.filter, {
    _id: barberId, role: "barber", "specialistOnboarding.version": 1,
    "specialistOnboarding.status": { $in: ["not_started", "in_progress"] },
    "specialistOnboarding.completedAt": null,
    "specialistOnboarding.workplace": "independent",
  });
  assert.deepEqual(update.update, { $set: {
    "specialistOnboarding.status": "completed",
    "specialistOnboarding.currentStep": null,
    "specialistOnboarding.completedAt": new Date("2026-07-16T10:00:00.000Z"),
  } });
  assert.deepEqual(update.options, {
    returnDocument: "after", runValidators: true, projection: "_id role specialistOnboarding",
  });
  assert.deepEqual(result, {
    applicable: true, legacyCompatible: false, needsOnboarding: false,
    state: { version: 1, status: "completed", currentStep: null, workplace: "independent", completedAt: "2026-07-16T10:00:00.000Z" },
    progress: null, missing: [], allowedActions: [],
  });
  assert.equal(JSON.stringify(result).includes("Narek"), false);
});

test("finalization allows salon without profile readiness and blocks bounded missing requirements", async () => {
  let readinessCall;
  const salonUser = user({ specialistOnboarding: state({ workplace: "salon" }) });
  const deps = dependencies({ reads: [salonUser] });
  deps.getBarberOnboardingReadiness = async (...args) => { readinessCall = args; return ready(); };
  await finalizeBarberOnboarding(barberId, deps);
  assert.equal(readinessCall[2].workplace, "salon");
  assert.equal(
    deps.capture.find((entry) => entry.kind === "findOneAndUpdate").filter["specialistOnboarding.workplace"],
    "salon"
  );

  const incomplete = dependencies({ readiness: ready({ readyForFinalization: false, missing: ["NAME_REQUIRED", "PERSONAL_SCHEDULE_INVALID"] }) });
  await assert.rejects(finalizeBarberOnboarding(barberId, incomplete), (error) => {
    assert.equal(error instanceof BarberOnboardingStatusError, true);
    assert.equal(error.code, "ONBOARDING_REQUIREMENTS_INCOMPLETE");
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, "Onboarding requirements are incomplete");
    assert.deepEqual(error.missing, ["NAME_REQUIRED", "PERSONAL_SCHEDULE_INVALID"]);
    return true;
  });
  assert.equal(incomplete.capture.some((entry) => entry.kind === "findOneAndUpdate"), false);
});

test("finalization preserves legacy, malformed, and completed history without readiness or writes", async () => {
  for (const [candidate, code] of [
    [{ _id: barberId, role: "barber" }, "LEGACY_ONBOARDING_NOT_APPLICABLE"],
    [user({ specialistOnboarding: {} }), "MALFORMED_ONBOARDING_STATE"],
  ]) {
    const deps = dependencies({ reads: [candidate] });
    await assert.rejects(finalizeBarberOnboarding(barberId, deps), (error) => error.code === code);
    assert.equal(deps.capture.some((entry) => entry.kind === "findOneAndUpdate"), false);
  }
  const completed = dependencies({ reads: [user({ specialistOnboarding: state({ status: "completed", completedAt: null }) })] });
  const result = await finalizeBarberOnboarding(barberId, completed);
  assert.equal(result.state.completedAt, null);
  assert.equal(completed.capture.some((entry) => entry.kind === "findOneAndUpdate"), false);
});

test("finalization rereads exactly once after a concurrent winner and does not retry", async () => {
  const winnerAt = new Date("2026-07-16T10:01:00.000Z");
  const deps = dependencies({
    reads: [
      user(),
      user({ specialistOnboarding: state({ status: "completed", currentStep: null, completedAt: winnerAt }) }),
    ],
    updateResult: null,
  });
  const result = await finalizeBarberOnboarding(barberId, deps);
  assert.equal(result.state.completedAt, winnerAt.toJSON());
  assert.equal(deps.capture.filter((entry) => entry.kind === "findById").length, 2);
  assert.equal(deps.capture.filter((entry) => entry.kind === "findOneAndUpdate").length, 1);
});

test("finalization maps CAS misses without a second write", async () => {
  for (const latest of [
    user(),
    { _id: barberId, role: "barber" },
    user({ specialistOnboarding: {} }),
    user({ role: "client" }),
    undefined,
  ]) {
    const deps = dependencies({ reads: [user(), latest], updateResult: null });
    await assert.rejects(finalizeBarberOnboarding(barberId, deps));
    assert.equal(deps.capture.filter((entry) => entry.kind === "findOneAndUpdate").length, 1);
  }
});

test("finalization rejects a salon-to-independent workplace race without retrying", async () => {
  let readinessCalls = 0;
  const deps = dependencies({
    reads: [
      user({ specialistOnboarding: state({ workplace: "salon" }) }),
      user({ specialistOnboarding: state({ workplace: "independent" }) }),
    ],
    updateResult: null,
  });
  deps.getBarberOnboardingReadiness = async () => {
    readinessCalls += 1;
    return ready();
  };

  await assert.rejects(finalizeBarberOnboarding(barberId, deps), (error) =>
    error.code === "ONBOARDING_FINALIZATION_CONFLICT"
  );
  const update = deps.capture.find((entry) => entry.kind === "findOneAndUpdate");
  assert.equal(update.filter["specialistOnboarding.workplace"], "salon");
  assert.equal(deps.capture.filter((entry) => entry.kind === "findById").length, 2);
  assert.equal(deps.capture.filter((entry) => entry.kind === "findOneAndUpdate").length, 1);
  assert.equal(readinessCalls, 1);
});

test("finalization rejects an independent-to-salon workplace race without retrying", async () => {
  let readinessCalls = 0;
  const deps = dependencies({
    reads: [
      user({ specialistOnboarding: state({ workplace: "independent" }) }),
      user({ specialistOnboarding: state({ workplace: "salon" }) }),
    ],
    updateResult: null,
  });
  deps.getBarberOnboardingReadiness = async () => {
    readinessCalls += 1;
    return ready();
  };

  await assert.rejects(finalizeBarberOnboarding(barberId, deps), (error) =>
    error.code === "ONBOARDING_FINALIZATION_CONFLICT"
  );
  const update = deps.capture.find((entry) => entry.kind === "findOneAndUpdate");
  assert.equal(update.filter["specialistOnboarding.workplace"], "independent");
  assert.equal(deps.capture.filter((entry) => entry.kind === "findById").length, 2);
  assert.equal(deps.capture.filter((entry) => entry.kind === "findOneAndUpdate").length, 1);
  assert.equal(readinessCalls, 1);
});
