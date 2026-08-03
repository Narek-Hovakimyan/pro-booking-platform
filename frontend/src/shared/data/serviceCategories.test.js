import { describe, expect, test } from "vitest";

import { getServicePriceInfo } from "./serviceCategories";

describe("getServicePriceInfo", () => {
  test("formats fixed discount labels with AMD and thousands separators", () => {
    expect(
      getServicePriceInfo({
        price: 15000,
        discountType: "fixed",
        discountValue: 5000,
      })
    ).toMatchObject({
      originalPrice: 15000,
      serviceDiscountAmount: 5000,
      discountedPrice: 10000,
      hasDiscount: true,
      discountLabel: "-5,000 AMD",
    });
  });

  test("keeps percentage discount labels unchanged", () => {
    expect(
      getServicePriceInfo({
        price: 20000,
        discountType: "percent",
        discountValue: 25,
      }).discountLabel
    ).toBe("25% OFF");
  });

  test("returns an empty label for zero or missing discounts", () => {
    expect(
      getServicePriceInfo({
        price: 10000,
        discountType: "fixed",
        discountValue: 0,
      }).discountLabel
    ).toBe("");

    expect(getServicePriceInfo({ price: 10000 }).discountLabel).toBe("");
  });

  test("caps fixed discounts at the original price", () => {
    expect(
      getServicePriceInfo({
        price: 3000,
        discountType: "fixed",
        discountValue: 5000,
      })
    ).toMatchObject({
      serviceDiscountAmount: 3000,
      discountedPrice: 0,
      discountLabel: "-3,000 AMD",
    });
  });

  test("keeps invalid and missing values safe", () => {
    const invalidPriceInfo = getServicePriceInfo({
      price: "bad",
      discountType: "fixed",
      discountValue: "bad",
    });

    expect(invalidPriceInfo).toMatchObject({
      originalPrice: 0,
      serviceDiscountAmount: 0,
      discountedPrice: 0,
      hasDiscount: false,
      discountLabel: "",
    });

    expect(getServicePriceInfo()).toMatchObject({
      originalPrice: 0,
      serviceDiscountAmount: 0,
      discountedPrice: 0,
      hasDiscount: false,
      discountLabel: "",
    });
  });

  test("never exposes legacy or invalid currency text in fixed discount labels", () => {
    const { discountLabel } = getServicePriceInfo({
      price: "5000",
      discountType: "fixed",
      discountValue: "2000",
    });

    expect(discountLabel).toBe("-2,000 AMD");
    expect(discountLabel).not.toContain("դր");
    expect(discountLabel).not.toContain("դրամ");
    expect(discountLabel).not.toContain("NaN");
    expect(discountLabel).not.toMatch(/AMD\s+AMD/u);
  });
});
