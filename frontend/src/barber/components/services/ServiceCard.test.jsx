import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ServiceCard from "./ServiceCard";

const baseProps = {
  customCategories: [],
  isSaving: false,
  deleteConfirmId: null,
  onEdit: vi.fn(),
  onToggleActive: vi.fn(),
  onDeleteConfirm: vi.fn(),
  onDeleteCancel: vi.fn(),
  onDeleteConfirmExecute: vi.fn(),
};

describe("ServiceCard", () => {
  test("renders regular prices with the shared AMD formatter", () => {
    render(
      <ServiceCard
        {...baseProps}
        service={{
          id: "service-1",
          name: "Haircut",
          price: 5000,
          duration: 45,
          active: true,
          category: "haircut",
          discountType: "none",
        }}
      />
    );

    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/դր/u)).not.toBeInTheDocument();
  });

  test("renders original and discounted prices in AMD while preserving discount display", () => {
    render(
      <ServiceCard
        {...baseProps}
        service={{
          id: "service-2",
          name: "Color",
          price: 8000,
          duration: 90,
          active: true,
          category: "coloring",
          discountType: "fixed",
          discountValue: 1000,
        }}
      />
    );

    const originalPrice = screen.getByText("8,000 AMD");
    const discountedPrice = screen.getByText("7,000 AMD");

    expect(originalPrice).toBeInTheDocument();
    expect(originalPrice).toHaveClass("line-through");
    expect(discountedPrice).toBeInTheDocument();
    expect(screen.getByText("-1,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/դր/u)).not.toBeInTheDocument();
  });

  test("disables mutation controls, including confirmed delete, while saving", () => {
    render(
      <ServiceCard
        {...baseProps}
        isSaving
        deleteConfirmId="service-3"
        service={{
          id: "service-3",
          name: "Haircut",
          price: 5000,
          duration: 45,
          active: true,
          category: "haircut",
        }}
      />
    );

    expect(screen.getByTitle("Deactivate")).toBeDisabled();
    expect(screen.getByTitle("Edit")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  test("keeps mutation controls usable when not saving", () => {
    const onToggleActive = vi.fn();
    const onEdit = vi.fn();
    const onDeleteConfirm = vi.fn();

    render(
      <ServiceCard
        {...baseProps}
        onToggleActive={onToggleActive}
        onEdit={onEdit}
        onDeleteConfirm={onDeleteConfirm}
        service={{
          id: "service-4",
          name: "Haircut",
          price: 5000,
          duration: 45,
          active: true,
          category: "haircut",
        }}
      />
    );

    fireEvent.click(screen.getByTitle("Deactivate"));
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByTitle("Delete"));

    expect(onToggleActive).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDeleteConfirm).toHaveBeenCalledTimes(1);
  });
});
