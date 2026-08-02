import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FavoritesPage from "./FavoritesPage";
import api from "@/shared/api/axios";
import { formatCurrency } from "@/platform/utils/billingFormatters";
import { removeFavorite, removeSalonFavorite } from "@/store/slices/favoritesSlice";
import { updateCurrentUser } from "@/store/slices/authSlice";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  dispatch: vi.fn(),
}));

const state = vi.hoisted(() => ({
  currentUser: { id: "client-1" },
  users: [],
  services: [],
  reviews: [],
  favorites: [],
  bookings: [],
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => routerMocks.navigate,
  };
});

vi.mock("react-redux", () => ({
  useDispatch: () => routerMocks.dispatch,
  useSelector: (selector) =>
    selector({
      auth: { currentUser: state.currentUser },
      users: state.users,
      services: state.services,
      reviews: state.reviews,
      favorites: state.favorites,
      bookings: state.bookings,
    }),
}));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/store/slices/bookingsSlice", () => ({
  fetchClientBookings: vi.fn(() => ({ type: "fetchClientBookings" })),
}));

const activeService = {
  barberId: "barber-1",
  active: true,
  id: "service-1",
  name: "Haircut",
  duration: 30,
  price: 1000,
};

function mockApi({ favorites = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === "/favorites") {
      return Promise.resolve({ data: favorites });
    }
    if (url === "/favorites/salons") {
      return Promise.resolve({ data: [] });
    }
    if (url === "/barbers/card-summary") {
      return Promise.resolve({
        data: {
          barbers: [],
          services: [activeService],
          reviewStats: [],
          availability: [],
        },
      });
    }
    return Promise.resolve({ data: [] });
  });
}

function renderFavorites() {
  return render(
    <MemoryRouter initialEntries={["/favorites"]}>
      <FavoritesPage />
    </MemoryRouter>
  );
}

function mockFavoritesApi({ favorites = [], salonFavorites = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === "/favorites") {
      return Promise.resolve({ data: favorites });
    }
    if (url === "/favorites/salons") {
      return Promise.resolve({ data: salonFavorites });
    }
    if (url === "/barbers/card-summary") {
      return Promise.resolve({
        data: {
          barbers: [],
          services: [activeService],
          reviewStats: [],
          availability: [],
        },
      });
    }
    return Promise.resolve({ data: [] });
  });
}

function favoriteWithSalons(salons) {
  return {
    clientId: "client-1",
    barberId: "barber-1",
    barber: { id: "barber-1", name: "Anna", salons },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("FavoritesPage salon-context navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.favorites = [];
    state.bookings = [];
    state.currentUser = { id: "client-1" };
  });

  it("scopes a single-salon favorite booking to that salon", async () => {
    const favorite = favoriteWithSalons([
      { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
    ]);
    state.favorites = [favorite];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Book appointment" })
      ).toHaveAttribute("href", "/booking/barber-1?salonId=salon-1")
    );
  });

  it("does not auto-scope favorites with multiple salons", async () => {
    const favorite = favoriteWithSalons([
      { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
      { status: "approved", salon: { id: "salon-2", name: "Salon Two" } },
    ]);
    state.favorites = [favorite];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Book appointment" })
      ).toHaveAttribute("href", "/booking/barber-1")
    );
  });

  it("keeps independent favorites on unscoped booking", async () => {
    const favorite = favoriteWithSalons([]);
    state.favorites = [favorite];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Book appointment" })
      ).toHaveAttribute("href", "/booking/barber-1")
    );
  });

  it("rebook preserves the booking salonId in the query", async () => {
    const favorite = favoriteWithSalons([]);
    const completedBooking = {
      clientId: "client-1",
      barberId: "barber-1",
      status: "completed",
      bookingDate: "2020-01-01",
      time: "10:00",
      salonId: "salon-9",
      service: { id: "service-9" },
      serviceId: "service-9",
    };
    state.favorites = [favorite];
    state.bookings = [completedBooking];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    const bookAgain = await screen.findByRole("button", { name: "Book again" });
    fireEvent.click(bookAgain);

    expect(routerMocks.navigate).toHaveBeenCalledWith(
      "/booking/barber-1?salonId=salon-9",
      expect.objectContaining({
        state: expect.objectContaining({
          rebook: true,
          selectedSalonId: "salon-9",
        }),
      })
    );
  });

  it("shows the English subtitle and tab counts with proper tab semantics", async () => {
    const barberFavorite = favoriteWithSalons([
      { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
    ]);
    const salonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-2",
      salon: { id: "salon-2", name: "Blue Salon", barbers: [] },
    };
    state.favorites = [barberFavorite, salonFavorite];
    mockFavoritesApi({ favorites: [barberFavorite], salonFavorites: [salonFavorite] });

    renderFavorites();

    expect(
      screen.getByText("Your saved specialists and salons, all in one place.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Specialists (1)", selected: true })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Salons (1)", selected: false })
    ).toBeInTheDocument();
    expect(await screen.findByText(formatCurrency(1000))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toBeInTheDocument();
    expect(
      screen.getByRole("tabpanel", { name: "Specialists (1)" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Salons (1)" }));

    expect(
      screen.getByRole("tab", { name: "Salons (1)", selected: true })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tabpanel", { name: "Salons (1)" })
    ).toBeInTheDocument();
  });
});

describe("FavoritesPage favorite removal protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.favorites = [];
    state.bookings = [];
  });

  it("sends one delete for duplicate specialist clicks and disables only that button", async () => {
    const firstFavorite = {
      clientId: "client-1",
      barberId: "barber-1",
      barber: { id: "barber-1", name: "Anna", salons: [] },
    };
    const secondFavorite = {
      clientId: "client-1",
      barberId: "barber-2",
      barber: { id: "barber-2", name: "Bella", salons: [] },
    };
    state.favorites = [firstFavorite, secondFavorite];
    mockApi({ favorites: [firstFavorite, secondFavorite] });

    const removal = deferred();
    vi.mocked(api.delete).mockReturnValue(removal.promise);

    renderFavorites();

    const removeButtons = await screen.findAllByRole("button", {
      name: "Remove favorite",
    });
    const targetButton = removeButtons[0];
    const otherButton = removeButtons[1];

    fireEvent.click(targetButton);
    fireEvent.click(targetButton);

    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    expect(api.delete).toHaveBeenCalledWith("/favorites/barber-1");
    expect(targetButton).toBeDisabled();
    expect(otherButton).toBeEnabled();
    expect(screen.getByText("Anna")).toBeInTheDocument();

    removal.resolve({ data: {} });
    await waitFor(() =>
      expect(routerMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: removeFavorite.type,
          payload: { clientId: "client-1", barberId: "barber-1" },
        })
      )
    );
  });

  it("keeps specialist and salon pending states separate even when ids match", async () => {
    const sharedId = "shared-1";
    const favorite = {
      clientId: "client-1",
      barberId: sharedId,
      barber: { id: sharedId, name: "Anna", salons: [] },
    };
    const salonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: sharedId,
      salon: { id: sharedId, name: "Blue Salon", barbers: [] },
    };
    state.favorites = [favorite, salonFavorite];

    vi.mocked(api.get).mockImplementation((url) => {
      if (url === "/favorites") {
        return Promise.resolve({ data: [favorite] });
      }
      if (url === "/favorites/salons") {
        return Promise.resolve({ data: [salonFavorite] });
      }
      if (url === "/barbers/card-summary") {
        return Promise.resolve({
          data: {
            barbers: [],
            services: [activeService],
            reviewStats: [],
            availability: [],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    const removal = deferred();
    vi.mocked(api.delete).mockReturnValue(removal.promise);

    renderFavorites();

    const removeFavoriteButton = await screen.findByRole("button", {
      name: "Remove favorite",
    });
    fireEvent.click(removeFavoriteButton);

    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    expect(api.delete).toHaveBeenCalledWith("/favorites/shared-1");
    expect(removeFavoriteButton).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeSalonButton = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    expect(removeSalonButton).toBeEnabled();

    removal.resolve({ data: {} });
    await waitFor(() =>
      expect(routerMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: removeFavorite.type,
          payload: { clientId: "client-1", barberId: sharedId },
        })
      )
    );
  });

  it("restores a specialist favorite button after failure without removing the item", async () => {
    const favorite = favoriteWithSalons([]);
    state.favorites = [favorite];
    mockApi({ favorites: [favorite] });

    vi.mocked(api.delete).mockRejectedValueOnce({
      response: { data: { message: "Could not remove favorite. Please try again." } },
    });

    renderFavorites();

    const removeButton = await screen.findByRole("button", {
      name: "Remove favorite",
    });

    fireEvent.click(removeButton);

    await waitFor(() =>
      expect(
        screen.getByText("Could not remove favorite. Please try again.")
      ).toBeInTheDocument()
    );
    expect(removeButton).toBeEnabled();
    expect(screen.getByText("Anna")).toBeInTheDocument();
  });

  it("uses the existing removal actions for specialist and salon success", async () => {
    const favorite = favoriteWithSalons([]);
    const salonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };

    state.favorites = [favorite, salonFavorite];
    mockApi({ favorites: [favorite] });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });

    renderFavorites();

    const removeFavoriteButton = await screen.findByRole("button", {
      name: "Remove favorite",
    });
    fireEvent.click(removeFavoriteButton);

    await waitFor(() =>
      expect(routerMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: removeFavorite.type,
          payload: { clientId: "client-1", barberId: "barber-1" },
        })
      )
    );

    routerMocks.dispatch.mockClear();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeSalonButton = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    fireEvent.click(removeSalonButton);

    await waitFor(() =>
      expect(routerMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: removeSalonFavorite.type,
          payload: { clientId: "client-1", salonId: "salon-1" },
        })
      )
    );

  });

  it("sends one delete for duplicate salon clicks and keeps other salon buttons enabled", async () => {
    const firstSalonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    const secondSalonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-2",
      salon: { id: "salon-2", name: "Gold Salon", barbers: [] },
    };
    state.currentUser = {
      id: "client-1",
      favoriteSalons: ["salon-1", "salon-2"],
    };
    state.favorites = [firstSalonFavorite, secondSalonFavorite];
    mockFavoritesApi({ salonFavorites: [firstSalonFavorite, secondSalonFavorite] });

    const removal = deferred();
    vi.mocked(api.delete).mockReturnValue(removal.promise);

    renderFavorites();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeButtons = await screen.findAllByRole("button", {
      name: "Remove salon favorite",
    });
    const targetButton = removeButtons[0];
    const otherButton = removeButtons[1];

    fireEvent.click(targetButton);
    fireEvent.click(targetButton);
    fireEvent.click(targetButton);

    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    expect(api.delete).toHaveBeenCalledWith("/favorites/salons/salon-1");
    expect(targetButton).toBeDisabled();
    expect(otherButton).toBeEnabled();
    expect(screen.getByText("Blue Salon")).toBeInTheDocument();

    removal.resolve({ data: {} });
    await waitFor(() =>
      expect(routerMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: removeSalonFavorite.type,
          payload: { clientId: "client-1", salonId: "salon-1" },
        })
      )
    );
  });

  it("treats barber and salon entries with the same raw id as independent locks", async () => {
    const sharedId = "shared-1";
    const barberFavorite = {
      clientId: "client-1",
      barberId: sharedId,
      barber: { id: sharedId, name: "Anna", salons: [] },
    };
    const salonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: sharedId,
      salon: { id: sharedId, name: "Blue Salon", barbers: [] },
    };
    state.favorites = [barberFavorite, salonFavorite];
    mockFavoritesApi({
      favorites: [barberFavorite],
      salonFavorites: [salonFavorite],
    });

    const barberRemoval = deferred();
    const salonRemoval = deferred();
    vi.mocked(api.delete).mockImplementation((url) => {
      if (url === "/favorites/shared-1") return barberRemoval.promise;
      if (url === "/favorites/salons/shared-1") return salonRemoval.promise;
      return Promise.resolve({ data: {} });
    });

    renderFavorites();

    const removeFavoriteButton = await screen.findByRole("button", {
      name: "Remove favorite",
    });
    fireEvent.click(removeFavoriteButton);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/favorites/shared-1")
    );
    expect(removeFavoriteButton).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));
    const removeSalonButton = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    expect(removeSalonButton).toBeEnabled();

    fireEvent.click(removeSalonButton);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/favorites/salons/shared-1")
    );
    expect(api.delete).toHaveBeenCalledTimes(2);
    expect(removeSalonButton).toBeDisabled();

    barberRemoval.resolve({ data: {} });
    salonRemoval.resolve({ data: {} });
    await waitFor(() =>
      expect(routerMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: removeSalonFavorite.type,
          payload: { clientId: "client-1", salonId: sharedId },
        })
      )
    );
  });

  it("restores a salon favorite button after failure without removing the card", async () => {
    const salonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    state.favorites = [salonFavorite];
    mockFavoritesApi({ salonFavorites: [salonFavorite] });

    vi.mocked(api.delete).mockRejectedValueOnce({
      response: { data: { message: "Could not remove salon favorite. Please try again." } },
    });

    renderFavorites();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeButton = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    fireEvent.click(removeButton);

    await waitFor(() =>
      expect(
        screen.getByText("Could not remove salon favorite. Please try again.")
      ).toBeInTheDocument()
    );
    expect(removeButton).toBeEnabled();
    expect(screen.getByText("Blue Salon")).toBeInTheDocument();
  });

  it("dispatches salon removal and current-user salon update exactly once on successful salon delete", async () => {
    const salonFavorite = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    state.currentUser = {
      id: "client-1",
      favoriteSalons: ["salon-1", "salon-2"],
    };
    state.favorites = [salonFavorite];
    mockFavoritesApi({ salonFavorites: [salonFavorite] });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });

    renderFavorites();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeButton = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    fireEvent.click(removeButton);
    fireEvent.click(removeButton);

    await waitFor(() =>
      expect(routerMocks.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: removeSalonFavorite.type,
          payload: { clientId: "client-1", salonId: "salon-1" },
        })
      )
    );

    expect(
      routerMocks.dispatch.mock.calls.filter(
        ([action]) => action?.type === removeSalonFavorite.type
      )
    ).toHaveLength(1);
    expect(
      routerMocks.dispatch.mock.calls.filter(
        ([action]) => action?.type === updateCurrentUser.type
      )
    ).toEqual([
      [
        expect.objectContaining({
          type: updateCurrentUser.type,
          payload: { favoriteSalons: ["salon-2"] },
        }),
      ],
    ]);
  });

  it("ignores a stale salon success after switching accounts", async () => {
    const salonFavoriteA = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    const salonFavoriteB = {
      clientId: "client-2",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    state.currentUser = {
      id: "client-1",
      favoriteSalons: ["salon-1"],
    };
    state.favorites = [salonFavoriteA, salonFavoriteB];
    mockFavoritesApi({
      salonFavorites: [salonFavoriteA, salonFavoriteB],
    });

    const removal = deferred();
    vi.mocked(api.delete).mockReturnValue(removal.promise);

    const view = renderFavorites();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeButtonA = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    fireEvent.click(removeButtonA);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/favorites/salons/salon-1")
    );

    state.currentUser = {
      id: "client-2",
      favoriteSalons: ["salon-1", "salon-3"],
    };
    view.rerender(
      <MemoryRouter initialEntries={["/favorites"]}>
        <FavoritesPage />
      </MemoryRouter>
    );

    const removeButtonB = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    expect(removeButtonB).toBeEnabled();
    routerMocks.dispatch.mockClear();

    removal.resolve({ data: {} });

    await waitFor(() =>
      expect(routerMocks.dispatch).not.toHaveBeenCalled()
    );
    expect(
      screen.queryByText("Could not remove salon favorite. Please try again.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Blue Salon")).toBeInTheDocument();
  });

  it("ignores a stale salon failure after switching accounts", async () => {
    const salonFavoriteA = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    const salonFavoriteB = {
      clientId: "client-2",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    state.currentUser = {
      id: "client-1",
      favoriteSalons: ["salon-1"],
    };
    state.favorites = [salonFavoriteA, salonFavoriteB];
    mockFavoritesApi({
      salonFavorites: [salonFavoriteA, salonFavoriteB],
    });

    const removal = deferred();
    vi.mocked(api.delete).mockReturnValue(removal.promise);

    const view = renderFavorites();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeButtonA = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    fireEvent.click(removeButtonA);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/favorites/salons/salon-1")
    );

    state.currentUser = {
      id: "client-2",
      favoriteSalons: ["salon-1", "salon-3"],
    };
    view.rerender(
      <MemoryRouter initialEntries={["/favorites"]}>
        <FavoritesPage />
      </MemoryRouter>
    );

    const removeButtonB = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    expect(removeButtonB).toBeEnabled();
    routerMocks.dispatch.mockClear();

    removal.reject({
      response: { data: { message: "Could not remove salon favorite. Please try again." } },
    });

    await waitFor(() =>
      expect(routerMocks.dispatch).not.toHaveBeenCalled()
    );
    expect(
      screen.queryByText("Could not remove salon favorite. Please try again.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Blue Salon")).toBeInTheDocument();
  });

  it("keeps a new account free to remove the same salon id while the old request is pending", async () => {
    const salonFavoriteA = {
      clientId: "client-1",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    const salonFavoriteB = {
      clientId: "client-2",
      type: "salon",
      salonId: "salon-1",
      salon: { id: "salon-1", name: "Blue Salon", barbers: [] },
    };
    state.currentUser = {
      id: "client-1",
      favoriteSalons: ["salon-1"],
    };
    state.favorites = [salonFavoriteA, salonFavoriteB];
    mockFavoritesApi({
      salonFavorites: [salonFavoriteA, salonFavoriteB],
    });

    const firstRemoval = deferred();
    const secondRemoval = deferred();
    vi.mocked(api.delete)
      .mockReturnValueOnce(firstRemoval.promise)
      .mockReturnValueOnce(secondRemoval.promise);

    const view = renderFavorites();
    fireEvent.click(screen.getByRole("tab", { name: /Salons \(\d+\)/ }));

    const removeButtonA = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    fireEvent.click(removeButtonA);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/favorites/salons/salon-1")
    );
    expect(removeButtonA).toBeDisabled();

    state.currentUser = {
      id: "client-2",
      favoriteSalons: ["salon-1", "salon-3"],
    };
    view.rerender(
      <MemoryRouter initialEntries={["/favorites"]}>
        <FavoritesPage />
      </MemoryRouter>
    );

    const removeButtonB = await screen.findByRole("button", {
      name: "Remove salon favorite",
    });
    expect(removeButtonB).toBeEnabled();

    fireEvent.click(removeButtonB);

    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
    firstRemoval.resolve({ data: {} });
    secondRemoval.resolve({ data: {} });
  });

  it("ignores a stale specialist success after switching accounts", async () => {
    const favoriteA = {
      clientId: "client-1",
      barberId: "barber-1",
      barber: { id: "barber-1", name: "Anna", salons: [] },
    };
    const favoriteB = {
      clientId: "client-2",
      barberId: "barber-1",
      barber: { id: "barber-1", name: "Anna", salons: [] },
    };
    state.currentUser = { id: "client-1" };
    state.favorites = [favoriteA, favoriteB];
    mockApi({ favorites: [favoriteA, favoriteB] });

    const removal = deferred();
    vi.mocked(api.delete).mockReturnValue(removal.promise);

    const view = renderFavorites();

    const removeButtonA = await screen.findByRole("button", {
      name: "Remove favorite",
    });
    fireEvent.click(removeButtonA);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/favorites/barber-1")
    );

    state.currentUser = { id: "client-2" };
    view.rerender(
      <MemoryRouter initialEntries={["/favorites"]}>
        <FavoritesPage />
      </MemoryRouter>
    );

    const removeButtonB = await screen.findByRole("button", {
      name: "Remove favorite",
    });
    expect(removeButtonB).toBeEnabled();
    routerMocks.dispatch.mockClear();

    removal.resolve({ data: {} });

    await waitFor(() =>
      expect(routerMocks.dispatch).not.toHaveBeenCalled()
    );
  });
});
