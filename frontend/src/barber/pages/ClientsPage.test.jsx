import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClientsPage from "./ClientsPage";
import api from "@/shared/api/axios";
import { formatDateLabel, parseDateKey } from "@/shared/utils/dates";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => routerMocks.navigate,
  };
});

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("@/shared/components/common/Drawer", () => ({
  default: ({ isOpen, title, children, footer }) =>
    isOpen ? (
      <section aria-label={title}>
        <h2>{title}</h2>
        {children}
        {footer}
      </section>
    ) : null,
}));

const clientsResponse = [
  {
    clientId: "client-1",
    clientName: "Alice Adams",
    phone: "+37499111222",
    bookingCount: 3,
    completedBookingsCount: 2,
    totalSpent: 5000,
    lastBooking: {
      date: "2026-08-01",
      time: "10:00",
      serviceName: "Haircut",
    },
    nextBooking: {
      date: "2026-08-05",
      time: "13:30",
      serviceName: "Color",
    },
    mostBookedService: {
      serviceName: "Haircut",
      count: 2,
    },
  },
  {
    clientId: "client-2",
    clientName: "Bob Brown",
    phone: "+37444111222",
    bookingCount: 1,
    completedBookingsCount: 1,
    totalSpent: 12000,
    lastBooking: {
      date: "bad-date",
      time: "09:15",
      serviceName: "Beard trim",
    },
    nextBooking: null,
    mostBookedService: null,
  },
];

const loyaltySettingsResponse = {
  enabled: true,
  thresholdCompletedBookings: 5,
  discountPercent: 10,
  maxDiscountPercent: 30,
};

function mockApi() {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === "/barbers/me/clients") {
      return Promise.resolve({ data: clientsResponse });
    }
    if (url === "/barbers/me/loyalty-discount-settings") {
      return Promise.resolve({ data: loyaltySettingsResponse });
    }
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/barber/clients"]}>
      <ClientsPage />
    </MemoryRouter>
  );
}

describe("ClientsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it("uses AMD formatting for total spent and filter chips with no Armenian currency copy", async () => {
    renderPage();

    expect(await screen.findByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("12,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/դրամ/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    fireEvent.change(screen.getByLabelText("Min total spent"), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText("Max total spent"), {
      target: { value: "12000" },
    });

    expect(await screen.findByText("Min spent: 5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("Max spent: 12,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/դրամ/u)).not.toBeInTheDocument();
  });

  it("renders readable booking dates, preserves time and service, and keeps None for missing bookings", async () => {
    renderPage();

    const lastVisitLabel = `${formatDateLabel(parseDateKey("2026-08-01"))} · 10:00 · Haircut`;
    const nextBookingLabel = `${formatDateLabel(parseDateKey("2026-08-05"))} · 13:30 · Color`;

    expect(await screen.findByText(lastVisitLabel)).toBeInTheDocument();
    expect(screen.getByText(nextBookingLabel)).toBeInTheDocument();
    expect(screen.getByText("— · 09:15 · Beard trim")).toBeInTheDocument();
    expect(screen.getAllByText("None").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("2026-08-01")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-08-05")).not.toBeInTheDocument();
    expect(screen.queryByText("bad-date")).not.toBeInTheDocument();
  });

  it("keeps filtering and message navigation functional", async () => {
    renderPage();

    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.change(screen.getByLabelText("Search by name or phone"), {
      target: { value: "Alice" },
    });

    await waitFor(() => {
      expect(screen.getByText("Alice Adams")).toBeInTheDocument();
      expect(screen.queryByText("Bob Brown")).not.toBeInTheDocument();
    });

    const clientCard = screen.getByText("Alice Adams").closest('[class*="rounded-2xl"]');
    const messageButton = within(clientCard).getByRole("button", { name: /message/i });
    fireEvent.click(messageButton);

    expect(routerMocks.navigate).toHaveBeenCalledWith("/messages/client-1", {
      state: {
        user: {
          id: "client-1",
          name: "Alice Adams",
          phone: "+37499111222",
          role: "client",
        },
      },
    });
  });
});
