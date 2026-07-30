import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { renderWithProviders } from "@/test/renderWithProviders";
import SalonProfilePage from "./SalonProfilePage";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/client/components/salons/SalonProfileHero", () => ({
  default: ({ isSalonFavorited, onToggleFavorite, salon }) => (
    <div>
      <h1>{salon?.name}</h1>
      <div data-testid="salon-favorite-state">{String(Boolean(isSalonFavorited))}</div>
      <button onClick={onToggleFavorite}>toggle-salon-favorite</button>
    </div>
  ),
}));

vi.mock("@/client/components/salons/SalonSpecialistsSection", () => ({
  default: ({ favorites, onToggleFavorite, specialists }) => (
    <div data-testid="specialists">
      {specialists.map((item) => (
        <div key={item._id || item.id}>
          <span>{item.name}</span>
          <span data-testid={`favorite-state-${item._id || item.id}`}>
            {String(
              favorites.some(
                (favorite) =>
                  String(favorite?.barberId) === String(item._id || item.id)
              )
            )}
          </span>
          <button onClick={() => onToggleFavorite(item)}>
            toggle-{item._id || item.id}
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/features/jobs/components/SalonOpenJobs", () => ({
  default: ({ jobs, isLoading }) => (
    <div data-testid="jobs">
      {isLoading ? "loading" : jobs.map((item) => item.title).join(",")}
    </div>
  ),
}));

vi.mock("@/shared/components/SalonReviewSection", () => ({
  default: ({ averageRating, canManageCurrentSalon, salonReviews }) => (
    <div>
      <div data-testid="rating">{String(averageRating)}</div>
      <div data-testid="can-manage">{String(canManageCurrentSalon)}</div>
      <div data-testid="salon-reviews">
        {salonReviews.map((review) => review.id).join(",")}
      </div>
    </div>
  ),
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

const salonsById = {
  "salon-1": {
    _id: "salon-1",
    name: "North Studio",
    latestReviews: [{ id: "north-latest" }],
    averageRating: 4,
    barbers: [{ _id: "barber-1", name: "Ava" }],
  },
  "salon-2": {
    _id: "salon-2",
    name: "South Studio",
    latestReviews: [{ id: "south-latest" }],
    averageRating: 5,
    barbers: [{ _id: "barber-2", name: "Mika" }],
  },
};

function NavigationHarness() {
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/salons/salon-1")}>go-salon-1</button>
      <button onClick={() => navigate("/salons/salon-2")}>go-salon-2</button>
    </div>
  );
}

function renderPage(currentUser = { id: "client-1", role: "client" }) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/salons/:salonId"
        element={
          <>
            <NavigationHarness />
            <SalonProfilePage />
          </>
        }
      />
      <Route path="/specialists" element={<div>specialists redirect</div>} />
    </Routes>,
    {
      initialEntries: ["/salons/salon-1"],
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

function createSalonResponse(id) {
  return { data: salonsById[id] };
}

function createSalonReviewsResponse(id) {
  const isNorth = id === "salon-1";
  return {
    data: {
      reviews: [{ id: isNorth ? "north-fresh" : "south-fresh" }],
      averageRating: isNorth ? 4.5 : 5,
      totalReviews: 1,
    },
  };
}

function mockSalonRequests({ fail = new Set(), perBarberFailure = false } = {}) {
  api.get.mockImplementation((url, config) => {
    if (url === "/salons/salon-1" || url === "/salons/salon-2") {
      return Promise.resolve(createSalonResponse(url.split("/").at(-1)));
    }
    if (url === "/services/barber-1") {
      if (fail.has("services")) return Promise.reject(new Error("services down"));
      return Promise.resolve({
        data: [{ id: "svc-1", barberId: "barber-1", name: "Cut", active: true }],
      });
    }
    if (url === "/reviews/barber-1") {
      if (fail.has("reviews")) return Promise.reject(new Error("reviews down"));
      return Promise.resolve({
        data: [{ id: "rev-1", barberId: "barber-1", rating: 5 }],
      });
    }
    if (url === "/services/barber-2") {
      if (perBarberFailure) return Promise.reject(new Error("one barber down"));
      return Promise.resolve({
        data: [{ id: "svc-2", barberId: "barber-2", name: "Color", active: true }],
      });
    }
    if (url === "/reviews/barber-2") {
      return Promise.resolve({
        data: [{ id: "rev-2", barberId: "barber-2", rating: 4 }],
      });
    }
    if (url === "/favorites") {
      if (fail.has("favorites")) return Promise.reject(new Error("favorites down"));
      return Promise.resolve({ data: [] });
    }
    if (url === "/salon-reviews/salon/salon-1") {
      if (fail.has("salonReviews")) {
        return Promise.reject(new Error("salon reviews down"));
      }
      return Promise.resolve(createSalonReviewsResponse("salon-1"));
    }
    if (url === "/salon-reviews/salon/salon-2") {
      if (fail.has("salonReviews")) {
        return Promise.reject(new Error("salon reviews down"));
      }
      return Promise.resolve(createSalonReviewsResponse("salon-2"));
    }
    if (url === "/salons/mine/manageable") {
      if (fail.has("manageable")) return Promise.reject(new Error("manageable down"));
      return Promise.resolve({ data: { salons: [salonsById["salon-1"]] } });
    }
    if (url === "/salon-jobs") {
      const requestedSalonId = config?.params?.salonId;
      if (fail.has("jobs")) return Promise.reject(new Error("jobs down"));
      return Promise.resolve({
        data: {
          jobs: [
            {
              id: `${requestedSalonId}-job`,
              title:
                requestedSalonId === "salon-1"
                  ? "North chair"
                  : "South chair",
            },
          ],
        },
      });
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

describe("SalonProfilePage optional enrichment failures", () => {
  it.each(["services", "reviews", "favorites", "salonReviews", "manageable", "jobs"])(
    "keeps the salon visible when optional %s fails",
    async (failure) => {
      mockSalonRequests({ fail: new Set([failure]) });

      renderPage({ id: "barber-owner", role: "barber" });

      expect(await screen.findByText("North Studio")).toBeVisible();
      expect(screen.queryByText(/Could not load salon/i)).not.toBeInTheDocument();
    }
  );

  it("keeps successful enrichment for other salon barbers when one barber request fails", async () => {
    mockSalonRequests({ perBarberFailure: true });

    const { store } = renderPage();

    expect(await screen.findByText("North Studio")).toBeVisible();
    await waitFor(() =>
      expect(store.getState().services.map((service) => service.name)).toEqual(["Cut"])
    );
  });

  it("updates existing local and Redux state for successful optional responses", async () => {
    mockSalonRequests();

    const { store } = renderPage({ id: "barber-owner", role: "barber" });

    expect(await screen.findByText("North Studio")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("jobs")).toHaveTextContent("North chair")
    );
    expect(screen.getByTestId("rating")).toHaveTextContent("4.5");
    expect(store.getState().services).toHaveLength(1);
    expect(store.getState().reviews).toHaveLength(1);
  });

  it("hides prior salon, reviews, and jobs immediately after a route change", async () => {
    const salon2Core = deferred();
    const salon2Reviews = deferred();
    const salon2Jobs = deferred();

    api.get.mockImplementation((url, config) => {
      if (url === "/salons/salon-1") {
        return Promise.resolve(createSalonResponse("salon-1"));
      }
      if (url === "/salons/salon-2") {
        return salon2Core.promise;
      }
      if (url === "/services/barber-1") {
        return Promise.resolve({ data: [{ id: "svc-1", barberId: "barber-1", name: "Cut", active: true }] });
      }
      if (url === "/reviews/barber-1") {
        return Promise.resolve({ data: [{ id: "rev-1", barberId: "barber-1", rating: 5 }] });
      }
      if (url === "/services/barber-2") {
        return Promise.resolve({ data: [{ id: "svc-2", barberId: "barber-2", name: "Color", active: true }] });
      }
      if (url === "/reviews/barber-2") {
        return Promise.resolve({ data: [{ id: "rev-2", barberId: "barber-2", rating: 4 }] });
      }
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (url === "/salon-reviews/salon/salon-1") {
        return Promise.resolve(createSalonReviewsResponse("salon-1"));
      }
      if (url === "/salon-reviews/salon/salon-2") return salon2Reviews.promise;
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [salonsById["salon-1"]] } });
      }
      if (url === "/salon-jobs" && config?.params?.salonId === "salon-1") {
        return Promise.resolve({
          data: { jobs: [{ id: "salon-1-job", title: "North chair" }] },
        });
      }
      if (url === "/salon-jobs" && config?.params?.salonId === "salon-2") {
        return salon2Jobs.promise;
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    expect(await screen.findByText("North Studio")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("jobs")).toHaveTextContent("North chair")
    );

    fireEvent.click(screen.getByText("go-salon-2"));

    expect(screen.queryByText("North Studio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("salon-reviews")).not.toBeInTheDocument();
    expect(screen.queryByTestId("jobs")).not.toBeInTheDocument();

    await act(async () => {
      salon2Core.resolve(createSalonResponse("salon-2"));
    });
    await act(async () => {
      salon2Reviews.resolve(createSalonReviewsResponse("salon-2"));
      salon2Jobs.resolve({
        data: { jobs: [{ id: "salon-2-job", title: "South chair" }] },
      });
    });

    expect(await screen.findByText("South Studio")).toBeVisible();
    expect(screen.getByTestId("salon-reviews")).toHaveTextContent("south-fresh");
    expect(screen.getByTestId("jobs")).toHaveTextContent("South chair");
  });

  it("ignores stale previous-route success, failure, and finally updates", async () => {
    const salon1Core = deferred();
    const salon2Core = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/salons/salon-1") return salon1Core.promise;
      if (url === "/salons/salon-2") return salon2Core.promise;
      if (url.startsWith("/services/")) return Promise.resolve({ data: [] });
      if (url.startsWith("/reviews/")) return Promise.resolve({ data: [] });
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (url.startsWith("/salon-reviews/")) {
        return Promise.resolve({ data: { reviews: [], averageRating: 0, totalReviews: 0 } });
      }
      if (url === "/salon-jobs") return Promise.resolve({ data: { jobs: [] } });
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    fireEvent.click(await screen.findByText("go-salon-2"));
    expect(screen.queryByText(/Could not load salon/i)).not.toBeInTheDocument();

    await act(async () => {
      salon1Core.reject({
        response: { data: { message: "North failed" } },
      });
    });

    await flush();
    expect(screen.queryByText("North failed")).not.toBeInTheDocument();
    expect(screen.queryByText("North Studio")).not.toBeInTheDocument();

    await act(async () => {
      salon2Core.resolve(createSalonResponse("salon-2"));
    });

    expect(await screen.findByText("South Studio")).toBeVisible();
    expect(screen.queryByText("North failed")).not.toBeInTheDocument();
  });

  it("clears prior jobs when a new route job request fails", async () => {
    const salon2Jobs = deferred();

    api.get.mockImplementation((url, config) => {
      if (url === "/salons/salon-1" || url === "/salons/salon-2") {
        return Promise.resolve(createSalonResponse(url.split("/").at(-1)));
      }
      if (url.startsWith("/services/")) return Promise.resolve({ data: [] });
      if (url.startsWith("/reviews/")) return Promise.resolve({ data: [] });
      if (url === "/favorites") return Promise.resolve({ data: [] });
      if (url === "/salon-reviews/salon/salon-1") {
        return Promise.resolve(createSalonReviewsResponse("salon-1"));
      }
      if (url === "/salon-reviews/salon/salon-2") {
        return Promise.resolve(createSalonReviewsResponse("salon-2"));
      }
      if (url === "/salons/mine/manageable") {
        return Promise.resolve({ data: { salons: [] } });
      }
      if (url === "/salon-jobs" && config?.params?.salonId === "salon-1") {
        return Promise.resolve({
          data: { jobs: [{ id: "salon-1-job", title: "North chair" }] },
        });
      }
      if (url === "/salon-jobs" && config?.params?.salonId === "salon-2") {
        return salon2Jobs.promise;
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderPage();

    expect(await screen.findByText("North Studio")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("jobs")).toHaveTextContent("North chair")
    );

    fireEvent.click(screen.getByText("go-salon-2"));
    expect(await screen.findByText("South Studio")).toBeVisible();
    expect(screen.getByTestId("jobs")).toHaveTextContent("loading");

    await act(async () => {
      salon2Jobs.reject(new Error("jobs down"));
    });

    await waitFor(() => expect(screen.getByTestId("jobs")).toHaveTextContent(""));
    expect(screen.queryByText("North chair")).not.toBeInTheDocument();
    expect(screen.getByText("South Studio")).toBeVisible();
  });

  it("treats a genuine core salon failure as fatal", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/salons/salon-1") {
        return Promise.reject({
          response: { data: { message: "Salon unavailable" } },
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText("Salon unavailable")).toBeVisible();
    expect(screen.queryByText("specialists redirect")).not.toBeInTheDocument();
  });

  it("salon A favorite failure after navigation to salon B does not show an error", async () => {
    const favoriteRequest = deferred();
    mockSalonRequests();
    api.post.mockImplementation((url) => {
      if (url === "/favorites/salons/salon-1") return favoriteRequest.promise;
      throw new Error(`Unexpected POST ${url}`);
    });

    renderPage();

    expect(await screen.findByText("North Studio")).toBeVisible();

    fireEvent.click(screen.getByText("toggle-salon-favorite"));
    fireEvent.click(screen.getByText("go-salon-2"));
    expect(await screen.findByText("South Studio")).toBeVisible();

    await act(async () => {
      favoriteRequest.reject(new Error("favorite failed"));
      await Promise.resolve();
    });

    expect(screen.queryByText(/Could not update salon favorite/i)).not.toBeInTheDocument();
  });

  it("stale specialist favorite success does not mutate the new salon route state", async () => {
    const favoriteRequest = deferred();
    mockSalonRequests();
    api.post.mockImplementation((url, body) => {
      if (url === "/favorites" && body?.barberId === "barber-1") {
        return favoriteRequest.promise;
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    const { store } = renderPage();

    expect(await screen.findByText("North Studio")).toBeVisible();

    fireEvent.click(screen.getByText("toggle-barber-1"));
    fireEvent.click(screen.getByText("go-salon-2"));
    expect(await screen.findByText("South Studio")).toBeVisible();

    await act(async () => {
      favoriteRequest.resolve({
        data: { id: "fav-1", clientId: "client-1", barberId: "barber-1" },
      });
      await Promise.resolve();
    });

    expect(store.getState().favorites).toEqual([]);
    expect(screen.getByTestId("favorite-state-barber-2")).toHaveTextContent("false");
  });

  it("current-route favorite success and failure still behave normally", async () => {
    mockSalonRequests();
    api.post
      .mockResolvedValueOnce({
        data: { id: "fav-1", clientId: "client-1", barberId: "barber-1" },
      })
      .mockRejectedValueOnce({
        response: { data: { message: "favorite failed" } },
      });

    const { store } = renderPage();

    expect(await screen.findByText("North Studio")).toBeVisible();

    fireEvent.click(screen.getByText("toggle-barber-1"));
    await waitFor(() =>
      expect(store.getState().favorites).toEqual([
        expect.objectContaining({
          id: "fav-1",
          clientId: "client-1",
          barberId: "barber-1",
        }),
      ])
    );

    fireEvent.click(screen.getByText("toggle-salon-favorite"));
    expect(await screen.findByText("favorite failed")).toBeVisible();
  });
});
