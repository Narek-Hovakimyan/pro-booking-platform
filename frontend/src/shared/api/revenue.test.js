import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("./axios", () => ({ default: { get: mocks.get } }));

import { API_BASE_URL } from "./apiConfig";
import { getMyRevenue } from "./revenue";

const finalUrl = (path) => `${API_BASE_URL.replace(/\/$/, "")}${path}`;

beforeEach(() => mocks.get.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("revenue API", () => {
  it("uses one API prefix and preserves date parameters", async () => {
    const response = { totalRevenue: 1200 };
    const params = { from: "2026-08-01", to: "2026-08-31" };
    mocks.get.mockResolvedValue({ data: response });

    await expect(getMyRevenue(params)).resolves.toBe(response);
    expect(mocks.get).toHaveBeenCalledWith("/revenue/me", { params });
    expect(finalUrl(mocks.get.mock.calls[0][0])).toBe(`${API_BASE_URL}/revenue/me`);
    expect(finalUrl(mocks.get.mock.calls[0][0])).not.toContain("/api/api/");
  });

});
