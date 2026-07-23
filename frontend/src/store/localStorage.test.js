import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { clearLegacyReduxState } from "./localStorage";

const STORAGE_KEY = "hairbook-redux-state";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("clearLegacyReduxState", () => {
  test("removes only the exact legacy Redux key", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "old" } }));
    localStorage.setItem("hairbook-language", "hy");
    localStorage.setItem("theme", "dark");

    expect(clearLegacyReduxState()).toBe(true);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("hairbook-language")).toBe("hy");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  test("is safe to repeat", () => {
    localStorage.setItem(STORAGE_KEY, "old-state");

    expect(clearLegacyReduxState()).toBe(true);
    expect(clearLegacyReduxState()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("storage exceptions warn generically and remain non-fatal", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const removeSpy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("blocked old-state token");
      });

    expect(clearLegacyReduxState()).toBe(false);

    expect(removeSpy).toHaveBeenCalledWith(STORAGE_KEY);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("Could not clear legacy app state.");
  });
});
