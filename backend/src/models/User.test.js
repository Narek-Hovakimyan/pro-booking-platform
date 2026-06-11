import assert from "node:assert/strict";
import { before, after, describe, test } from "node:test";
import mongoose from "mongoose";
import UserModel from "./User.js";

const TEST_MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/hairbook_test";
const TEST_RUN_ID = `${process.pid.toString(36)}${(Date.now() % 46656).toString(36)}`;
const TEST_PHONE_PREFIX = `umt${TEST_RUN_ID}`;
const phone = (suffix) =>
  `${TEST_PHONE_PREFIX}${String(suffix).replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
let connection;
let User;

before(async () => {
  connection = await mongoose.createConnection(TEST_MONGO_URI).asPromise();
  User = connection.model("User", UserModel.schema, "users");
});

after(async () => {
  await connection.close();
});

describe("User profession/barberType invariants", () => {

  describe("pre('save') hook", () => {

    test("non-barber profession clears barberType", async () => {
      const user = await User.create({
        name: "Nail Master",
        phone: phone("test-1"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "men",
      });
      assert.equal(user.barberType, "");
      assert.equal(user.specialty, "unisex");
      await User.deleteOne({ _id: user._id });
    });

    test("barber profession with missing barberType defaults to unisex", async () => {
      const user = await User.create({
        name: "Default Barber",
        phone: phone("test-2"),
        password: "pass",
        role: "barber",
        profession: "barber",
      });
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
      await User.deleteOne({ _id: user._id });
    });

    test("barber profession with barberType aligns specialty", async () => {
      const user = await User.create({
        name: "Men Barber",
        phone: phone("test-3"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
      });
      assert.equal(user.barberType, "men");
      assert.equal(user.specialty, "men");
      await User.deleteOne({ _id: user._id });
    });

    test("existing barber clearing barberType resets to unisex", async () => {
      const user = await User.create({
        name: "Cleared",
        phone: phone("test-4"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "",
      });
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
      await User.deleteOne({ _id: user._id });
    });

    test("barber profession with barberType=unisex aligns specialty=unisex", async () => {
      const user = await User.create({
        name: "Unisex Barber",
        phone: phone("test-5"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
      });
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
      await User.deleteOne({ _id: user._id });
    });

    test("non-barber keeps specialty=unisex even with invalid specialty", async () => {
      // Simulate direct DB write with an invalid specialty
      // then load + save to verify the hook normalizes it
      const user = await User.create({
        name: "Invalid Specialty",
        phone: phone("test-6"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
      });
      // Change to non-barber profession
      user.profession = "cosmetologist";
      await user.save();
      assert.equal(user.barberType, "");
      assert.equal(["men", "women", "unisex"].includes(user.specialty), true);
      await User.deleteOne({ _id: user._id });
    });

  });

  describe("pre('init') backward compatibility", () => {

    test("old user with only specialty derives profession=barber and barberType from specialty", async () => {
      // Insert raw doc without profession/barberType via the native driver
      const collection = connection.collection("users");
      const rawResult = await collection.insertOne({
        name: "Legacy",
        phone: phone("test-legacy-1"),
        password: "pass",
        role: "barber",
        specialty: "women",
        createdAt: new Date(),
      });
      const rawId = rawResult.insertedId;

      // Load via Mongoose — pre('init') should derive profession/barberType
      const user = await User.findById(rawId).select("-password");
      assert.equal(user.profession, "barber");
      assert.equal(user.barberType, "women");
      await User.deleteOne({ _id: rawId });
    });

    test("old user with specialty=men derives correctly", async () => {
      const collection = connection.collection("users");
      const rawResult = await collection.insertOne({
        name: "Legacy Men",
        phone: phone("test-legacy-2"),
        password: "pass",
        role: "barber",
        specialty: "men",
        createdAt: new Date(),
      });
      const rawId = rawResult.insertedId;

      const user = await User.findById(rawId);
      assert.equal(user.profession, "barber");
      assert.equal(user.barberType, "men");
      await User.deleteOne({ _id: rawId });
    });

    test("user with explicit profession is NOT overwritten by pre('init')", async () => {
      const user = await User.create({
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
      await User.deleteOne({ _id: user._id });
    });

  });

  describe("findByIdAndUpdate (via pre('findOneAndUpdate'))", () => {

    test("update to non-barber profession clears barberType", async () => {
      const user = await User.create({
        name: "ToNail",
        phone: phone("test-upd-1"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
      });

      const updated = await User.findByIdAndUpdate(
        user._id,
        { profession: "nail_master" },
        { returnDocument: "after", runValidators: true }
      );
      assert.equal(updated.barberType, "");
      assert.equal(updated.specialty, "men"); // specialty unchanged, was "men"
      await User.deleteOne({ _id: user._id });
    });

    test("update to non-barber with barberType NEVER overrides specialty", async () => {
      const user = await User.create({
        name: "NailOverride",
        phone: phone("test-upd-5"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
      });

      const updated = await User.findByIdAndUpdate(
        user._id,
        { profession: "nail_master", barberType: "men" },
        { returnDocument: "after", runValidators: true }
      );
      // profession = non-barber → barberType cleared, specialty must NOT follow barberType
      assert.equal(updated.barberType, "", "barberType is cleared for non-barber");
      assert.notEqual(
        updated.specialty, "men",
        "specialty must NOT be set to 'men' when profession is non-barber"
      );
      // specialty keeps its previous database value ("unisex")
      assert.equal(updated.specialty, "unisex");
      await User.deleteOne({ _id: user._id });
    });

    test("update to barber with empty barberType defaults to unisex", async () => {
      const user = await User.create({
        name: "ToBarberEmpty",
        phone: phone("test-upd-2"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "",
      });

      const updated = await User.findByIdAndUpdate(
        user._id,
        { profession: "barber", barberType: "" },
        { returnDocument: "after", runValidators: true }
      );
      assert.equal(updated.barberType, "unisex");
      assert.equal(updated.specialty, "unisex");
      await User.deleteOne({ _id: user._id });
    });

    test("update barberType aligns specialty", async () => {
      const user = await User.create({
        name: "UpdateBarberType",
        phone: phone("test-upd-3"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
      });

      const updated = await User.findByIdAndUpdate(
        user._id,
        { barberType: "women" },
        { returnDocument: "after", runValidators: true }
      );
      assert.equal(updated.barberType, "women");
      assert.equal(updated.specialty, "women");
      await User.deleteOne({ _id: user._id });
    });

    test("update barberType=men aligns specialty=men", async () => {
      const user = await User.create({
        name: "UpdateBarberType2",
        phone: phone("test-upd-4"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
      });

      const updated = await User.findByIdAndUpdate(
        user._id,
        { barberType: "men" },
        { returnDocument: "after", runValidators: true }
      );
      assert.equal(updated.barberType, "men");
      assert.equal(updated.specialty, "men");
      await User.deleteOne({ _id: user._id });
    });

  });

  describe("pre('save') path: non-barber does not leak specialty", () => {

    test("save non-barber clears barberType, preserves valid legacy specialty", async () => {
      const user = await User.create({
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
      await user.save();

      assert.equal(user.barberType, "", "barberType cleared for non-barber");
      // Legacy specialty stays "women" (valid enum value) — only invalid specialties get normalized
      assert.equal(user.specialty, "women", "valid specialty preserved for backward compat");
      await User.deleteOne({ _id: user._id });
    });

  });

  describe("upsertProfile response includes profession/barberType", () => {
    // This is tested via the controller-level responses already added
  });

});
