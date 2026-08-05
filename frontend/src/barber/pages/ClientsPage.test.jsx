import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
    loyalty: {
      isVip: true,
      internalNote: "Private note",
      updatedAt: "2026-08-04T00:00:00.000Z",
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

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((outerResolve, outerReject) => {
    resolve = outerResolve;
    reject = outerReject;
  });

  return { promise, resolve, reject };
};

const clientDeferredQueue = [];
const loyaltyDeferredQueue = [];

function mockApi({
  clients = clientsResponse,
  loyaltySettings = loyaltySettingsResponse,
} = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === "/barbers/me/clients") {
      return Promise.resolve({ data: clients });
    }

    if (url === "/barbers/me/loyalty-discount-settings") {
      return Promise.resolve({ data: loyaltySettings });
    }

    return Promise.resolve({ data: [] });
  });

  vi.mocked(api.patch).mockImplementation((url, payload) => {
    if (url === "/barbers/me/loyalty-discount-settings") {
      return Promise.resolve({
        data: {
          enabled: Boolean(payload.enabled),
          thresholdCompletedBookings: Number(payload.thresholdCompletedBookings),
          discountPercent: Number(payload.discountPercent),
          maxDiscountPercent: Number(payload.maxDiscountPercent),
        },
      });
    }

    if (url === `/barbers/me/clients/client-1/loyalty`) {
      return Promise.resolve({
        data: {
          loyalty: {
            isVip: Boolean(payload.isVip),
            internalNote: String(payload.internalNote || "").trim(),
            updatedAt: "2026-08-05T00:00:00.000Z",
          },
        },
      });
    }

    return Promise.resolve({ data: {} });
  });
}

function renderPage({ strictMode = false } = {}) {
  const page = (
    <MemoryRouter initialEntries={["/barber/clients"]}>
      <ClientsPage />
    </MemoryRouter>
  );

  return render(strictMode ? <StrictMode>{page}</StrictMode> : page);
}

describe("ClientsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientDeferredQueue.length = 0;
    loyaltyDeferredQueue.length = 0;
    mockApi();
  });

  it("keeps StrictMode requests from overwriting newer client data", async () => {
    const firstClients = createDeferred();
    const secondClients = createDeferred();
    const firstSettings = createDeferred();
    const secondSettings = createDeferred();
    clientDeferredQueue.splice(0, clientDeferredQueue.length, firstClients, secondClients);
    loyaltyDeferredQueue.splice(
      0,
      loyaltyDeferredQueue.length,
      firstSettings,
      secondSettings
    );

    vi.mocked(api.get).mockImplementation((url) => {
      if (url === "/barbers/me/clients") {
        return clientDeferredQueue.shift().promise;
      }
      if (url === "/barbers/me/loyalty-discount-settings") {
        return loyaltyDeferredQueue.shift().promise;
      }
      return Promise.resolve({ data: [] });
    });

    renderPage({ strictMode: true });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);

    secondClients.resolve({ data: clientsResponse });
    secondSettings.resolve({ data: loyaltySettingsResponse });

    await waitFor(() => {
      expect(screen.getByText("Alice Adams")).toBeInTheDocument();
      expect(screen.getByText("Bob Brown")).toBeInTheDocument();
    });

    firstClients.resolve({
      data: [
        {
          clientId: "stale-client",
          clientName: "Stale Client",
          phone: "+37400000000",
          bookingCount: 1,
          completedBookingsCount: 1,
          totalSpent: 1,
          lastBooking: null,
          nextBooking: null,
          mostBookedService: null,
        },
      ],
    });
    firstSettings.resolve({ data: loyaltySettingsResponse });

    await waitFor(() => {
      expect(screen.getByText("Alice Adams")).toBeInTheDocument();
      expect(screen.queryByText("Stale Client")).not.toBeInTheDocument();
    });
  });

  it("keeps both save flows working after the StrictMode setup cleanup setup cycle", async () => {
    renderPage({ strictMode: true });

    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /loyalty discount/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /save settings/i })).not.toBeInTheDocument();
    });

    const clientCard = screen
      .getByText("Alice Adams")
      .closest('[class*="rounded-2xl"]');
    fireEvent.click(
      within(clientCard).getByRole("button", { name: /client details/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /save loyalty/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /save loyalty/i })).not.toBeInTheDocument();
    });
  });

  it("keeps mounted successful loyalty saves updating state correctly", async () => {
    renderPage();

    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /loyalty discount/i }));
    fireEvent.change(screen.getByLabelText("Completed bookings required"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Discount percent"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Max discount percent"), {
      target: { value: "24" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /save settings/i })).not.toBeInTheDocument();
    });

    const clientCard = screen
      .getByText("Alice Adams")
      .closest('[class*="rounded-2xl"]');
    fireEvent.click(
      within(clientCard).getByRole("button", { name: /client details/i })
    );
    fireEvent.click(screen.getByLabelText("VIP client"));
    fireEvent.change(screen.getByLabelText("Internal note"), {
      target: { value: "  updated note  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save loyalty/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("updated note")).toBeInTheDocument();
      expect(screen.getByLabelText("VIP client")).not.toBeChecked();
    });
  });

  it("uses AMD formatting for total spent and filter chips with no Armenian currency copy", async () => {
    renderPage();

    expect(await screen.findByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("12,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/դրամ/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    fireEvent.change(screen.getByLabelText("Search by name or phone"), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByLabelText("Visit type"), {
      target: { value: "returning" },
    });
    fireEvent.change(screen.getByLabelText("Upcoming booking"), {
      target: { value: "has-upcoming" },
    });
    fireEvent.change(screen.getByLabelText("Last visit"), {
      target: { value: "last-30" },
    });
    fireEvent.change(screen.getByLabelText("Min total spent"), {
      target: { value: "4000" },
    });
    fireEvent.change(screen.getByLabelText("Max total spent"), {
      target: { value: "6000" },
    });

    expect(await screen.findByRole("button", { name: "Search: Alice" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Returning clients" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Has upcoming booking" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Last 30 days" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Min spent: 4,000 AMD" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Max spent: 6,000 AMD" })
    ).toBeInTheDocument();
    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(screen.queryByText("Bob Brown")).not.toBeInTheDocument();
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

    const clientCard = screen
      .getByText("Alice Adams")
      .closest('[class*="rounded-2xl"]');
    const messageButton = within(clientCard).getByRole("button", {
      name: /message/i,
    });
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

  it("keeps private internal notes inside the client drawer only", async () => {
    renderPage();

    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();
    expect(screen.queryByText("Private note")).not.toBeInTheDocument();

    const clientCard = screen
      .getByText("Alice Adams")
      .closest('[class*="rounded-2xl"]');
    fireEvent.click(
      within(clientCard).getByRole("button", { name: /client details/i })
    );

    expect(screen.getByDisplayValue("Private note")).toBeInTheDocument();
  });

  it("shows errors when loading clients fails and keeps the page responsive", async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === "/barbers/me/clients") {
        return Promise.reject({
          response: { data: { message: "Could not load clients from test." } },
        });
      }
      return Promise.resolve({ data: loyaltySettingsResponse });
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load clients from test."
    );
  });

  it("surfaces loyalty settings save failures and client loyalty save failures", async () => {
    renderPage();

    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();

    vi.mocked(api.patch).mockRejectedValueOnce({
      response: { data: { message: "Settings save failed." } },
    });

    fireEvent.click(screen.getByRole("button", { name: /loyalty discount/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Settings save failed."
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    const clientCard = screen
      .getByText("Alice Adams")
      .closest('[class*="rounded-2xl"]');
    fireEvent.click(
      within(clientCard).getByRole("button", { name: /client details/i })
    );
    vi.mocked(api.patch).mockRejectedValueOnce({
      response: { data: { message: "Client loyalty save failed." } },
    });
    fireEvent.click(screen.getByRole("button", { name: /save loyalty/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Client loyalty save failed."
    );
  });

  it("suppresses late loyalty settings save results after unmount", async () => {
    const deferred = createDeferred();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(api.patch).mockImplementation((url) => {
      if (url === "/barbers/me/loyalty-discount-settings") {
        return deferred.promise;
      }
      return Promise.resolve({ data: {} });
    });

    const { unmount } = renderPage();
    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /loyalty discount/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    unmount();

    await act(async () => {
      deferred.resolve({ data: loyaltySettingsResponse });
      await deferred.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("suppresses late loyalty settings save failures after unmount", async () => {
    const deferred = createDeferred();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(api.patch).mockImplementation((url) => {
      if (url === "/barbers/me/loyalty-discount-settings") {
        return deferred.promise;
      }
      return Promise.resolve({ data: {} });
    });

    const { unmount } = renderPage();
    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /loyalty discount/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    unmount();

    await act(async () => {
      deferred.reject({
        response: { data: { message: "Settings save failed." } },
      });
      await deferred.promise.catch(() => {});
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("suppresses late client loyalty save results after unmount", async () => {
    const deferred = createDeferred();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(api.patch).mockImplementation((url) => {
      if (url === "/barbers/me/clients/client-1/loyalty") {
        return deferred.promise;
      }
      return Promise.resolve({ data: {} });
    });

    const { unmount } = renderPage();
    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();

    const clientCard = screen
      .getByText("Alice Adams")
      .closest('[class*="rounded-2xl"]');
    fireEvent.click(
      within(clientCard).getByRole("button", { name: /client details/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /save loyalty/i }));
    unmount();

    await act(async () => {
      deferred.resolve({
        data: {
          loyalty: {
            isVip: true,
            internalNote: "unmounted note",
            updatedAt: "2026-08-05T00:00:00.000Z",
          },
        },
      });
      await deferred.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("suppresses late client loyalty save failures after unmount", async () => {
    const deferred = createDeferred();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(api.patch).mockImplementation((url) => {
      if (url === "/barbers/me/clients/client-1/loyalty") {
        return deferred.promise;
      }
      return Promise.resolve({ data: {} });
    });

    const { unmount } = renderPage();
    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();

    const clientCard = screen
      .getByText("Alice Adams")
      .closest('[class*="rounded-2xl"]');
    fireEvent.click(
      within(clientCard).getByRole("button", { name: /client details/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /save loyalty/i }));
    unmount();

    await act(async () => {
      deferred.reject({
        response: { data: { message: "Client loyalty save failed." } },
      });
      await deferred.promise.catch(() => {});
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("shows an empty state when there are no clients", async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === "/barbers/me/clients") {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: loyaltySettingsResponse });
    });

    renderPage();

    expect(await screen.findByText("No clients yet")).toBeInTheDocument();
    expect(
      screen.getByText("Clients will appear here after they book with you.")
    ).toBeInTheDocument();
  });
});
