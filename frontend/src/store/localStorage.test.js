import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { loadState, saveState } from "./localStorage";

const STORAGE_KEY = "hairbook-redux-state";

const completeUser = {
  id: "user-1",
  name: "Baseline Barber",
  role: "barber",
  salonId: "507f1f77bcf86cd799439011",
  salonStatus: "approved",
  salons: [{ salon: "507f1f77bcf86cd799439011", status: "approved" }],
};

function readStoredState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("loadState", () => {
  test("returns undefined when no persisted state exists", () => {
    expect(loadState()).toBeUndefined();
  });

  test("loads valid JSON, authenticates complete auth, retains users, and removes API-backed slices", () => {
    const persistedState = {
      auth: {
        currentUser: completeUser,
        token: "readable-baseline-token",
        isAuthenticated: false,
      },
      users: { users: [{ id: "client-1" }] },
      services: { items: [{ id: "service-1" }] },
      schedule: { days: ["monday"] },
      bookings: { items: [{ id: "booking-1" }] },
      reviews: { items: [{ id: "review-1" }] },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));

    expect(loadState()).toEqual({
      auth: {
        currentUser: completeUser,
        token: "readable-baseline-token",
        isAuthenticated: true,
      },
      users: persistedState.users,
    });
  });

  test.each([
    ["token without currentUser", { token: "token-only" }],
    ["currentUser without token", { currentUser: completeUser }],
    ["missing token and currentUser", { isAuthenticated: true }],
  ])("normalizes incomplete auth: %s", (_label, auth) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth, users: { byId: {} } }));

    expect(loadState()).toEqual({
      auth: {
        currentUser: null,
        token: null,
        isAuthenticated: false,
      },
      users: { byId: {} },
    });
  });

  test("leaves state without an auth slice otherwise intact except API-backed slices", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        users: { allIds: ["user-1"] },
        services: { items: ["service-1"] },
      })
    );

    expect(loadState()).toEqual({ users: { allIds: ["user-1"] } });
  });

  test("malformed JSON does not throw, returns undefined, and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, "{not-json");

    expect(loadState()).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe("Could not load saved app state.");
  });
});

describe("saveState", () => {
  test("persists only auth and users with readable baseline token/currentUser data", () => {
    const state = {
      auth: {
        currentUser: completeUser,
        token: "readable-baseline-token",
        isAuthenticated: true,
      },
      users: { users: [{ id: "client-1" }] },
      bookings: { items: [{ id: "booking-1" }] },
      services: { items: [{ id: "service-1" }] },
      schedule: { days: ["monday"] },
      reviews: { items: [{ id: "review-1" }] },
      notifications: { items: [{ id: "notice-1" }] },
      subscription: { plan: "trial" },
      unrelated: { value: true },
    };
    const originalState = structuredClone(state);

    saveState(state);

    expect(readStoredState()).toEqual({
      auth: {
        currentUser: completeUser,
        token: "readable-baseline-token",
        isAuthenticated: true,
      },
      users: { users: [{ id: "client-1" }] },
    });
    expect(readStoredState().auth.currentUser.salons).toEqual(completeUser.salons);
    expect(state).toEqual(originalState);
  });

  test("repeated save replaces the previous persisted auth and users state", () => {
    saveState({
      auth: { currentUser: completeUser, token: "first-token", isAuthenticated: true },
      users: { users: [{ id: "first-user" }] },
    });
    saveState({
      auth: {
        currentUser: { ...completeUser, id: "user-2" },
        token: "second-token",
        isAuthenticated: true,
      },
      users: { users: [{ id: "second-user" }] },
    });

    expect(readStoredState()).toEqual({
      auth: {
        currentUser: { ...completeUser, id: "user-2" },
        token: "second-token",
        isAuthenticated: true,
      },
      users: { users: [{ id: "second-user" }] },
    });
  });
});
