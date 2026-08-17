import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import api from "@/shared/api/axios";
import BarbersPage from "./BarbersPage";

vi.mock("@/shared/api/axios", () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/client/components/barbers/BarbersFiltersPanel", () => ({
  default: ({
    onPriceRangeChange,
    onSearchChange,
    priceRange,
    searchTerm,
  }) => (
    <div>
      <input
        aria-label="search"
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <input
        aria-label="min price"
        value={priceRange.min}
        onChange={(event) => onPriceRangeChange("min", event.target.value)}
      />
      <input
        aria-label="max price"
        value={priceRange.max}
        onChange={(event) => onPriceRangeChange("max", event.target.value)}
      />
    </div>
  ),
}));

vi.mock("@/client/components/barbers/BarbersGrid", () => ({
  default: ({ barbers = [] }) => (
    <div data-testid="barbers">
      {barbers.map((barber) => (
        <span data-testid={`barber-${barber.id}`} key={barber.id}>
          {barber.name}
        </span>
      ))}
    </div>
  ),
}));

const summary = {
  barbers: [
    { id: "range", name: "Range Barber", role: "barber", city: "Yerevan" },
    { id: "inside", name: "Inside Barber", role: "barber", city: "Yerevan" },
    { id: "inactive", name: "Inactive Barber", role: "barber", city: "Yerevan" },
    { id: "no-price", name: "No Price Barber", role: "barber", city: "Yerevan" },
  ],
  services: [
    { id: "range-low", barberId: "range", active: true, name: "Low", price: 10 },
    { id: "range-high", barberId: "range", active: true, name: "High", price: 100 },
    { id: "inside-low", barberId: "inside", active: true, name: "Low", price: 10 },
    { id: "inside-match", barberId: "inside", active: true, name: "Match", price: 60 },
    { id: "inactive-low", barberId: "inactive", active: true, name: "Low", price: 10 },
    { id: "inactive-match", barberId: "inactive", active: false, name: "Match", price: 60 },
  ],
  reviewStats: [],
  availability: [],
};

function renderPage() {
  return renderWithProviders(<BarbersPage />, {
    initialEntries: ["/specialists"],
    preloadedState: {
      auth: {
        currentUser: { id: "client-1", role: "client" },
        isAuthenticated: true,
        token: "token",
      },
    },
  });
}

function mockApi() {
  api.get.mockImplementation((url) => {
    if (url === "/barbers/card-summary") return Promise.resolve({ data: summary });
    if (url === "/favorites") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

async function setPriceRange(min, max) {
  if (!screen.queryByLabelText("min price")) {
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    await screen.findByLabelText("min price");
  }
  if (min !== undefined) {
    fireEvent.change(screen.getByLabelText("min price"), { target: { value: min } });
  }
  if (max !== undefined) {
    fireEvent.change(screen.getByLabelText("max price"), { target: { value: max } });
  }
  await waitFor(() => expect(screen.getByTestId("barbers")).toBeInTheDocument());
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.delete.mockReset();
  mockApi();
});

describe("BarbersPage price filtering", () => {
  it("excludes split prices when no single service is inside the range", async () => {
    renderPage();
    await screen.findByText("Range Barber");

    await setPriceRange("50", "80");

    expect(screen.queryByText("Range Barber")).not.toBeInTheDocument();
    expect(screen.queryByText("Inside Barber")).toBeInTheDocument();
    expect(screen.queryByText("Inactive Barber")).not.toBeInTheDocument();
  });

  it("includes a barber with at least one active price inside both bounds", async () => {
    renderPage();
    await screen.findByText("Range Barber");

    await setPriceRange("50", "80");

    expect(screen.getByText("Inside Barber")).toBeInTheDocument();
  });

  it("preserves min-only filtering", async () => {
    renderPage();
    await screen.findByText("Range Barber");

    await setPriceRange("50", "");

    expect(screen.getByText("Range Barber")).toBeInTheDocument();
    expect(screen.getByText("Inside Barber")).toBeInTheDocument();
    expect(screen.queryByText("No Price Barber")).not.toBeInTheDocument();
  });

  it("preserves max-only filtering", async () => {
    renderPage();
    await screen.findByText("Range Barber");

    await setPriceRange("", "20");

    expect(screen.getByText("Range Barber")).toBeInTheDocument();
    expect(screen.getByText("Inside Barber")).toBeInTheDocument();
    expect(screen.queryByText("No Price Barber")).not.toBeInTheDocument();
  });

  it("does not use inactive in-range services", async () => {
    renderPage();
    await screen.findByText("Range Barber");

    await setPriceRange("50", "80");

    expect(screen.queryByText("Inactive Barber")).not.toBeInTheDocument();
  });

  it("keeps unrelated name filtering compatible with price filtering", async () => {
    renderPage();
    await screen.findByText("Range Barber");

    await setPriceRange("50", "80");
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "Inside" } });

    expect(screen.getByText("Inside Barber")).toBeInTheDocument();
    expect(screen.queryByText("Range Barber")).not.toBeInTheDocument();
  });
});
