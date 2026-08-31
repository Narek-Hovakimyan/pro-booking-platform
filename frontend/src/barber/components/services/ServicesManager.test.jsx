import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ServicesManager from "./ServicesManager";

const fetchServiceCategories = vi.fn();

vi.mock("react-redux", () => ({
  useSelector: (selector) => selector({ auth: { currentUser: { id: "barber-1" } } }),
}));

vi.mock("@/shared/api/serviceCategories", () => ({
  fetchServiceCategories: (...args) => fetchServiceCategories(...args),
  createServiceCategory: vi.fn(),
}));

describe("ServicesManager", () => {
  test("editing retains an owner-visible inactive custom category", async () => {
    fetchServiceCategories.mockResolvedValue([]);

    render(
      <ServicesManager
        services={[{
          id: "service-1",
          name: "Color",
          price: 8000,
          duration: 60,
          active: true,
          category: "other",
          customCategoryId: {
            _id: "inactive-category",
            name: "Archived Color",
            active: false,
          },
        }]}
        removeService={vi.fn()}
        addService={vi.fn()}
        updateService={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle("Edit"));

    expect(await screen.findByText("Archived Color (Inactive)")).toBeInTheDocument();
    expect(screen.getByText(/retained for this service/i)).toBeInTheDocument();
  });
});
