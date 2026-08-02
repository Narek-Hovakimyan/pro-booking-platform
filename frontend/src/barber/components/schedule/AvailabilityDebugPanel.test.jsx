import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AvailabilityDebugPanel from "./AvailabilityDebugPanel";

const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/axios", () => ({
  default: {
    post: apiPostMock,
  },
}));

beforeEach(() => {
  apiPostMock.mockReset();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AvailabilityDebugPanel", () => {
  test("hides the diagnostics UI and skips the debug API in production", () => {
    vi.stubEnv("PROD", true);

    const { container } = render(
      <AvailabilityDebugPanel
        barberId="barber-1"
        selectedSalonId="salon-1"
        selectedDateKey="2026-08-02"
        services={[{ id: "service-1", name: "Cut", duration: 30 }]}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Testing tools")).not.toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  test("keeps the development diagnostics UI intact", () => {
    render(
      <AvailabilityDebugPanel
        barberId="barber-1"
        selectedSalonId="salon-1"
        selectedDateKey="2026-08-02"
        services={[{ id: "service-1", name: "Cut", duration: 30 }]}
      />
    );

    expect(screen.getByText("Testing tools")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check availability" })).toBeInTheDocument();
  });
});
