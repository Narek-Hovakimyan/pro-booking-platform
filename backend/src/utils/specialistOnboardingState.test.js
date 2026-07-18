import assert from "node:assert/strict";
import { test } from "node:test";

import User from "../models/User.js";
import {
  classifySpecialistOnboardingState,
  createInitialSpecialistOnboardingState,
  serializeSpecialistOnboardingState,
} from "./specialistOnboardingState.js";

const initialFallback = {
  version: 1,
  status: "not_started",
  currentStep: "professional_basics",
  workplace: null,
  completedAt: null,
  needsOnboarding: true,
};

const assertInitialFallback = (result) => {
  assert.deepEqual(result, initialFallback);
  assert.notEqual(result.status, "completed");
  assert.notEqual(result.needsOnboarding, false);
};

test("initial specialist onboarding state is fresh and exact", () => {
  const first = createInitialSpecialistOnboardingState();
  const second = createInitialSpecialistOnboardingState();

  assert.deepEqual(first, {
    version: 1,
    status: "not_started",
    currentStep: "professional_basics",
    workplace: null,
    completedAt: null,
  });
  assert.notEqual(first, second);
});

test("serializer safely resolves explicit onboarding states", () => {
  const cases = [
    ["not_started", true],
    ["in_progress", true],
    ["completed", false],
  ];

  for (const [status, needsOnboarding] of cases) {
    const completedAt = status === "completed" ? new Date("2026-01-02T03:04:05.000Z") : null;
    const result = serializeSpecialistOnboardingState({
      role: "barber",
      specialistOnboarding: {
        version: 1,
        status,
        currentStep: status === "completed" ? null : "workplace",
        workplace: "independent",
        completedAt,
        ignored: "secret",
      },
    });

    assert.equal(result.status, status);
    assert.equal(result.needsOnboarding, needsOnboarding);
    assert.equal("ignored" in result, false);
    assert.deepEqual(result.completedAt, completedAt);
    if (completedAt) assert.notEqual(result.completedAt, completedAt);
  }
});

test("serializer accepts both workplace without response-shape drift", () => {
  const result = serializeSpecialistOnboardingState({
    role: "barber",
    specialistOnboarding: {
      version: 1,
      status: "in_progress",
      currentStep: "review",
      workplace: "both",
      completedAt: null,
    },
  });

  assert.deepEqual(result, {
    version: 1,
    status: "in_progress",
    currentStep: "review",
    workplace: "both",
    completedAt: null,
    needsOnboarding: true,
  });
});

test("serializer preserves legacy compatibility without mutation", () => {
  const legacyBarber = { role: "barber", name: "Legacy" };

  assert.deepEqual(serializeSpecialistOnboardingState(legacyBarber), {
    version: 0,
    status: "legacy",
    currentStep: null,
    workplace: null,
    completedAt: null,
    needsOnboarding: false,
  });
  assert.equal("specialistOnboarding" in legacyBarber, false);
});

test("serializer omits onboarding for clients and fails malformed state safely", () => {
  assert.equal(serializeSpecialistOnboardingState({ role: "client" }), undefined);

  for (const specialistOnboarding of [
    { version: 1, status: "unknown", currentStep: null, workplace: null, completedAt: null },
    { version: 1, status: "completed", currentStep: "unknown", workplace: null, completedAt: null },
    { version: 1, status: "completed", currentStep: null, workplace: "unknown", completedAt: null },
    { version: 2, status: "completed", currentStep: null, workplace: null, completedAt: null },
  ]) {
    assertInitialFallback(
      serializeSpecialistOnboardingState({ role: "barber", specialistOnboarding })
    );
  }
});

test("serializer handles Mongoose-style objects without leaking internals", () => {
  const result = serializeSpecialistOnboardingState({
    role: "barber",
    specialistOnboarding: {
      $isSingleNested: true,
      toObject() {
        return {
          version: 1,
          status: "in_progress",
          currentStep: "personal_schedule",
          workplace: "salon",
          completedAt: null,
          $__: { internal: true },
        };
      },
    },
  });

  assert.deepEqual(result, {
    version: 1,
    status: "in_progress",
    currentStep: "personal_schedule",
    workplace: "salon",
    completedAt: null,
    needsOnboarding: true,
  });
});

test("serializer rejects fully and partially prototype-backed required fields", () => {
  const completedPrototype = {
    version: 1,
    status: "completed",
    currentStep: null,
    workplace: null,
    completedAt: null,
  };

  assertInitialFallback(
    serializeSpecialistOnboardingState({
      role: "barber",
      specialistOnboarding: Object.create(completedPrototype),
    })
  );

  for (const inheritedField of [
    "version",
    "status",
    "currentStep",
    "workplace",
    "completedAt",
  ]) {
    const prototype = { [inheritedField]: completedPrototype[inheritedField] };
    const state = Object.create(prototype);

    for (const [field, fieldValue] of Object.entries(completedPrototype)) {
      if (field !== inheritedField) state[field] = fieldValue;
    }

    assertInitialFallback(
      serializeSpecialistOnboardingState({ role: "barber", specialistOnboarding: state })
    );
  }
});

test("serializer ignores prototype pollution-style values", () => {
  const prototype = {
    version: 1,
    status: "completed",
    currentStep: null,
    workplace: null,
    completedAt: null,
    needsOnboarding: false,
    secret: "do-not-serialize",
    arbitrary: { private: true },
  };
  const result = serializeSpecialistOnboardingState({
    role: "barber",
    specialistOnboarding: Object.create(prototype),
  });
  const serialized = JSON.stringify(result);

  assertInitialFallback(result);
  assert.equal(serialized.includes("do-not-serialize"), false);
  assert.equal(serialized.includes("private"), false);
});

test("serializer safely handles Mongoose-style conversion failures", () => {
  const validState = {
    version: 1,
    status: "completed",
    currentStep: null,
    workplace: null,
    completedAt: new Date("2026-01-02T03:04:05.000Z"),
  };
  const cases = [
    [
      "valid",
      {
        toObject() {
          return validState;
        },
      },
      false,
    ],
    [
      "prototype-backed",
      {
        toObject() {
          return Object.create(validState);
        },
      },
      true,
    ],
    [
      "non-object",
      {
        toObject() {
          return "invalid";
        },
      },
      true,
    ],
    [
      "throwing",
      {
        toObject() {
          throw new Error("unsafe conversion");
        },
      },
      true,
    ],
  ];

  for (const [_label, specialistOnboarding, shouldFallback] of cases) {
    const result = serializeSpecialistOnboardingState({ role: "barber", specialistOnboarding });

    if (shouldFallback) {
      assertInitialFallback(result);
    } else {
      assert.deepEqual(result, { ...validState, needsOnboarding: false });
    }
  }
});

test("serializer safely handles throwing required-field getters", () => {
  const ownGetterState = {
    version: 1,
    currentStep: null,
    workplace: null,
    completedAt: null,
  };
  Object.defineProperty(ownGetterState, "status", {
    enumerable: true,
    get() {
      throw new Error("unsafe own getter");
    },
  });

  let inheritedGetterRead = false;
  const inheritedGetterState = Object.create({
    get status() {
      inheritedGetterRead = true;
      throw new Error("unsafe inherited getter");
    },
  });
  Object.assign(inheritedGetterState, {
    version: 1,
    currentStep: null,
    workplace: null,
    completedAt: null,
  });

  assert.doesNotThrow(() => {
    assertInitialFallback(
      serializeSpecialistOnboardingState({ role: "barber", specialistOnboarding: ownGetterState })
    );
  });
  assert.doesNotThrow(() => {
    assertInitialFallback(
      serializeSpecialistOnboardingState({ role: "barber", specialistOnboarding: inheritedGetterState })
    );
  });
  assert.equal(inheritedGetterRead, false);
});

test("serializer accepts valid null-prototype explicit state", () => {
  const specialistOnboarding = Object.create(null);
  Object.assign(specialistOnboarding, {
    version: 1,
    status: "in_progress",
    currentStep: null,
    workplace: null,
    completedAt: null,
  });

  assert.deepEqual(
    serializeSpecialistOnboardingState({ role: "barber", specialistOnboarding }),
    {
      version: 1,
      status: "in_progress",
      currentStep: null,
      workplace: null,
      completedAt: null,
      needsOnboarding: true,
    }
  );
});

const validExplicitState = (overrides = {}) => ({
  version: 1,
  status: "in_progress",
  currentStep: "workplace",
  workplace: null,
  completedAt: null,
  ...overrides,
});

test("classifier distinguishes valid v1 states", () => {
  for (const state of [
    validExplicitState({ status: "not_started", currentStep: "professional_basics" }),
    validExplicitState({ status: "in_progress", currentStep: "review", workplace: "salon" }),
    validExplicitState({ status: "in_progress", currentStep: "review", workplace: "both" }),
    validExplicitState({
      status: "completed",
      currentStep: null,
      workplace: "independent",
      completedAt: new Date("2026-01-02T03:04:05.000Z"),
    }),
  ]) {
    const result = classifySpecialistOnboardingState({ specialistOnboarding: state });
    assert.equal(result.kind, "valid");
    assert.deepEqual(result.state, state);
    if (state.completedAt) assert.notEqual(result.state.completedAt, state.completedAt);
  }
});

test("classifier distinguishes true legacy absence from malformed explicit states", () => {
  assert.deepEqual(classifySpecialistOnboardingState({ role: "barber" }), { kind: "legacy" });

  for (const specialistOnboarding of [
    null,
    undefined,
    {},
    [],
    () => {},
    "invalid",
    1,
    validExplicitState({ version: 2 }),
    validExplicitState({ status: "unknown" }),
    validExplicitState({ currentStep: "unknown" }),
    validExplicitState({ workplace: "unknown" }),
    validExplicitState({ completedAt: new Date("bad") }),
  ]) {
    assert.deepEqual(
      classifySpecialistOnboardingState({ specialistOnboarding }),
      { kind: "malformed" }
    );
  }
});

test("classifier distinguishes true absence from inherited top-level state without reading it", () => {
  const inheritedState = validExplicitState();
  const user = Object.create({ specialistOnboarding: inheritedState });
  user.role = "barber";
  const before = Object.keys(user);

  assert.deepEqual(classifySpecialistOnboardingState({ role: "barber" }), { kind: "legacy" });
  assert.deepEqual(classifySpecialistOnboardingState(user), { kind: "malformed" });
  assert.equal(Object.hasOwn(user, "specialistOnboarding"), false);
  assert.deepEqual(Object.keys(user), before);

  let getterCalls = 0;
  const hostileUser = Object.create({});
  Object.defineProperty(Object.getPrototypeOf(hostileUser), "specialistOnboarding", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("unsafe");
    },
  });
  assert.deepEqual(classifySpecialistOnboardingState(hostileUser), { kind: "malformed" });
  assert.equal(getterCalls, 0);
});

test("classifier rejects custom-prototype states while retaining supported plain states", () => {
  const customPrototypeState = Object.create({});
  Object.defineProperties(customPrototypeState, {
    version: { value: 1, enumerable: true },
    status: { value: "not_started", enumerable: true },
    currentStep: { value: "professional_basics", enumerable: true },
    workplace: { value: null, enumerable: true },
    completedAt: { value: null, enumerable: true },
  });

  assert.deepEqual(
    classifySpecialistOnboardingState({ specialistOnboarding: customPrototypeState }),
    { kind: "malformed" }
  );
  assertInitialFallback(
    serializeSpecialistOnboardingState({
      role: "barber",
      specialistOnboarding: Object.create(validExplicitState()),
    })
  );
});

test("classifier safely normalizes Mongoose documents and rejects failed conversion", () => {
  const validDocument = new User({
    role: "barber",
    specialistOnboarding: validExplicitState(),
  });
  const legacyDocument = new User({ role: "barber" });

  assert.deepEqual(classifySpecialistOnboardingState(validDocument), {
    kind: "valid",
    state: validExplicitState(),
  });
  assert.deepEqual(
    classifySpecialistOnboardingState({
      specialistOnboarding: validDocument.specialistOnboarding,
    }),
    { kind: "valid", state: validExplicitState() }
  );
  assert.deepEqual(classifySpecialistOnboardingState(legacyDocument), { kind: "legacy" });

  const failingDocument = new Proxy(new User({ role: "barber" }), {
    get(target, property, receiver) {
      if (property === "$__") throw new Error("unsafe");
      return Reflect.get(target, property, receiver);
    },
  });
  assert.deepEqual(classifySpecialistOnboardingState(failingDocument), { kind: "malformed" });
});

test("classifier rejects missing, inherited, accessor, and throwing fields", () => {
  const inheritedState = Object.create(validExplicitState());
  assert.deepEqual(
    classifySpecialistOnboardingState({ specialistOnboarding: inheritedState }),
    { kind: "malformed" }
  );

  const partialInherited = Object.create({ status: "in_progress" });
  Object.assign(partialInherited, validExplicitState());
  delete partialInherited.status;
  assert.deepEqual(
    classifySpecialistOnboardingState({ specialistOnboarding: partialInherited }),
    { kind: "malformed" }
  );

  const accessorState = validExplicitState();
  Object.defineProperty(accessorState, "status", {
    enumerable: true,
    get() {
      throw new Error("unsafe");
    },
  });
  assert.deepEqual(
    classifySpecialistOnboardingState({ specialistOnboarding: accessorState }),
    { kind: "malformed" }
  );

  assert.deepEqual(
    classifySpecialistOnboardingState({
      specialistOnboarding: {
        toObject() {
          throw new Error("unsafe");
        },
      },
    }),
    { kind: "malformed" }
  );

  const missingStatus = validExplicitState();
  delete missingStatus.status;
  assert.deepEqual(
    classifySpecialistOnboardingState({ specialistOnboarding: missingStatus }),
    { kind: "malformed" }
  );

  const accessorUser = {};
  Object.defineProperty(accessorUser, "specialistOnboarding", {
    enumerable: true,
    get() {
      throw new Error("unsafe");
    },
  });
  assert.deepEqual(classifySpecialistOnboardingState(accessorUser), { kind: "malformed" });
});

test("classifier accepts null-prototype state, avoids mutation, and preserves serializer behavior", () => {
  const state = Object.create(null);
  Object.assign(state, validExplicitState({ workplace: "independent" }));
  const before = JSON.stringify(state);

  assert.deepEqual(classifySpecialistOnboardingState({ specialistOnboarding: state }), {
    kind: "valid",
    state: validExplicitState({ workplace: "independent" }),
  });
  assert.equal(JSON.stringify(state), before);

  const malformed = { version: 2, status: "bad", currentStep: null, workplace: null, completedAt: null };
  assert.deepEqual(
    classifySpecialistOnboardingState({ specialistOnboarding: malformed }),
    { kind: "malformed" }
  );
  assertInitialFallback(
    serializeSpecialistOnboardingState({ role: "barber", specialistOnboarding: malformed })
  );
});
