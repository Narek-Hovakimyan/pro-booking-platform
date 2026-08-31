import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ServiceCategoryManager from "./ServiceCategoryManager";

const fetchServiceCategories = vi.fn();

vi.mock("@/shared/api/serviceCategories", () => ({
  fetchServiceCategories: (...args) => fetchServiceCategories(...args),
  createServiceCategory: vi.fn(),
}));

describe("ServiceCategoryManager", () => {
  test("retains the current inactive category without offering it for new assignments", async () => {
    fetchServiceCategories.mockResolvedValue([
      { id: "active-category", name: "Active Category", source: "custom" },
    ]);

    render(
      <ServiceCategoryManager
        barberId="barber-1"
        form={{
          categoryType: "custom",
          customCategoryId: "inactive-category",
          currentCustomCategory: {
            id: "inactive-category",
            name: "Archived Color",
            active: false,
          },
        }}
        isSaving={false}
      />
    );

    expect(await screen.findByText("Archived Color (Inactive)")).toBeInTheDocument();
    expect(screen.getByText(/retained for this service/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Archived Color (Inactive)" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Active Category" })).not.toBeDisabled();
  });

  test("marks a missing legacy category as unavailable", async () => {
    fetchServiceCategories.mockResolvedValue([]);

    render(
      <ServiceCategoryManager
        barberId="barber-1"
        form={{
          categoryType: "custom",
          customCategoryId: "missing-category",
          currentCustomCategory: {
            id: "missing-category",
            name: "Unavailable custom category",
            active: false,
            missing: true,
          },
        }}
        isSaving={false}
      />
    );

    expect(await screen.findByText(/category is unavailable/i)).toBeInTheDocument();
  });
});
