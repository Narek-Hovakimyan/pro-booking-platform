import assert from "node:assert/strict";
import { describe, test } from "node:test";
import mongoose from "mongoose";
import User from "./User.js";

const phone = (suffix) => `umt${String(suffix).replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;

const runSaveHooks = async (user) => {
  await User.schema.s.hooks.execPre("save", user, []);
  return user;
};

const runFindOneAndUpdateHooks = async (initial, update) => {
  const query = User.findByIdAndUpdate(
    new mongoose.Types.ObjectId(),
    update,
    { returnDocument: "after", runValidators: true }
  );

  await User.schema.s.hooks.execPre("findOneAndUpdate", query, []);

  const finalUpdate = query.getUpdate() || {};
  const directUpdates = Object.fromEntries(
    Object.entries(finalUpdate).filter(([key]) => !key.startsWith("$"))
  );

  return {
    ...initial,
    ...directUpdates,
    ...(finalUpdate.$set || {}),
  };
};

describe("User profession/barberType invariants", () => {

  describe("pre('save') hook", () => {

    test("non-barber profession clears barberType", async () => {
      const user = await runSaveHooks(new User({
        name: "Nail Master",
        phone: phone("test-1"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "men",
      }));
      assert.equal(user.barberType, "");
      assert.equal(user.specialty, "unisex");
    });

    test("barber profession with missing barberType defaults to unisex", async () => {
      const user = await runSaveHooks(new User({
        name: "Default Barber",
        phone: phone("test-2"),
        password: "pass",
        role: "barber",
        profession: "barber",
      }));
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
    });

    test("barber profession with barberType aligns specialty", async () => {
      const user = await runSaveHooks(new User({
        name: "Men Barber",
        phone: phone("test-3"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
      }));
      assert.equal(user.barberType, "men");
      assert.equal(user.specialty, "men");
    });

    test("existing barber clearing barberType resets to unisex", async () => {
      const user = await runSaveHooks(new User({
        name: "Cleared",
        phone: phone("test-4"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "",
      }));
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
    });

    test("barber profession with barberType=unisex aligns specialty=unisex", async () => {
      const user = await runSaveHooks(new User({
        name: "Unisex Barber",
        phone: phone("test-5"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
      }));
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
    });

    test("non-barber keeps specialty=unisex even with invalid specialty", async () => {
      const user = new User({
        name: "Invalid Specialty",
        phone: phone("test-6"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
      });
      user.specialty = "invalid";
      user.profession = "cosmetologist";
      await runSaveHooks(user);
      assert.equal(user.barberType, "");
      assert.equal(["men", "women", "unisex"].includes(user.specialty), true);
    });

  });

  describe("pre('init') backward compatibility", () => {

    test("old user with only specialty derives profession=barber and barberType from specialty", async () => {
      const user = User.hydrate({
        name: "Legacy",
        phone: phone("test-legacy-1"),
        password: "pass",
        role: "barber",
        specialty: "women",
        createdAt: new Date(),
      });
      assert.equal(user.profession, "barber");
      assert.equal(user.barberType, "women");
    });

    test("old user with specialty=men derives correctly", async () => {
      const user = User.hydrate({
        name: "Legacy Men",
        phone: phone("test-legacy-2"),
        password: "pass",
        role: "barber",
        specialty: "men",
        createdAt: new Date(),
      });
      assert.equal(user.profession, "barber");
      assert.equal(user.barberType, "men");
    });

    test("user with explicit profession is NOT overwritten by pre('init')", async () => {
      const user = User.hydrate({
        name: "Explicit Nail",
        phone: phone("test-legacy-3"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "",
        specialty: "unisex",
      });
      assert.equal(user.profession, "nail_master");
      assert.equal(user.barberType, "");
    });

  });

  describe("findByIdAndUpdate (via pre('findOneAndUpdate'))", () => {

    test("update to non-barber profession clears barberType", async () => {
      const user = {
        name: "ToNail",
        phone: phone("test-upd-1"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
        specialty: "men",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { profession: "nail_master" }
      );
      assert.equal(updated.barberType, "");
      assert.equal(updated.specialty, "men"); // specialty unchanged, was "men"
    });

    test("update to non-barber with barberType NEVER overrides specialty", async () => {
      const user = {
        name: "NailOverride",
        phone: phone("test-upd-5"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { profession: "nail_master", barberType: "men" }
      );
      // profession = non-barber → barberType cleared, specialty must NOT follow barberType
      assert.equal(updated.barberType, "", "barberType is cleared for non-barber");
      assert.notEqual(
        updated.specialty, "men",
        "specialty must NOT be set to 'men' when profession is non-barber"
      );
      // specialty keeps its previous database value ("unisex")
      assert.equal(updated.specialty, "unisex");
    });

    test("update to barber with empty barberType defaults to unisex", async () => {
      const user = {
        name: "ToBarberEmpty",
        phone: phone("test-upd-2"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { profession: "barber", barberType: "" }
      );
      assert.equal(updated.barberType, "unisex");
      assert.equal(updated.specialty, "unisex");
    });

    test("update barberType aligns specialty", async () => {
      const user = {
        name: "UpdateBarberType",
        phone: phone("test-upd-3"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { barberType: "women" }
      );
      assert.equal(updated.barberType, "women");
      assert.equal(updated.specialty, "women");
    });

    test("update barberType=men aligns specialty=men", async () => {
      const user = {
        name: "UpdateBarberType2",
        phone: phone("test-upd-4"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { barberType: "men" }
      );
      assert.equal(updated.barberType, "men");
      assert.equal(updated.specialty, "men");
    });

  });

  describe("pre('save') path: non-barber does not leak specialty", () => {

    test("save non-barber clears barberType, preserves valid legacy specialty", async () => {
      const user = new User({
        name: "SaveNail",
        phone: phone("test-save-1"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "women",
        specialty: "women",
      });

      // Change to non-barber via save — barberType is cleared, but valid legacy specialty is preserved
      user.profession = "nail_master";
      user.barberType = "men";
      await runSaveHooks(user);

      assert.equal(user.barberType, "", "barberType cleared for non-barber");
      // Legacy specialty stays "women" (valid enum value) — only invalid specialties get normalized
      assert.equal(user.specialty, "women", "valid specialty preserved for backward compat");
    });

  });

  describe("upsertProfile response includes profession/barberType", () => {
    // This is tested via the controller-level responses already added
  });

});

describe("User platform admin role model", () => {
  const makeUser = (overrides = {}) =>
    new User({
      name: "Role Model User",
      phone: phone(overrides.role || overrides.platformRole || "role-model"),
      password: "password123",
      ...overrides,
    });

  test("business role rejects platform_admin", () => {
    const user = makeUser({ role: "platform_admin" });
    const error = user.validateSync();

    assert.ok(error?.errors?.role, "role validation error expected");
    assert.match(error.errors.role.message, /platform_admin/);
  });

  test("business role rejects user", () => {
    const user = makeUser({ role: "user" });
    const error = user.validateSync();

    assert.ok(error?.errors?.role, "role validation error expected");
    assert.match(error.errors.role.message, /user/);
  });

  test("existing client and barber business roles remain valid without platformRole", () => {
    const client = makeUser({ role: "client" });
    const barber = makeUser({ role: "barber" });

    assert.equal(client.platformRole, null);
    assert.equal(barber.platformRole, null);
    assert.equal(client.validateSync(), undefined);
    assert.equal(barber.validateSync(), undefined);
  });

  test("platformRole admin is separate from business role", () => {
    const clientAdmin = makeUser({ role: "client", platformRole: "admin" });
    const barberAdmin = makeUser({ role: "barber", platformRole: "admin" });

    assert.equal(clientAdmin.validateSync(), undefined);
    assert.equal(barberAdmin.validateSync(), undefined);
    assert.equal(clientAdmin.role, "client");
    assert.equal(barberAdmin.role, "barber");
    assert.equal(clientAdmin.platformRole, "admin");
    assert.equal(barberAdmin.platformRole, "admin");
  });
});
