import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import api from "@/shared/api/axios";
import BarbersPage from "./BarbersPage";

vi.mock("@/shared/api/axios", () => ({ default: { delete: vi.fn(), get: vi.fn(), post: vi.fn() } }));
vi.mock("@/client/components/barbers/BarbersFiltersPanel", () => ({
  default: (props) => <div>
    <input aria-label="search" value={props.searchTerm} onChange={(event) => props.onSearchChange(event.target.value)} />
    <input aria-label="city" value={props.selectedCity} onChange={(event) => props.onCityChange(event.target.value)} />
    <input aria-label="service" value={props.selectedService} onChange={(event) => props.onServiceChange(event.target.value)} />
    <input aria-label="category" value={props.selectedCategory} onChange={(event) => props.onCategoryChange(event.target.value)} />
    <input aria-label="profession" value={props.selectedProfession} onChange={(event) => props.onProfessionChange(event.target.value)} />
    <input aria-label="barber type" value={props.selectedBarberType} onChange={(event) => props.onBarberTypeChange(event.target.value)} />
    <input aria-label="min price" value={props.priceRange.min} onChange={(event) => props.onPriceRangeChange("min", event.target.value)} />
    <input aria-label="max price" value={props.priceRange.max} onChange={(event) => props.onPriceRangeChange("max", event.target.value)} />
    <input aria-label="rating" value={props.rating} onChange={(event) => props.onRatingChange(event.target.value)} />
    <button onClick={() => props.onDiscountFilterChange("discount")}>discount</button>
  </div>,
}));
vi.mock("@/client/components/barbers/BarbersGrid", () => ({
  default: ({ barbers = [] }) => <div data-testid="barbers">{barbers.map((barber) => <span data-testid={`barber-${barber.id}`} key={barber.id}>{barber.name}</span>)}</div>,
}));

const summary = (barbers) => ({ barbers, services: [], reviewStats: [], availability: barbers.map((barber) => ({ barberId: barber.id, firstAvailableSlot: barber.slot || null })) });
const barber = (id, name, slot) => ({ id, name, role: "barber", city: "Yerevan", slot });
const deferred = () => {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

function renderPage() {
  return renderWithProviders(<BarbersPage />, { initialEntries: ["/specialists"], preloadedState: { auth: { currentUser: { id: "client-1", role: "client" }, isAuthenticated: true, token: "token" } } });
}

function summaryCalls() {
  return api.get.mock.calls.filter(([url]) => url === "/barbers/card-summary");
}

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.delete.mockReset();
  api.get.mockImplementation((url) => url === "/favorites" ? Promise.resolve({ data: [] }) : Promise.resolve({ data: summary([]) }));
});

describe("BarbersPage paginated browse", () => {
  it("requests page one with global filters and resets to page one when filters change", async () => {
    api.get.mockImplementation((url) => url === "/favorites" ? Promise.resolve({ data: [] }) : Promise.resolve({ data: summary([barber("first", "First")]) }));
    renderPage();
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "Ann" } });
    fireEvent.change(screen.getByLabelText("city"), { target: { value: "Yerevan" } });
    fireEvent.change(screen.getByLabelText("service"), { target: { value: "Cut" } });
    fireEvent.change(screen.getByLabelText("category"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("profession"), { target: { value: "barber" } });
    fireEvent.change(screen.getByLabelText("barber type"), { target: { value: "unisex" } });
    fireEvent.change(screen.getByLabelText("min price"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("max price"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("rating"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "discount" }));
    await waitFor(() => expect(summaryCalls().at(-1)[1].params).toMatchObject({ page: 1, limit: 24, name: "Ann", city: "Yerevan", serviceName: "Cut", category: "other", minPrice: "10", maxPrice: "20", rating: "4", discountOnly: "true", profession: "barber", barberType: "unisex" }));
  });

  it("appends short pages without duplicates and preserves server order instead of availability sorting", async () => {
    const firstPage = Array.from({ length: 24 }, (_, index) => barber(`p1-${index}`, `Page one ${index}`, index === 0 ? { dateKey: "2027-01-01", time: "20:00" } : null));
    const secondPage = [barber("p1-0", "Duplicate"), barber("p2-1", "Later", { dateKey: "2027-01-01", time: "08:00" })];
    let page = 0;
    api.get.mockImplementation((url) => {
      if (url === "/favorites") return Promise.resolve({ data: [] });
      page += 1;
      return Promise.resolve({ data: summary(page === 1 ? firstPage : secondPage) });
    });
    renderPage();
    await screen.findByText("Page one 0");
    expect(screen.getByTestId("barbers").firstChild).toHaveTextContent("Page one 0");
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText("Later");
    expect(screen.getAllByTestId("barber-p1-0")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("ignores stale filter responses", async () => {
    const initial = deferred(); const oldRequest = deferred(); const newRequest = deferred();
    api.get.mockImplementation((url, config) => {
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (!config.params.name) return initial.promise;
      return config.params.name === "old" ? oldRequest.promise : newRequest.promise;
    });
    renderPage();
    initial.resolve({ data: summary([barber("initial", "Initial")]) });
    await screen.findByText("Initial");
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "old" } });
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "new" } });
    newRequest.resolve({ data: summary([barber("new", "New result")]) });
    await screen.findByText("New result");
    oldRequest.resolve({ data: summary([barber("old", "Old result")]) });
    await waitFor(() => expect(screen.queryByText("Old result")).not.toBeInTheDocument());
  });
});
