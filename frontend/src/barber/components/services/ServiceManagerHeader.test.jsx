import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ServiceManagerHeader from "./ServiceManagerHeader";

function renderHeader(props = {}) {
  const onAdd = vi.fn();
  const renderResult = render(
    <ServiceManagerHeader
      servicesCount={12}
      activeCount={8}
      inactiveCount={4}
      error=""
      isLoading={false}
      isSaving={false}
      isEmpty={false}
      onAdd={onAdd}
      {...props}
    >
      <div>Rendered services list</div>
    </ServiceManagerHeader>
  );

  return { ...renderResult, onAdd };
}

describe("ServiceManagerHeader", () => {
  test("keeps total, active, and inactive counters visible in embedded mode", () => {
    const { container } = renderHeader();

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(container.querySelector(".grid.w-full.grid-cols-3")).toBeTruthy();
    expect(container.querySelector(".xl\\:flex-row")).toBeNull();
  });

  test("uses the full-page responsive header classes without changing add-service or child rendering", () => {
    const { container, onAdd } = (() => {
      const onAdd = vi.fn();
      const result = render(
        <ServiceManagerHeader
          servicesCount={3}
          activeCount={2}
          inactiveCount={1}
          error=""
          isLoading={false}
          isSaving={false}
          isEmpty={false}
          onAdd={onAdd}
          fullPage
        >
          <div>Rendered services list</div>
        </ServiceManagerHeader>
      );
      return { ...result, onAdd };
    })();

    expect(container.querySelector(".xl\\:flex-row")).toBeTruthy();
    expect(container.querySelector(".xl\\:max-w-sm")).toBeTruthy();
    expect(screen.getByText("Rendered services list")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
