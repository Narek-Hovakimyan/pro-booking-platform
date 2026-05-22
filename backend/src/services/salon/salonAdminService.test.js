import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { getSalonAdminsForSalon } from "./salonAdminService.js";

const originalMethods = {
  salonFindById: Salon.findById,
  userFind: User.find,
  userFindById: User.findById,
};

const salonId = "64b000000000000000000011";
const ownerId = "64b000000000000000000012";
const adminId = "64b000000000000000000013";

afterEach(() => {
  Salon.findById = originalMethods.salonFindById;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
});

const createUser = (overrides = {}) => ({
  _id: overrides._id || ownerId,
  name: overrides.name || "Owner",
  phone: overrides.phone || "+374000000",
  avatarUrl: overrides.avatarUrl || "avatar.jpg",
  city: overrides.city || "Yerevan",
  password: "secret",
  ...overrides,
});

test("returns serialized owner and admins", async () => {
  let ownerSelect = null;
  let adminsSelect = null;

  Salon.findById = async (id) => {
    assert.equal(id, salonId);
    return {
      _id: salonId,
      ownerId,
      admins: [adminId],
    };
  };
  User.findById = (id) => {
    assert.equal(id, ownerId);
    return {
      select(fields) {
        ownerSelect = fields;
        return createUser();
      },
    };
  };
  User.find = (query) => {
    assert.deepEqual(query, { _id: { $in: [adminId] } });
    return {
      select(fields) {
        adminsSelect = fields;
        return [createUser({ _id: adminId, name: "Admin" })];
      },
    };
  };

  const payload = await getSalonAdminsForSalon(salonId);

  assert.equal(ownerSelect, "name phone avatarUrl city");
  assert.equal(adminsSelect, "name phone avatarUrl city");
  assert.equal(payload.owner.id, ownerId);
  assert.equal(payload.owner.password, undefined);
  assert.deepEqual(payload.admins.map((admin) => admin.id), [adminId]);
  assert.equal(payload.admins[0].password, undefined);
});

test("returns empty admins without admin lookup when salon has no admin IDs", async () => {
  let findCalled = false;

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
  });
  User.findById = () => ({
    select: () => createUser(),
  });
  User.find = async () => {
    findCalled = true;
    return [];
  };

  const payload = await getSalonAdminsForSalon(salonId);

  assert.deepEqual(payload.admins, []);
  assert.equal(findCalled, false);
});

test("missing salon returns structured 404", async () => {
  Salon.findById = async () => null;

  await assert.rejects(
    getSalonAdminsForSalon(salonId),
    {
      statusCode: 404,
      message: "Salon not found",
    }
  );
});
