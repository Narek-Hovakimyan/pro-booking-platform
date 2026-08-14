import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("./axios", () => ({ default: { get: mocks.get } }));

import { API_BASE_URL } from "./apiConfig";
import { getMyLoyaltyProgress } from "./loyalty";

const finalUrl = (path) => `${API_BASE_URL.replace(/\/$/, "")}${path}`;

beforeEach(() => mocks.get.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("loyalty API", () => {
  it("uses the relative progress endpoint with one API prefix", async () => {
    const response = [{ programId: "program-1" }];
    mocks.get.mockResolvedValue({ data: response });

    await expect(getMyLoyaltyProgress()).resolves.toBe(response);
    expect(mocks.get).toHaveBeenCalledWith("/loyalty/progress/me");
    expect(finalUrl(mocks.get.mock.calls[0][0])).toMatch(/\/api\/loyalty\/progress\/me$/);
    expect(finalUrl(mocks.get.mock.calls[0][0])).not.toContain("/api/api/");
  });

});
