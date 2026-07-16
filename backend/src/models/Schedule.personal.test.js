import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";

import Schedule from "./Schedule.js";

const barberId = new mongoose.Types.ObjectId();
const salonId = new mongoose.Types.ObjectId();

test("Schedule supports explicit null personal identity and keeps the salon index unchanged", () => {
  const personal = new Schedule({ barberId });
  const salonSchedule = new Schedule({ barberId, salonId });
  const invalidSalon = new Schedule({ barberId, salonId: "not-an-object-id" });
  const compoundIndex = Schedule.schema.indexes().find(
    ([fields]) => fields.barberId === 1 && fields.salonId === 1
  );

  assert.equal(personal.salonId, null);
  assert.equal(personal.validateSync(), undefined);
  assert.equal(salonSchedule.validateSync(), undefined);
  assert.ok(invalidSalon.validateSync()?.errors?.salonId);
  assert.deepEqual(compoundIndex, [{ barberId: 1, salonId: 1 }, { unique: true }]);
  assert.equal(Schedule.schema.path("salonId").options.required, false);
  assert.equal(Schedule.schema.path("salonId").options.default, null);
  assert.equal(Schedule.schema.indexes().length, 1);
  assert.equal(Object.hasOwn(personal.toObject(), "isPersonal"), false);
});
