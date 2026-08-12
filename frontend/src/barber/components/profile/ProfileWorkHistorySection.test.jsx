import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import ProfileWorkHistorySection from "./ProfileWorkHistorySection";

const entry = (_id, salonName, endDate, overrides = {}) => ({
  _id,
  salonName,
  startDate: "2024-01-01",
  endDate,
  isCurrent: false,
  ...overrides,
});

const getRow = (label) => screen.getByText(label).closest(".flex.items-center");
const hasDuplicateKeyWarning = (consoleError) =>
  consoleError.mock.calls.some(([message]) => {
    const text = String(message);

    return text.includes("same key") || text.includes("unique \"key\"");
  });

describe("ProfileWorkHistorySection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("keeps each work-history row associated with its stable entry when sorting changes", () => {
    const first = entry("history-a", "Salon A", "2024-02-01");
    const second = entry("history-b", "Salon B", "2024-01-01");
    const { rerender } = render(
      <ProfileWorkHistorySection currentUser={{ workHistory: [first, second] }} />
    );
    const salonARow = getRow("Salon A");

    rerender(
      <ProfileWorkHistorySection
        currentUser={{ workHistory: [{ ...first, endDate: "2023-12-01" }, second] }}
      />
    );

    expect(getRow("Salon A")).toBe(salonARow);
  });

  test("keeps legacy rows without ids associated with the same DOM node when sorting changes", () => {
    const first = entry(undefined, "Legacy Salon A", "2024-02-01");
    const second = entry(undefined, "Legacy Salon B", "2024-01-01");
    const { rerender } = render(
      <ProfileWorkHistorySection currentUser={{ workHistory: [first, second] }} />
    );
    const legacyRow = getRow("Legacy Salon A");

    rerender(
      <ProfileWorkHistorySection
        currentUser={{
          workHistory: [{ ...first, endDate: "2023-12-01" }, second],
        }}
      />
    );

    expect(getRow("Legacy Salon A")).toBe(legacyRow);
  });

  test("avoids duplicate key warnings for legacy rows without ids, even when data collides", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ProfileWorkHistorySection
        currentUser={{
          workHistory: [
            entry(undefined, "Legacy Salon", "2024-01-01"),
            entry(undefined, "Legacy Salon", "2024-01-01"),
            entry(undefined, "Legacy Salon", "2024-01-01"),
          ],
        }}
      />
    );

    expect(hasDuplicateKeyWarning(consoleError)).toBe(false);
  });

  test("disambiguates duplicate explicit ids without reusing row identity", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const first = entry("duplicate-id", "Salon A", "2024-02-01");
    const second = entry("duplicate-id", "Salon B", "2024-01-01");
    const { rerender } = render(
      <ProfileWorkHistorySection currentUser={{ workHistory: [first, second] }} />
    );
    const salonARow = getRow("Salon A");

    rerender(
      <ProfileWorkHistorySection
        currentUser={{ workHistory: [{ ...first, endDate: "2023-12-01" }, second] }}
      />
    );

    expect(hasDuplicateKeyWarning(consoleError)).toBe(false);
    expect(getRow("Salon A")).toBe(salonARow);
  });

  test("shows the empty state for truthy non-array workHistory values", () => {
    expect(() =>
      render(
        <ProfileWorkHistorySection
          currentUser={{ workHistory: { unexpected: true } }}
          savedProfile={{ workHistory: [entry("history-a", "Salon A", "2024-02-01")] }}
        />
      )
    ).not.toThrow();

    expect(screen.getByText("No work history yet")).toBeInTheDocument();
    expect(screen.queryByText("Salon A")).not.toBeInTheDocument();
  });

  test("shows the empty state for null and undefined workHistory values", () => {
    const { rerender } = render(
      <ProfileWorkHistorySection currentUser={{ workHistory: null }} />
    );

    expect(screen.getByText("No work history yet")).toBeInTheDocument();

    rerender(<ProfileWorkHistorySection savedProfile={{ workHistory: undefined }} />);

    expect(screen.getByText("No work history yet")).toBeInTheDocument();
  });

  test("never coerces hostile ids and still preserves legacy row identity after sorting changes", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const hostileId = {
      toString: vi.fn(() => {
        throw new Error("should not coerce id");
      }),
      valueOf: vi.fn(() => {
        throw new Error("should not coerce id");
      }),
      [Symbol.toPrimitive]: vi.fn(() => {
        throw new Error("should not coerce id");
      }),
    };
    const first = entry(hostileId, "Legacy Salon A", "2024-02-01");
    const second = entry(undefined, "Legacy Salon B", "2024-01-01");
    const { rerender } = render(
      <ProfileWorkHistorySection currentUser={{ workHistory: [first, second] }} />
    );
    const legacyRow = getRow("Legacy Salon A");

    rerender(
      <ProfileWorkHistorySection
        currentUser={{
          workHistory: [{ ...first, endDate: "2023-12-01" }, second],
        }}
      />
    );

    expect(hostileId.toString).not.toHaveBeenCalled();
    expect(hostileId.valueOf).not.toHaveBeenCalled();
    expect(hostileId[Symbol.toPrimitive]).not.toHaveBeenCalled();
    expect(hasDuplicateKeyWarning(consoleError)).toBe(false);
    expect(getRow("Legacy Salon A")).toBe(legacyRow);
  });

  test("does not coerce object ids even when they look string-like", () => {
    const pathLikeId = {
      toString: vi.fn(() => "../work-history"),
      valueOf: vi.fn(() => "../work-history"),
    };

    render(
      <ProfileWorkHistorySection
        currentUser={{
          workHistory: [
            entry(pathLikeId, "Legacy Salon A", "2024-02-01"),
            entry(undefined, "Legacy Salon B", "2024-01-01"),
          ],
        }}
      />
    );

    expect(pathLikeId.toString).not.toHaveBeenCalled();
    expect(pathLikeId.valueOf).not.toHaveBeenCalled();
  });
});
