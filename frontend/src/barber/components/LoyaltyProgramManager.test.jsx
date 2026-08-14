import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import LoyaltyProgramManager from "./LoyaltyProgramManager";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/shared/api/axios", () => ({ default: mocks }));

const currentUser = { id: "barber-1", role: "barber" };

function renderManager() {
  return renderWithProviders(<LoyaltyProgramManager />, {
    preloadedState: {
      auth: {
        currentUser,
        token: "token",
        isAuthenticated: true,
      },
    },
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.get.mockResolvedValue({ data: [] });
  mocks.post.mockResolvedValue({
    data: { _id: "program-1", title: "Rewards", requiredVisits: 5, rewardText: "Free cut", active: true },
  });
  mocks.delete.mockResolvedValue({});
});

afterEach(() => vi.restoreAllMocks());

describe("LoyaltyProgramManager API paths", () => {
  it("loads programs through a relative single-prefix endpoint", async () => {
    renderManager();

    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledWith("/loyalty/programs/me");
    });
    expect(mocks.get.mock.calls[0][0]).not.toContain("/api/");
  });

  it("preserves create payload and deactivation method/path", async () => {
    renderManager();
    await screen.findByText("No loyalty programs created yet.");

    fireEvent.click(screen.getByRole("button", { name: "New Program" }));
    const textboxes = screen.getAllByRole("textbox");
    fireEvent.change(textboxes[0], { target: { value: "Rewards" } });
    fireEvent.change(textboxes[1], { target: { value: "Free cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Program" }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith("/loyalty/programs", {
        title: "Rewards",
        requiredVisits: 5,
        rewardText: "Free cut",
      });
    });
    expect(mocks.post.mock.calls[0][0]).not.toContain("/api/");

    await screen.findByText("Rewards");
    fireEvent.click(screen.getByTitle("Deactivate program"));
    await waitFor(() => {
      expect(mocks.delete).toHaveBeenCalledWith("/loyalty/programs/program-1");
    });
    expect(mocks.delete.mock.calls[0][0]).not.toContain("/api/");
  });
});
