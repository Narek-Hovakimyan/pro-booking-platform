import assert from "node:assert/strict";
import { test } from "node:test";

import { createCanonicalPersonalSchedule } from "../../utils/personalScheduleUtils.js";
import {
  getPersonalSchedule,
  upsertPersonalSchedule,
} from "./personalScheduleService.js";

const barberId = "64b000000000000000000001";

test("personal schedule service uses explicit null-salon identity", async () => {
  let query;
  const ScheduleModel = {
    async findOne(nextQuery) {
      query = nextQuery;
      return null;
    },
  };

  const result = await getPersonalSchedule(barberId, { ScheduleModel });

  assert.equal(result, null);
  assert.deepEqual(query, { barberId, salonId: null });
});

test("personal schedule service upserts only canonical personal fields", async () => {
  let received;
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  const ScheduleModel = {
    async findOneAndUpdate(filter, update, options) {
      received = { filter, update, options };
      return { weeklySchedule, updatedAt: new Date("2026-01-01T00:00:00.000Z") };
    },
  };

  await upsertPersonalSchedule(barberId, weeklySchedule, { ScheduleModel });

  assert.deepEqual(received.filter, { barberId, salonId: null });
  assert.deepEqual(received.update.$setOnInsert, { barberId, salonId: null });
  assert.deepEqual(received.update.$set.nonWorkingDays, []);
  assert.deepEqual(received.update.$set.defaultSchedule, {
    startTime: "09:00", endTime: "18:00", hasBreak: false, breakStart: "", breakEnd: "",
  });
  assert.deepEqual(received.options, { returnDocument: "after", runValidators: true, upsert: true });
});

test("personal schedule service retries one duplicate-key upsert as an update", async () => {
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  const calls = [];
  const ScheduleModel = {
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      if (calls.length === 1) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      return { weeklySchedule, updatedAt: new Date("2026-01-01T00:00:00.000Z") };
    },
  };

  const result = await upsertPersonalSchedule(barberId, weeklySchedule, { ScheduleModel });

  assert.equal(result.weeklySchedule, weeklySchedule);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.upsert, true);
  assert.equal(calls[1].options.upsert, false);
  assert.deepEqual(calls[1].filter, { barberId, salonId: null });
  assert.equal(Object.hasOwn(calls[1].update, "$setOnInsert"), false);
});

test("personal schedule service rethrows the original duplicate when no personal record exists", async () => {
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  const duplicateError = new Error("duplicate");
  duplicateError.code = 11000;
  let calls = 0;
  const ScheduleModel = {
    async findOneAndUpdate() {
      calls += 1;
      if (calls === 1) throw duplicateError;
      return null;
    },
  };

  await assert.rejects(
    upsertPersonalSchedule(barberId, weeklySchedule, { ScheduleModel }),
    (error) => error === duplicateError
  );
  assert.equal(calls, 2);
});

test("personal schedule service rethrows the original duplicate when retry is undefined", async () => {
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  const duplicateError = new Error("duplicate");
  duplicateError.code = 11000;
  let calls = 0;
  const ScheduleModel = {
    async findOneAndUpdate() {
      calls += 1;
      if (calls === 1) throw duplicateError;
      return undefined;
    },
  };

  await assert.rejects(
    upsertPersonalSchedule(barberId, weeklySchedule, { ScheduleModel }),
    (error) => error === duplicateError
  );
  assert.equal(calls, 2);
});

test("personal schedule service propagates a duplicate retry failure", async () => {
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  const duplicateError = new Error("duplicate");
  duplicateError.code = 11000;
  const retryError = new Error("retry failed");
  let calls = 0;
  const ScheduleModel = {
    async findOneAndUpdate() {
      calls += 1;
      if (calls === 1) throw duplicateError;
      throw retryError;
    },
  };

  await assert.rejects(
    upsertPersonalSchedule(barberId, weeklySchedule, { ScheduleModel }),
    (error) => error === retryError
  );
  assert.equal(calls, 2);
});

test("personal schedule service does not retry non-duplicate failures", async () => {
  const weeklySchedule = createCanonicalPersonalSchedule().weeklySchedule;
  const databaseError = new Error("database failed");
  let calls = 0;
  const ScheduleModel = {
    async findOneAndUpdate() {
      calls += 1;
      throw databaseError;
    },
  };

  await assert.rejects(
    upsertPersonalSchedule(barberId, weeklySchedule, { ScheduleModel }),
    (error) => error === databaseError
  );
  assert.equal(calls, 1);
});
