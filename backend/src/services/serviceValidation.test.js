import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateServiceDiscountedPrice,
  validateServicePayload,
} from "./serviceValidation.js";
import {
  calculateServiceDiscountedPrice as controllerDiscount,
} from "../controllers/services/serviceController.js";

test("service controller preserves the discount helper export", () => {
  assert.equal(controllerDiscount, calculateServiceDiscountedPrice);
});

test("discount calculations preserve boundaries and legacy rounding", () => {
  assert.deepEqual(
    calculateServiceDiscountedPrice({ price: 999, discountType: "percent", discountValue: 15 }),
    { discountAmount: 150, discountedPrice: 849 }
  );
  assert.deepEqual(
    calculateServiceDiscountedPrice({ price: 5000, discountType: "percent", discountValue: 100 }),
    { discountAmount: 5000, discountedPrice: 0 }
  );
  assert.deepEqual(
    calculateServiceDiscountedPrice({ price: 5000, discountType: "fixed", discountValue: 7000 }),
    { discountAmount: 5000, discountedPrice: 0 }
  );
  assert.deepEqual(
    calculateServiceDiscountedPrice({ price: 5000, discountType: "none", discountValue: 0 }),
    { discountAmount: 0, discountedPrice: 5000 }
  );
});

test("tag validation trims, lowercases, deduplicates, and bounds tags", () => {
  assert.deepEqual(
    validateServicePayload({
      name: "Cut",
      price: 5000,
      duration: 30,
      tags: [" Trim ", "trim", "Line Up", "   "],
    }).value.tags,
    ["trim", "line up"]
  );
  assert.deepEqual(
    validateServicePayload({
      name: "Cut",
      price: 5000,
      duration: 30,
      tags: "trim",
    }),
    { error: "Tags must be an array" }
  );
  assert.deepEqual(
    validateServicePayload({
      name: "Cut",
      price: 5000,
      duration: 30,
      tags: ["a".repeat(33)],
    }),
    { error: "Tags must be 32 characters or less" }
  );
});

test("payload validation preserves accepted numeric strings and normalized fields", () => {
  assert.deepEqual(
    validateServicePayload({
      name: " Beard Trim ",
      price: "5000",
      duration: "30",
      description: "  Details  ",
      category: "beard",
      active: true,
      discountType: "percent",
      discountValue: "20",
      type: "single",
    }),
    {
      value: {
        name: "Beard Trim",
        price: 5000,
        duration: 30,
        description: "Details",
        category: "beard",
        active: true,
        discountType: "percent",
        discountValue: 20,
        type: "single",
      },
    }
  );
});

test("payload validation rejects malformed values without coercing tag objects", () => {
  const hostileTag = {
    toString() {
      throw new Error("tag coercion should not run");
    },
    valueOf() {
      throw new Error("tag valueOf should not run");
    },
  };

  assert.deepEqual(
    validateServicePayload({ name: "Cut", price: 5000, duration: 30, tags: [hostileTag] }),
    { error: "Tags must be strings" }
  );
  assert.deepEqual(
    validateServicePayload({ name: {}, price: 5000, duration: 30 }),
    { error: "Service name is required" }
  );
  assert.deepEqual(
    validateServicePayload({ name: "Cut", price: 5000, duration: 30, active: "true" }),
    { error: "Active must be a boolean" }
  );
});

