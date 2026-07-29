import assert from "node:assert/strict";
import { describe, test } from "node:test";

import PortfolioPhoto from "./PortfolioPhoto.js";

describe("PortfolioPhoto", () => {
  test("supports binding exact before and after MediaObjects without exposing them by default", () => {
    assert.equal(
      PortfolioPhoto.schema.path("beforeMediaObjectId").options.select,
      false
    );
    assert.equal(
      PortfolioPhoto.schema.path("afterMediaObjectId").options.select,
      false
    );
  });

  test("preserves existing public listing indexes", () => {
    const indexes = PortfolioPhoto.schema.indexes().map(([fields]) => fields);

    assert.ok(
      indexes.some(
        (fields) =>
          fields.barberId === 1 &&
          fields.active === 1 &&
          fields.isPublic === 1 &&
          fields.consentConfirmed === 1
      )
    );
  });

  test("accepts optional media bindings alongside legacy URLs", async () => {
    const photo = new PortfolioPhoto({
      barberId: "64c000000000000000000001",
      beforeUrl: "/uploads/portfolio/portfolio-before.jpg",
      afterUrl: "/uploads/portfolio/portfolio-after.jpg",
      beforeMediaObjectId: "64c000000000000000000010",
      afterMediaObjectId: "64c000000000000000000011",
      consentConfirmed: true,
    });

    await photo.validate();

    assert.equal(String(photo.beforeMediaObjectId), "64c000000000000000000010");
    assert.equal(String(photo.afterMediaObjectId), "64c000000000000000000011");
  });
});
