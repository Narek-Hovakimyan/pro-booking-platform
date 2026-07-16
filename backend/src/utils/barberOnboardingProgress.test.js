import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBarberOnboardingProgress } from "./barberOnboardingProgress.js";

const completeFacts = (overrides = {}) => ({
  hasName: true,
  hasPhone: true,
  hasCity: true,
  profession: "barber",
  hasBarberType: true,
  workplace: "independent",
  hasIndependentAddress: true,
  personalScheduleExists: true,
  personalScheduleValid: true,
  storedStatus: "in_progress",
  ...overrides,
});

test("progress reports professional basics requirements in deterministic order", () => {
  const result = buildBarberOnboardingProgress(completeFacts({
    hasName: false,
    hasPhone: false,
    hasCity: false,
    profession: "unknown",
    hasBarberType: false,
  }));

  assert.equal(result.professionalBasicsComplete, false);
  assert.equal(result.derivedCurrentStep, "professional_basics");
  assert.deepEqual(result.missing.slice(0, 4), [
    "NAME_REQUIRED",
    "PHONE_REQUIRED",
    "CITY_REQUIRED",
    "PROFESSION_REQUIRED",
  ]);
});

test("progress requires barberType only for barber profession", () => {
  assert.deepEqual(
    buildBarberOnboardingProgress(completeFacts({ hasBarberType: false })).missing,
    ["BARBER_TYPE_REQUIRED"]
  );
  assert.equal(
    buildBarberOnboardingProgress(completeFacts({
      profession: "hair_stylist",
      hasBarberType: false,
    })).professionalBasicsComplete,
    true
  );
});

test("progress derives workplace and schedule states", () => {
  const workplace = buildBarberOnboardingProgress(completeFacts({ workplace: null }));
  assert.equal(workplace.derivedCurrentStep, "workplace");
  assert.equal(workplace.workplaceSelected, false);
  assert.ok(workplace.missing.includes("WORKPLACE_REQUIRED"));

  const missingSchedule = buildBarberOnboardingProgress(completeFacts({
    personalScheduleExists: false,
    personalScheduleValid: false,
  }));
  assert.equal(missingSchedule.derivedCurrentStep, "personal_schedule");
  assert.deepEqual(missingSchedule.missing, ["PERSONAL_SCHEDULE_REQUIRED"]);

  const invalidSchedule = buildBarberOnboardingProgress(completeFacts({
    personalScheduleExists: true,
    personalScheduleValid: false,
  }));
  assert.deepEqual(invalidSchedule.missing, ["PERSONAL_SCHEDULE_INVALID"]);
});

test("progress handles independent address without blocking review readiness", () => {
  const independent = buildBarberOnboardingProgress(completeFacts({
    hasIndependentAddress: false,
  }));
  assert.equal(independent.derivedCurrentStep, "review");
  assert.equal(independent.readyForReview, true);
  assert.equal(independent.readyForFinalization, false);
  assert.deepEqual(independent.missing, ["INDEPENDENT_ADDRESS_REQUIRED"]);

  const salon = buildBarberOnboardingProgress(completeFacts({
    workplace: "salon",
    hasIndependentAddress: false,
  }));
  assert.deepEqual(salon.missing, []);
  assert.equal(salon.readyForFinalization, true);
});

test("progress controls allowed actions and completed override", () => {
  const ready = buildBarberOnboardingProgress(completeFacts());
  assert.deepEqual(ready.allowedActions, [
    "EDIT_PROFILE",
    "UPDATE_WORKPLACE",
    "EDIT_PERSONAL_SCHEDULE",
    "REVIEW_ONBOARDING",
    "FINALIZE_ONBOARDING",
  ]);
  assert.equal(ready.readyForFinalization, true);

  const notReady = buildBarberOnboardingProgress(completeFacts({ workplace: null }));
  assert.deepEqual(notReady.allowedActions, [
    "EDIT_PROFILE",
    "UPDATE_WORKPLACE",
    "EDIT_PERSONAL_SCHEDULE",
  ]);
  assert.equal(notReady.readyForFinalization, false);

  const completed = buildBarberOnboardingProgress(completeFacts({ storedStatus: "completed" }));
  assert.equal(completed.derivedCurrentStep, null);
  assert.equal(completed.needsOnboarding, false);
  assert.equal(completed.readyForFinalization, false);
  assert.deepEqual(completed.allowedActions, []);
});

test("progress safely handles hostile input and returns fresh outputs", () => {
  const facts = Object.create({ hasName: true });
  Object.assign(facts, completeFacts({ hasName: false }));
  Object.defineProperty(facts, "hasPhone", {
    enumerable: true,
    get() {
      throw new Error("unsafe");
    },
  });

  const first = buildBarberOnboardingProgress(facts);
  const second = buildBarberOnboardingProgress(facts);
  assert.ok(first.missing.includes("NAME_REQUIRED"));
  assert.ok(first.missing.includes("PHONE_REQUIRED"));
  assert.notEqual(first.missing, second.missing);
  assert.notEqual(first.allowedActions, second.allowedActions);

  const nullPrototype = Object.create(null);
  Object.assign(nullPrototype, completeFacts());
  assert.equal(buildBarberOnboardingProgress(nullPrototype).readyForReview, true);
});
