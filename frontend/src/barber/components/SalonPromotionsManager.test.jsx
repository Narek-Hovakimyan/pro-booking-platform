import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SalonPromotionsManager from "./SalonPromotionsManager";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: (...args) => apiGet(...args),
    post: (...args) => apiPost(...args),
    patch: (...args) => apiPatch(...args),
  },
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function renderManager(salonId = "salon-1", salonName = "Salon One") {
  return render(<SalonPromotionsManager salonId={salonId} salonName={salonName} />);
}

function renderStrictManager(salonId = "salon-1", salonName = "Salon One") {
  return render(
    <StrictMode>
      <SalonPromotionsManager salonId={salonId} salonName={salonName} />
    </StrictMode>
  );
}

function setBaseSalonResponses({
  promotions = [],
  staff = [{ _id: "barber-1", name: "Alex Barber" }],
  services = [{ _id: "service-1", name: "Haircut" }],
} = {}) {
  apiGet.mockImplementation((url) => {
    if (url === "/salons/salon-1/promotions") {
      return Promise.resolve({ data: promotions });
    }

    if (url === "/salons/salon-1/staff") {
      return Promise.resolve({ data: staff });
    }

    if (url === "/salons/salon-1/public-booking") {
      return Promise.resolve({ data: { services } });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

afterEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SalonPromotionsManager", () => {
  it("surfaces load errors and keeps the empty state visible", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/salons/salon-1/promotions") {
        return Promise.reject(new Error("boom"));
      }

      if (url === "/salons/salon-1/staff") {
        return Promise.resolve({ data: [{ _id: "barber-1", name: "Alex Barber" }] });
      }

      if (url === "/salons/salon-1/public-booking") {
        return Promise.resolve({ data: { services: [{ _id: "service-1", name: "Haircut" }] } });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    renderManager();

    await waitFor(() =>
      expect(screen.getByText("Could not load promotions. Please try again.")).toBeInTheDocument()
    );
    expect(screen.getByText("No promotions yet")).toBeInTheDocument();
  });

  it("ignores stale salon responses when the selected salon changes", async () => {
    const stalePromotions = createDeferred();

    apiGet.mockImplementation((url) => {
      if (url === "/salons/salon-1/promotions") {
        return stalePromotions.promise;
      }

      if (url === "/salons/salon-1/staff") {
        return Promise.resolve({ data: [{ _id: "barber-1", name: "Alex Barber" }] });
      }

      if (url === "/salons/salon-1/public-booking") {
        return Promise.resolve({ data: { services: [{ _id: "service-1", name: "Haircut" }] } });
      }

      if (url === "/salons/salon-2/promotions") {
        return Promise.resolve({
          data: [
            {
              _id: "promotion-2",
              title: "Winter Special",
              code: "WINTER10",
              amount: 10,
              maxUses: 5,
              currentUses: 0,
              discountType: "fixed",
              applicableServiceIds: [],
              applicableBarberIds: [],
              active: true,
            },
          ],
        });
      }

      if (url === "/salons/salon-2/staff") {
        return Promise.resolve({ data: [{ _id: "barber-2", name: "Mia Barber" }] });
      }

      if (url === "/salons/salon-2/public-booking") {
        return Promise.resolve({ data: { services: [{ _id: "service-2", name: "Color" }] } });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const { rerender } = renderManager("salon-1", "Salon One");

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/salons/salon-1/promotions")
    );

    rerender(<SalonPromotionsManager salonId="salon-2" salonName="Salon Two" />);

    await waitFor(() => expect(screen.getByText("Winter Special")).toBeInTheDocument());

    act(() => {
      stalePromotions.resolve({
        data: [
          {
            _id: "promotion-1",
            title: "Summer Special",
            code: "SUMMER20",
            amount: 20,
            maxUses: 10,
            currentUses: 1,
            discountType: "percentage",
            applicableServiceIds: [],
            applicableBarberIds: [],
            active: true,
          },
        ],
      });
    });

    await act(async () => {
      await stalePromotions.promise;
    });

    expect(screen.getByText("Winter Special")).toBeInTheDocument();
    expect(screen.queryByText("Summer Special")).not.toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/salons/salon-2/staff");
    expect(apiGet).toHaveBeenCalledWith("/salons/salon-2/public-booking");
  });

  it("re-arms StrictMode effects so salon data loads and stale responses stay suppressed", async () => {
    const user = userEvent.setup();
    const stalePromotions = createDeferred();
    const postUnmountPromotions = createDeferred();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const requestCounts = new Map();

    apiGet.mockImplementation((url) => {
      const count = (requestCounts.get(url) || 0) + 1;
      requestCounts.set(url, count);

      if (url === "/salons/salon-1/promotions") {
        return stalePromotions.promise;
      }

      if (url === "/salons/salon-1/staff") {
        return Promise.resolve({ data: [{ _id: "barber-1", name: "Alex Barber" }] });
      }

      if (url === "/salons/salon-1/public-booking") {
        return Promise.resolve({ data: { services: [{ _id: "service-1", name: "Haircut" }] } });
      }

      if (url === "/salons/salon-2/promotions") {
        return Promise.resolve({
          data: [
            {
              _id: "promotion-2",
              title: "Winter Special",
              code: "WINTER10",
              amount: 10,
              maxUses: 5,
              currentUses: 0,
              discountType: "fixed",
              applicableServiceIds: [],
              applicableBarberIds: [],
              active: true,
            },
          ],
        });
      }

      if (url === "/salons/salon-2/staff") {
        return Promise.resolve({ data: [{ _id: "barber-2", name: "Mia Barber" }] });
      }

      if (url === "/salons/salon-2/public-booking") {
        return Promise.resolve({ data: { services: [{ _id: "service-2", name: "Color" }] } });
      }

      if (url === "/salons/salon-3/promotions") {
        return postUnmountPromotions.promise;
      }

      if (url === "/salons/salon-3/staff") {
        return Promise.resolve({ data: [{ _id: "barber-3", name: "Noah Barber" }] });
      }

      if (url === "/salons/salon-3/public-booking") {
        return Promise.resolve({ data: { services: [{ _id: "service-3", name: "Trim" }] } });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const { rerender, unmount } = renderStrictManager("salon-1", "Salon One");

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/salons/salon-1/promotions"));

    act(() => {
      stalePromotions.resolve({
        data: [
          {
            _id: "promotion-1",
            title: "Summer Special",
            code: "SUMMER20",
            amount: 20,
            maxUses: 10,
            currentUses: 1,
            discountType: "percentage",
            applicableServiceIds: [],
            applicableBarberIds: [],
            active: true,
          },
        ],
      });
    });

    await waitFor(() => expect(screen.getByText("Summer Special")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Create Promotion" }));
    await waitFor(() => expect(screen.getByLabelText("Alex Barber")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Haircut")).toBeInTheDocument());
    await user.keyboard("{Escape}");

    rerender(
      <StrictMode>
        <SalonPromotionsManager salonId="salon-2" salonName="Salon Two" />
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByText("Winter Special")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Create Promotion" }));
    await waitFor(() => expect(screen.getByLabelText("Mia Barber")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Color")).toBeInTheDocument());
    await user.keyboard("{Escape}");

    rerender(
      <StrictMode>
        <SalonPromotionsManager salonId="salon-3" salonName="Salon Three" />
      </StrictMode>
    );

    unmount();

    act(() => {
      postUnmountPromotions.resolve({
        data: [
          {
            _id: "promotion-3",
            title: "Spring Flash",
            code: "FLASH10",
            amount: 10,
            maxUses: 3,
            currentUses: 0,
            discountType: "fixed",
            applicableServiceIds: [],
            applicableBarberIds: [],
            active: true,
          },
        ],
      });
    });

    await act(async () => {
      await postUnmountPromotions.promise;
    });

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("validates, submits, and refreshes promotion data with exact payloads", async () => {
    const user = userEvent.setup();
    setBaseSalonResponses({
      promotions: [
        {
          _id: "promotion-1",
          title: "Summer Special",
          code: "SUMMER20",
          amount: 20,
          maxUses: 10,
          currentUses: 1,
          discountType: "percentage",
          applicableServiceIds: [{ _id: "service-1", name: "Haircut" }],
          applicableBarberIds: [{ _id: "barber-1", name: "Alex Barber" }],
          active: true,
          visibility: "public",
        },
      ],
    });
    apiPost.mockResolvedValue({ data: { ok: true } });
    apiPatch.mockResolvedValue({ data: { ok: true } });

    renderManager();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Promotion" })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Create Promotion" }));
    await waitFor(() => expect(screen.getByLabelText("Haircut")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Alex Barber")).toBeInTheDocument());
    await user.click(
      within(screen.getByRole("dialog", { name: "Create Promotion" })).getByRole("button", {
        name: "Create Promotion",
      })
    );
    expect(screen.getByText("Title is required.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Spring Special");
    await user.type(screen.getByLabelText("Description (optional)"), "Seasonal offer");
    await user.selectOptions(screen.getByLabelText("Discount Type"), "percentage");
    await user.clear(screen.getByLabelText("Percentage"));
    await user.type(screen.getByLabelText("Percentage"), "150");
    await user.click(
      within(screen.getByRole("dialog", { name: "Create Promotion" })).getByRole("button", {
        name: "Create Promotion",
      })
    );
    expect(screen.getByText("Percentage discount cannot exceed 100%.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Percentage"));
    await user.type(screen.getByLabelText("Percentage"), "20");
    await user.type(screen.getByLabelText("Code (leave empty to auto-generate)"), "spring25");
    await user.type(screen.getByLabelText("Start Date"), "2026-08-10");
    await user.type(screen.getByLabelText("End Date"), "2026-08-20");
    await user.clear(screen.getByLabelText("Max Uses"));
    await user.type(screen.getByLabelText("Max Uses"), "5");
    await user.click(screen.getByLabelText("Haircut"));
    await user.click(screen.getByLabelText("Alex Barber"));
    await user.click(
      within(screen.getByRole("dialog", { name: "Create Promotion" })).getByRole("button", {
        name: "Create Promotion",
      })
    );

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/salons/salon-1/promotions", {
        title: "Spring Special",
        description: "Seasonal offer",
        discountType: "percentage",
        discountValue: 20,
        applicableServiceIds: ["service-1"],
        applicableBarberIds: ["barber-1"],
        startDate: "2026-08-10",
        endDate: "2026-08-20",
        maxUses: 5,
        code: "SPRING25",
      })
    );
    await waitFor(() =>
      expect(screen.getByText("Promotion created successfully.")).toBeInTheDocument()
    );
    expect(screen.queryByRole("dialog", { name: "Create Promotion" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit promotion Summer Special" }));
    await user.clear(screen.getByLabelText("Percentage"));
    await user.type(screen.getByLabelText("Percentage"), "25");
    await user.click(
      within(screen.getByRole("dialog", { name: "Edit Promotion" })).getByRole("button", {
        name: "Update Promotion",
      })
    );

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/salons/salon-1/promotions/promotion-1", {
        title: "Summer Special",
        description: "",
        discountType: "percentage",
        discountValue: 25,
        applicableServiceIds: ["service-1"],
        applicableBarberIds: ["barber-1"],
        startDate: null,
        endDate: null,
        maxUses: 10,
      })
    );
  });

  it("copies codes with the fallback path and clears the copied indicator", async () => {
    setBaseSalonResponses({
      promotions: [
        {
          _id: "promotion-1",
          title: "Summer Special",
          code: "SUMMER20",
          amount: 20,
          maxUses: 10,
          currentUses: 1,
          discountType: "percentage",
          applicableServiceIds: [{ _id: "service-1", name: "Haircut" }],
          applicableBarberIds: [{ _id: "barber-1", name: "Alex Barber" }],
          active: true,
          visibility: "public",
        },
      ],
    });
    const clipboardWriteText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteText },
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
    });

    renderManager();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "SUMMER20" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "SUMMER20" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(clipboardWriteText).toHaveBeenCalledWith("SUMMER20");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });
});
