import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { renderWithProviders } from "@/test/renderWithProviders";
import ClientBarberProfilePage from "./ClientBarberProfilePage";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/client/components/barber-profile/BarberProfileHero", () => ({
  default: ({ barber, isFavorite, salonRating, toggleFavorite, totalCerts }) => (
    <div>
      <h1>{barber?.name}</h1>
      <div data-testid="salon-rating">{String(salonRating)}</div>
      <div data-testid="cert-count">{totalCerts}</div>
      <div data-testid="favorite-state">{String(Boolean(isFavorite))}</div>
      <button onClick={toggleFavorite}>toggle-favorite</button>
    </div>
  ),
}));

vi.mock("@/client/components/barber-profile/BarberProfileSidebar", () => ({
  default: ({ reviewStats }) => <div data-testid="review-count">{reviewStats.count}</div>,
}));

vi.mock("@/client/components/barber-profile/BarberServicesSection", () => ({
  default: ({ barberServices }) => (
    <div data-testid="services">
      {barberServices.map((item) => item.name).join(",")}
    </div>
  ),
}));

vi.mock("@/client/components/barber-profile/BarberGallerySection", () => ({
  default: () => <div>gallery</div>,
}));

vi.mock("@/client/components/barber-profile/PortfolioSection", () => ({
  default: () => <div>portfolio</div>,
}));

vi.mock("@/client/components/barber-profile/BarberWorkHistorySection", () => ({
  default: () => <div>work history</div>,
}));

vi.mock("@/client/components/barber-profile/BarberCertificationsSection", () => ({
  default: ({ totalCerts }) => <div data-testid="cert-section">{totalCerts}</div>,
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const barbers = {
  "barber-1": {
    _id: "barber-1",
    name: "Ava Sharp",
    role: "barber",
    city: "Yerevan",
    approvedSalons: [{ _id: "salon-1", name: "North Studio", status: "approved" }],
  },
  "barber-2": {
    _id: "barber-2",
    name: "Mika Stone",
    role: "barber",
    city: "Gyumri",
    approvedSalons: [{ _id: "salon-2", name: "South Studio", status: "approved" }],
  },
};

function NavigationHarness() {
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/barbers/barber-1")}>go-barber-1</button>
      <button onClick={() => navigate("/barbers/barber-2")}>go-barber-2</button>
    </div>
  );
}

function renderPage(currentUser = { id: "client-1", role: "client" }) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/barbers/:barberId"
        element={
          <>
            <NavigationHarness />
            <ClientBarberProfilePage />
          </>
        }
      />
    </Routes>,
    {
      initialEntries: ["/barbers/barber-1"],
      preloadedState: {
        auth: {
          currentUser,
          isAuthenticated: Boolean(currentUser),
          token: currentUser ? "token" : null,
        },
      },
    }
  );
}

function createBarberListResponse() {
  return { data: [barbers["barber-1"], barbers["barber-2"]] };
}

function createProfileResponse(barberId) {
  return {
    data: {
      bio: barberId === "barber-1" ? "Precision cuts" : "Creative styling",
      galleryImages: [],
    },
  };
}

function mockProfileRequests({ fail = new Set() } = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/users/barbers") {
      if (fail.has("barbers")) return Promise.reject(new Error("barbers down"));
      return Promise.resolve(createBarberListResponse());
    }
    if (url === "/barbers/profile/barber-1" || url === "/barbers/profile/barber-2") {
      const barberId = url.split("/").at(-1);
      if (fail.has("profile")) return Promise.reject(new Error("profile down"));
      return Promise.resolve(createProfileResponse(barberId));
    }
    if (url === "/services/barber-1") {
      if (fail.has("services")) return Promise.reject(new Error("services down"));
      return Promise.resolve({
        data: [{ id: "svc-1", barberId: "barber-1", name: "Cut", active: true, price: 5000 }],
      });
    }
    if (url === "/reviews/barber-1") {
      if (fail.has("reviews")) return Promise.reject(new Error("reviews down"));
      return Promise.resolve({
        data: [{ id: "rev-1", barberId: "barber-1", rating: 5 }],
      });
    }
    if (url === "/services/barber-2") {
      if (fail.has("services")) return Promise.reject(new Error("services down"));
      return Promise.resolve({
        data: [{ id: "svc-2", barberId: "barber-2", name: "Color", active: true, price: 6000 }],
      });
    }
    if (url === "/reviews/barber-2") {
      if (fail.has("reviews")) return Promise.reject(new Error("reviews down"));
      return Promise.resolve({
        data: [{ id: "rev-2", barberId: "barber-2", rating: 4 }],
      });
    }
    if (url === "/favorites") {
      if (fail.has("favorites")) return Promise.reject(new Error("favorites down"));
      return Promise.resolve({ data: [{ id: "fav-1", clientId: "client-1", barberId: "barber-1" }] });
    }
    if (url === "/barbers/barber-1/certifications") {
      if (fail.has("certifications")) return Promise.reject(new Error("certs down"));
      return Promise.resolve({ data: [{ id: "cert-1" }] });
    }
    if (url === "/barbers/barber-1/event-certificates") {
      if (fail.has("eventCertifications")) {
        return Promise.reject(new Error("event certs down"));
      }
      return Promise.resolve({ data: [{ id: "event-cert-1" }] });
    }
    if (url === "/barbers/barber-2/certifications") {
      if (fail.has("certifications")) return Promise.reject(new Error("certs down"));
      return Promise.resolve({ data: [{ id: "cert-2" }, { id: "cert-3" }] });
    }
    if (url === "/barbers/barber-2/event-certificates") {
      if (fail.has("eventCertifications")) {
        return Promise.reject(new Error("event certs down"));
      }
      return Promise.resolve({ data: [{ id: "event-cert-2" }] });
    }
    if (url === "/salons/salon-1") {
      if (fail.has("salonRating")) return Promise.reject(new Error("salon down"));
      return Promise.resolve({ data: { averageRating: 4.5 } });
    }
    if (url === "/salons/salon-2") {
      if (fail.has("salonRating")) return Promise.reject(new Error("salon down"));
      return Promise.resolve({ data: { averageRating: 3.5 } });
    }
    throw new Error(`Unexpected GET ${url}`);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ClientBarberProfilePage optional enrichment failures", () => {
  it.each(["services", "reviews", "favorites", "certifications", "eventCertifications", "salonRating"])(
    "keeps the specialist profile visible when optional %s fails",
    async (failure) => {
      mockProfileRequests({ fail: new Set([failure]) });

      renderPage();

      expect(await screen.findByText("Ava Sharp")).toBeVisible();
      expect(screen.queryByText(/Could not load specialist profile/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Profile not found/i)).not.toBeInTheDocument();
    }
  );

  it("skips favorites for logged-out public specialist viewing", async () => {
    mockProfileRequests();

    renderPage(null);

    expect(await screen.findByText("Ava Sharp")).toBeVisible();
    expect(api.get).not.toHaveBeenCalledWith("/favorites");
  });

  it("updates Redux and local state for successful optional responses", async () => {
    mockProfileRequests();

    const { store } = renderPage();

    expect(await screen.findByText("Ava Sharp")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("salon-rating")).toHaveTextContent("4.5")
    );
    expect(screen.getByTestId("cert-count")).toHaveTextContent("2");
    expect(store.getState().services).toHaveLength(1);
    expect(store.getState().reviews).toHaveLength(1);
    expect(store.getState().favorites).toHaveLength(1);
  });

  it("hides prior certifications and rating immediately after a route change", async () => {
    const barber2List = deferred();
    const barber2Profile = deferred();
    const barber2Certs = deferred();
    const barber2EventCerts = deferred();
    const barber2Rating = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/users/barbers") return barber2List.promise;
      if (url === "/barbers/profile/barber-1") {
        return Promise.resolve(createProfileResponse("barber-1"));
      }
      if (url === "/barbers/profile/barber-2") return barber2Profile.promise;
      if (url === "/services/barber-1") return Promise.resolve({ data: [] });
      if (url === "/reviews/barber-1") return Promise.resolve({ data: [] });
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (url === "/barbers/barber-1/certifications") {
        return Promise.resolve({ data: [{ id: "cert-1" }] });
      }
      if (url === "/barbers/barber-1/event-certificates") {
        return Promise.resolve({ data: [{ id: "event-cert-1" }] });
      }
      if (url === "/barbers/barber-2/certifications") return barber2Certs.promise;
      if (url === "/barbers/barber-2/event-certificates") {
        return barber2EventCerts.promise;
      }
      if (url === "/salons/salon-1") {
        return Promise.resolve({ data: { averageRating: 4.5 } });
      }
      if (url === "/salons/salon-2") return barber2Rating.promise;
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    await act(async () => {
      barber2List.resolve(createBarberListResponse());
    });
    expect(await screen.findByText("Ava Sharp")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("cert-count")).toHaveTextContent("2")
    );

    api.get.mockImplementation((url) => {
      if (url === "/users/barbers") return barber2List.promise;
      if (url === "/barbers/profile/barber-1") {
        return Promise.resolve(createProfileResponse("barber-1"));
      }
      if (url === "/barbers/profile/barber-2") return barber2Profile.promise;
      if (url === "/services/barber-1") return Promise.resolve({ data: [] });
      if (url === "/reviews/barber-1") return Promise.resolve({ data: [] });
      if (url === "/services/barber-2") return Promise.resolve({ data: [] });
      if (url === "/reviews/barber-2") return Promise.resolve({ data: [] });
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (url === "/barbers/barber-1/certifications") {
        return Promise.resolve({ data: [{ id: "cert-1" }] });
      }
      if (url === "/barbers/barber-1/event-certificates") {
        return Promise.resolve({ data: [{ id: "event-cert-1" }] });
      }
      if (url === "/barbers/barber-2/certifications") return barber2Certs.promise;
      if (url === "/barbers/barber-2/event-certificates") {
        return barber2EventCerts.promise;
      }
      if (url === "/salons/salon-1") {
        return Promise.resolve({ data: { averageRating: 4.5 } });
      }
      if (url === "/salons/salon-2") return barber2Rating.promise;
      throw new Error(`Unexpected GET ${url}`);
    });

    fireEvent.click(screen.getByText("go-barber-2"));

    expect(screen.queryByText("Ava Sharp")).not.toBeInTheDocument();
    expect(screen.getByTestId("cert-count")).toHaveTextContent("0");
    expect(screen.getByTestId("salon-rating")).toHaveTextContent("null");

    await act(async () => {
      barber2List.resolve(createBarberListResponse());
      barber2Profile.resolve(createProfileResponse("barber-2"));
      barber2Certs.resolve({ data: [{ id: "cert-2" }, { id: "cert-3" }] });
      barber2EventCerts.resolve({ data: [{ id: "event-cert-2" }] });
      barber2Rating.resolve({ data: { averageRating: 3.5 } });
    });

    expect(await screen.findByText("Mika Stone")).toBeVisible();
    expect(screen.getByTestId("cert-count")).toHaveTextContent("3");
    expect(screen.getByTestId("salon-rating")).toHaveTextContent("3.5");
  });

  it("ignores stale previous-route success, failure, and finally updates", async () => {
    const barber1List = deferred();
    const barber1Profile = deferred();
    const barber2List = deferred();
    const barber2Profile = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/users/barbers") return barber1List.promise;
      if (url === "/barbers/profile/barber-1") return barber1Profile.promise;
      if (url === "/barbers/profile/barber-2") return barber2Profile.promise;
      if (url.startsWith("/services/")) return Promise.resolve({ data: [] });
      if (url.startsWith("/reviews/")) return Promise.resolve({ data: [] });
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (url.includes("/certifications")) return Promise.resolve({ data: [] });
      if (url.includes("/event-certificates")) return Promise.resolve({ data: [] });
      if (url.startsWith("/salons/")) return Promise.resolve({ data: { averageRating: 0 } });
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    api.get.mockImplementation((url) => {
      if (url === "/users/barbers") return barber2List.promise;
      if (url === "/barbers/profile/barber-1") return barber1Profile.promise;
      if (url === "/barbers/profile/barber-2") return barber2Profile.promise;
      if (url.startsWith("/services/")) return Promise.resolve({ data: [] });
      if (url.startsWith("/reviews/")) return Promise.resolve({ data: [] });
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (url.includes("/certifications")) return Promise.resolve({ data: [] });
      if (url.includes("/event-certificates")) return Promise.resolve({ data: [] });
      if (url.startsWith("/salons/")) return Promise.resolve({ data: { averageRating: 0 } });
      throw new Error(`Unexpected GET ${url}`);
    });

    fireEvent.click(await screen.findByText("go-barber-2"));

    await act(async () => {
      barber1List.reject(new Error("stale list failure"));
      barber1Profile.reject(new Error("stale profile failure"));
    });

    await flush();
    expect(screen.queryByText(/Could not load specialist profile/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Ava Sharp")).not.toBeInTheDocument();

    await act(async () => {
      barber2List.resolve(createBarberListResponse());
      barber2Profile.resolve(createProfileResponse("barber-2"));
    });

    expect(await screen.findByText("Mika Stone")).toBeVisible();
    expect(screen.queryByText(/Could not load specialist profile/i)).not.toBeInTheDocument();
  });

  it.each(["barbers", "profile"])(
    "renders a fatal error when core %s loading fails",
    async (failure) => {
      mockProfileRequests({ fail: new Set([failure]) });

      renderPage();

      expect(
        await screen.findByText("Could not load specialist profile. Please try again.")
      ).toBeVisible();
      expect(screen.queryByText(/Profile not found/i)).not.toBeInTheDocument();
    }
  );

  it("barber A favorite failure after navigation to barber B does not show an error", async () => {
    const favoriteRequest = deferred();
    mockProfileRequests({ fail: new Set(["favorites"]) });
    api.post.mockImplementation((url, body) => {
      if (url === "/favorites" && body?.barberId === "barber-1") {
        return favoriteRequest.promise;
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    renderPage();

    expect(await screen.findByText("Ava Sharp")).toBeVisible();

    fireEvent.click(screen.getByText("toggle-favorite"));
    fireEvent.click(screen.getByText("go-barber-2"));
    expect(await screen.findByText("Mika Stone")).toBeVisible();

    await act(async () => {
      favoriteRequest.reject(new Error("favorite failed"));
      await Promise.resolve();
    });

    expect(screen.queryByText(/Could not update favorite/i)).not.toBeInTheDocument();
  });

  it("stale favorite success does not mutate the new barber route state", async () => {
    const favoriteRequest = deferred();
    mockProfileRequests();
    api.delete.mockImplementation((url) => {
      if (url === "/favorites/barber-1") return favoriteRequest.promise;
      throw new Error(`Unexpected DELETE ${url}`);
    });

    const { store } = renderPage();

    expect(await screen.findByText("Ava Sharp")).toBeVisible();
    expect(screen.getByTestId("favorite-state")).toHaveTextContent("true");

    fireEvent.click(screen.getByText("toggle-favorite"));
    fireEvent.click(screen.getByText("go-barber-2"));
    expect(await screen.findByText("Mika Stone")).toBeVisible();

    await act(async () => {
      favoriteRequest.resolve({});
      await Promise.resolve();
    });

    expect(store.getState().favorites).toEqual([
      expect.objectContaining({
        id: "fav-1",
        clientId: "client-1",
        barberId: "barber-1",
      }),
    ]);
    expect(screen.getByTestId("favorite-state")).toHaveTextContent("false");
  });

  it("current-route favorite success and failure still behave normally", async () => {
    mockProfileRequests({ fail: new Set(["favorites"]) });
    api.post.mockResolvedValueOnce({
      data: { id: "fav-2", clientId: "client-1", barberId: "barber-1" },
    });
    api.delete.mockRejectedValueOnce({
      response: { data: { message: "favorite failed" } },
    });

    const { store } = renderPage();

    expect(await screen.findByText("Ava Sharp")).toBeVisible();
    expect(screen.getByTestId("favorite-state")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("toggle-favorite"));
    await waitFor(() =>
      expect(store.getState().favorites).toEqual([
        expect.objectContaining({
          id: "fav-2",
          clientId: "client-1",
          barberId: "barber-1",
        }),
      ])
    );

    fireEvent.click(screen.getByText("toggle-favorite"));
    expect(await screen.findByText("favorite failed")).toBeVisible();
  });
});
