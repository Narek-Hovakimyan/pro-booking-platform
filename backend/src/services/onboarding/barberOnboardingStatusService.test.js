import assert from "node:assert/strict";
import { test } from "node:test";

import { createCanonicalPersonalSchedule } from "../../utils/personalScheduleUtils.js";
import {
  BarberOnboardingStatusError,
  getBarberOnboardingStatus,
  updateBarberOnboardingWorkplace,
} from "./barberOnboardingStatusService.js";

const barberId = "64b000000000000000000001";
const validState = (overrides = {}) => ({
  version: 1,
  status: "not_started",
  currentStep: "professional_basics",
  workplace: null,
  completedAt: null,
  ...overrides,
});
const validUser = (overrides = {}) => ({
  _id: barberId,
  role: "barber",
  name: "Narek",
  phone: "+37400111222",
  city: "Yerevan",
  profession: "barber",
  barberType: "men",
  specialistOnboarding: validState(),
  ...overrides,
});
const schedule = (weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule) => ({
  weeklySchedule,
});

const query = (value, capture, kind) => ({
  select(projection) {
    capture.push({ kind, projection });
    return this;
  },
  lean() {
    return value;
  },
});

const dependencies = ({
  user = validUser(),
  profile = { address: "Mashtots 1" },
  personalSchedule = schedule(),
  updatedUser,
  updateResult,
  capture = [],
} = {}) => ({
  capture,
  UserModel: {
    findById(id) {
      capture.push({ kind: "findById", id });
      return query(user, capture, "userProjection");
    },
    findOneAndUpdate(filter, update, options) {
      capture.push({ kind: "findOneAndUpdate", filter, update, options });
      return query(updateResult === undefined ? updatedUser : updateResult, capture, "updateProjection");
    },
  },
  BarberProfileModel: {
    findOne(filter) {
      capture.push({ kind: "profileFindOne", filter });
      return query(profile, capture, "profileProjection");
    },
  },
  ScheduleModel: {
    findOne(filter) {
      capture.push({ kind: "scheduleFindOne", filter });
      return query(personalSchedule, capture, "scheduleProjection");
    },
  },
});

test("GET returns valid v1 status with safe projections and no raw data", async () => {
  const deps = dependencies({
    user: validUser({ specialistOnboarding: validState({ status: "in_progress", workplace: "independent" }) }),
  });
  const result = await getBarberOnboardingStatus(barberId, deps);

  assert.equal(result.applicable, true);
  assert.equal(result.state.currentStep, "review");
  assert.equal(result.progress.readyForReview, true);
  assert.equal(result.progress.readyForFinalization, true);
  assert.ok(result.allowedActions.includes("FINALIZE_ONBOARDING"));
  assert.deepEqual(result.missing, []);
  assert.equal(JSON.stringify(result).includes("Mashtots"), false);
  assert.ok(deps.capture.some((entry) => entry.projection === "_id role name phone city profession barberType specialistOnboarding"));
  assert.ok(deps.capture.some((entry) => entry.projection === "address"));
  assert.ok(deps.capture.some((entry) => entry.projection === "weeklySchedule"));
});

test("status delegates incomplete readiness to the shared readiness service", async () => {
  const deps = dependencies({ user: validUser() });
  let call;
  deps.getBarberOnboardingReadiness = async (id, snapshot, state) => {
    call = { id, snapshot, state };
    return {
      needsOnboarding: true,
      derivedCurrentStep: "review",
      professionalBasicsComplete: true,
      workplaceSelected: true,
      personalScheduleExists: true,
      personalScheduleValid: true,
      readyForReview: true,
      readyForFinalization: false,
      missing: ["INDEPENDENT_ADDRESS_REQUIRED"],
      allowedActions: ["EDIT_PROFILE", "UPDATE_WORKPLACE", "EDIT_PERSONAL_SCHEDULE", "REVIEW_ONBOARDING"],
    };
  };
  const result = await getBarberOnboardingStatus(barberId, deps);
  assert.equal(call.id, barberId);
  assert.equal(call.snapshot._id, barberId);
  assert.equal(call.state.workplace, null);
  assert.equal(result.progress.readyForFinalization, false);
  assert.deepEqual(result.missing, ["INDEPENDENT_ADDRESS_REQUIRED"]);
  assert.equal(deps.capture.some((entry) => entry.kind === "profileFindOne"), false);
  assert.equal(deps.capture.some((entry) => entry.kind === "scheduleFindOne"), false);
});

test("GET preserves legacy compatibility without writes or readiness reads", async () => {
  const deps = dependencies({ user: { _id: barberId, role: "barber" } });
  const result = await getBarberOnboardingStatus(barberId, deps);

  assert.deepEqual(result, {
    applicable: false,
    legacyCompatible: true,
    needsOnboarding: false,
    state: null,
    progress: null,
    missing: [],
    allowedActions: [],
  });
  assert.equal(deps.capture.some((entry) => entry.kind === "findOneAndUpdate"), false);
  assert.equal(deps.capture.some((entry) => entry.kind === "profileFindOne"), false);
  assert.equal(deps.capture.some((entry) => entry.kind === "scheduleFindOne"), false);
});

test("GET rejects malformed explicit state before profile and schedule reads", async () => {
  const deps = dependencies({ user: validUser({ specialistOnboarding: {} }) });

  await assert.rejects(
    getBarberOnboardingStatus(barberId, deps),
    (error) => error instanceof BarberOnboardingStatusError &&
      error.code === "MALFORMED_ONBOARDING_STATE" &&
      error.statusCode === 409
  );
  assert.equal(deps.capture.some((entry) => entry.kind === "profileFindOne"), false);
  assert.equal(deps.capture.some((entry) => entry.kind === "scheduleFindOne"), false);
});

test("GET rejects inherited and custom-prototype state before readiness reads", async () => {
  const inheritedUser = Object.create({ specialistOnboarding: validState() });
  Object.assign(inheritedUser, validUser());
  delete inheritedUser.specialistOnboarding;

  const customPrototypeState = Object.create({});
  Object.assign(customPrototypeState, validState());

  for (const user of [
    inheritedUser,
    validUser({ specialistOnboarding: customPrototypeState }),
  ]) {
    const deps = dependencies({ user });

    await assert.rejects(
      getBarberOnboardingStatus(barberId, deps),
      (error) => error instanceof BarberOnboardingStatusError &&
        error.code === "MALFORMED_ONBOARDING_STATE" &&
        error.message === "Onboarding state is invalid"
    );
    assert.equal(deps.capture.some((entry) => entry.kind === "profileFindOne"), false);
    assert.equal(deps.capture.some((entry) => entry.kind === "scheduleFindOne"), false);
    assert.equal(deps.capture.some((entry) => entry.kind === "findOneAndUpdate"), false);
  }
});

test("GET returns completed history without reopening onboarding", async () => {
  const completedAt = new Date("2026-01-02T03:04:05.000Z");
  const deps = dependencies({
    user: validUser({
      specialistOnboarding: validState({
        status: "completed",
        currentStep: "review",
        workplace: "salon",
        completedAt,
      }),
    }),
    personalSchedule: null,
  });
  const result = await getBarberOnboardingStatus(barberId, deps);

  assert.deepEqual(result, {
    applicable: true,
    legacyCompatible: false,
    needsOnboarding: false,
    state: {
      version: 1,
      status: "completed",
      currentStep: null,
      workplace: "salon",
      completedAt: "2026-01-02T03:04:05.000Z",
    },
    progress: null,
    missing: [],
    allowedActions: [],
  });
  assert.equal(deps.capture.some((entry) => entry.kind === "profileFindOne"), false);
});

test("GET derives missing codes from User city, profile address, and personal schedule validity", async () => {
  const deps = dependencies({
    user: validUser({
      city: "  ",
      specialistOnboarding: validState({ workplace: "independent" }),
    }),
    profile: { address: "  ", city: "Ignored City" },
    personalSchedule: null,
  });
  const result = await getBarberOnboardingStatus(barberId, deps);

  assert.deepEqual(result.missing, [
    "CITY_REQUIRED",
    "PERSONAL_SCHEDULE_REQUIRED",
    "INDEPENDENT_ADDRESS_REQUIRED",
  ]);
  assert.equal(result.state.currentStep, "professional_basics");
});

test("GET distinguishes invalid existing personal schedule from missing schedule", async () => {
  const deps = dependencies({
    user: validUser({ specialistOnboarding: validState({ workplace: "salon" }) }),
    personalSchedule: schedule({ mon: { working: true } }),
  });
  const result = await getBarberOnboardingStatus(barberId, deps);

  assert.equal(result.progress.personalScheduleExists, true);
  assert.equal(result.progress.personalScheduleValid, false);
  assert.deepEqual(result.missing, ["PERSONAL_SCHEDULE_INVALID"]);
});

test("PATCH updates only workplace and status with trusted atomic filter", async () => {
  const deps = dependencies({
    user: validUser({ specialistOnboarding: validState({ workplace: null }) }),
    updatedUser: validUser({
      specialistOnboarding: validState({ status: "in_progress", workplace: "salon" }),
    }),
  });
  const result = await updateBarberOnboardingWorkplace(barberId, "salon", deps);
  const update = deps.capture.find((entry) => entry.kind === "findOneAndUpdate");

  assert.equal(result.state.status, "in_progress");
  assert.equal(result.state.workplace, "salon");
  assert.deepEqual(update.filter, {
    _id: barberId,
    role: "barber",
    "specialistOnboarding.version": 1,
    "specialistOnboarding.status": { $in: ["not_started", "in_progress"] },
  });
  assert.deepEqual(update.update, {
    $set: {
      "specialistOnboarding.workplace": "salon",
      "specialistOnboarding.status": "in_progress",
    },
  });
  assert.equal(Object.hasOwn(update.update.$set, "specialistOnboarding.currentStep"), false);
  assert.equal(Object.hasOwn(update.update.$set, "specialistOnboarding.completedAt"), false);
  assert.deepEqual(update.options, {
    returnDocument: "after",
    runValidators: true,
    projection: "_id role name phone city profession barberType specialistOnboarding",
  });
});

test("PATCH accepts independent, salon, null, repeated, and switched workplaces", async () => {
  for (const workplace of ["independent", "salon", null]) {
    const deps = dependencies({
      user: validUser({ specialistOnboarding: validState({ status: "in_progress", workplace }) }),
      updatedUser: validUser({
        specialistOnboarding: validState({ status: "in_progress", workplace }),
      }),
    });
    const result = await updateBarberOnboardingWorkplace(barberId, workplace, deps);
    assert.equal(result.state.workplace, workplace);
  }
});

test("PATCH protects legacy, malformed, completed, and client states", async () => {
  for (const [user, code] of [
    [{ _id: barberId, role: "barber" }, "LEGACY_ONBOARDING_NOT_APPLICABLE"],
    [validUser({ specialistOnboarding: {} }), "MALFORMED_ONBOARDING_STATE"],
    [validUser({ specialistOnboarding: validState({ status: "completed" }) }), "ONBOARDING_ALREADY_COMPLETED"],
    [validUser({ role: "client" }), "BARBER_ROLE_REQUIRED"],
  ]) {
    const deps = dependencies({ user });
    await assert.rejects(
      updateBarberOnboardingWorkplace(barberId, "independent", deps),
      (error) => error.code === code
    );
    assert.equal(deps.capture.some((entry) => entry.kind === "findOneAndUpdate"), false);
  }
});

test("PATCH conditional miss re-reads once and maps latest state", async () => {
  const reads = [
    validUser({ specialistOnboarding: validState({ workplace: null }) }),
    validUser({ specialistOnboarding: validState({ status: "completed", completedAt: null }) }),
  ];
  const capture = [];
  const deps = dependencies({ capture, updateResult: null });
  deps.UserModel.findById = (id) => {
    capture.push({ kind: "findById", id });
    return query(reads.shift(), capture, "userProjection");
  };

  await assert.rejects(
    updateBarberOnboardingWorkplace(barberId, "salon", deps),
    (error) => error.code === "ONBOARDING_ALREADY_COMPLETED"
  );
  assert.equal(capture.filter((entry) => entry.kind === "findById").length, 2);
});
